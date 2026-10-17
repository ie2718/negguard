import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { aggregateTerms, analyze, classify, matchesModifier } from "./engine";
import { parseNumber, parseStrCsv } from "./parse";
import { reasonTooltip } from "./labels";
import { DEFAULT_THRESHOLDS, WASTE_REASONS, type StrRow } from "./types";

const row = (p: Partial<StrRow> & { search_term: string }): StrRow => ({
  impressions: 100, clicks: 0, spend: 0, orders: 0, sales: null,
  campaign_name: null, ad_group_name: null, ...p,
});

const fixture = readFileSync(path.join(__dirname, "../../fixtures/sample-str.csv"), "utf8");

describe("parseNumber", () => {
  it("strips currency / thousands / parens", () => {
    expect(parseNumber("$1,250.00")).toBe(1250);
    expect(parseNumber("€12,50")).toBe(12.5);
    expect(parseNumber("(3.10)")).toBe(-3.1);
    expect(parseNumber("")).toBe(0);
    expect(parseNumber("-")).toBe(0);
  });
});

describe("aggregateTerms", () => {
  it("merges case/whitespace duplicates across campaigns", () => {
    const agg = aggregateTerms([
      row({ search_term: "Foo Bar", clicks: 3, spend: 2, campaign_name: "A" }),
      row({ search_term: "foo  bar ", clicks: 4, spend: 3.5, campaign_name: "B" }),
    ]);
    expect(agg).toHaveLength(1);
    expect(agg[0]).toMatchObject({ key: "foo bar", clicks: 7, spend: 5.5, row_count: 2, campaigns: ["A", "B"] });
  });
});

describe("classify rules", () => {
  const th = DEFAULT_THRESHOLDS;
  const one = (r: StrRow) => classify(aggregateTerms([r])[0], th);

  it("zero_orders_high_spend: spend >= 5, 0 orders", () => {
    expect(one(row({ search_term: "x", spend: 5, clicks: 2 }))?.reason).toBe("zero_orders_high_spend");
  });
  it("zero_orders_high_clicks: clicks >= 10 AND spend >= half of min_spend_zero_orders", () => {
    expect(one(row({ search_term: "x", spend: 2.5, clicks: 10 }))?.reason).toBe("zero_orders_high_clicks");
    expect(one(row({ search_term: "x", spend: 4, clicks: 10 }))?.reason).toBe("zero_orders_high_clicks");
  });
  it("zero_orders_high_clicks: clicks ok but spend below half-floor → none", () => {
    expect(one(row({ search_term: "x", spend: 2.49, clicks: 50 }))).toBeNull();
    expect(one(row({ search_term: "x", spend: 1, clicks: 100 }))).toBeNull();
  });
  it("INR click floor is ₹200 (= half of ₹400)", () => {
    const inr = { ...th, min_spend_zero_orders: 400, min_spend_global: 80 };
    expect(classify(aggregateTerms([row({ search_term: "x", spend: 199, clicks: 40 })])[0], inr)).toBeNull();
    expect(classify(aggregateTerms([row({ search_term: "y", spend: 200, clicks: 40 })])[0], inr)?.reason).toBe("zero_orders_high_clicks");
  });
  it("below both zero-order thresholds → none", () => {
    expect(one(row({ search_term: "x", spend: 4.9, clicks: 9 }))).toBeNull();
  });
  it("low conversion rate alone no longer triggers (ACOS-only rule)", () => {
    // 1 order, CR 2.5%, no sales column → cannot compute ACOS → not a candidate
    expect(one(row({ search_term: "x", spend: 25, clicks: 40, orders: 1, sales: null }))).toBeNull();
    // 1 order, CR 1%, ACOS 20% → healthy despite low CR
    expect(one(row({ search_term: "x", spend: 20, clicks: 100, orders: 1, sales: 100 }))).toBeNull();
  });
  it("low_conv_high_spend via ACOS > 80% (orders = 1), wasted = spend - sales*max_acos", () => {
    const c = one(row({ search_term: "x", spend: 30, clicks: 10, orders: 1, sales: 25 }));
    expect(c?.reason).toBe("low_conv_high_spend");
    expect(c?.spend_wasted).toBeCloseTo(10);
  });
  it("orders = 1 with sales 0 → ACOS ∞ → full spend wasted", () => {
    expect(one(row({ search_term: "x", spend: 22, clicks: 10, orders: 1, sales: 0 }))).toMatchObject({ reason: "low_conv_high_spend", spend_wasted: 22 });
  });
  it("terms with orders >= 2 are never candidates, even with terrible ACOS", () => {
    expect(one(row({ search_term: "x", spend: 300, clicks: 200, orders: 2, sales: 20 }))).toBeNull();
    expect(one(row({ search_term: "core seller term", spend: 400, clicks: 250, orders: 20, sales: 200 }))).toBeNull();
  });
  it("min_orders_protected is configurable", () => {
    const t = aggregateTerms([row({ search_term: "x", spend: 300, clicks: 200, orders: 2, sales: 20 })])[0];
    expect(classify(t, { ...th, min_orders_protected: 3 })?.reason).toBe("low_conv_high_spend");
  });
  it("healthy converting term → none", () => {
    expect(one(row({ search_term: "x", spend: 100, clicks: 100, orders: 20, sales: 1000 }))).toBeNull();
  });
  it("irrelevant_modifier: orders = 0, spend >= 2, word-boundary match", () => {
    expect(one(row({ search_term: "used widget", spend: 2, clicks: 1 }))).toMatchObject({ reason: "irrelevant_modifier", spend_wasted: 2 });
    expect(one(row({ search_term: "used widget", spend: 1.5, clicks: 1 }))).toBeNull();
    expect(one(row({ search_term: "unused widget", spend: 3, clicks: 1 }))).toBeNull();
    expect(one(row({ search_term: "freestyle earbuds", spend: 3, clicks: 1 }))).toBeNull();
  });
  it("irrelevant_modifier never fires when the term has orders", () => {
    expect(one(row({ search_term: "used widget", spend: 3, clicks: 2, orders: 1, sales: 40 }))).toBeNull();
  });
  it("low-conv wasted uses configured max_acos, not a hard-coded 0.80", () => {
    const t = aggregateTerms([row({ search_term: "x", spend: 30, clicks: 10, orders: 1, sales: 25 })])[0];
    expect(classify(t, { ...th, max_acos: 0.5 })?.spend_wasted).toBeCloseTo(17.5);
    expect(classify(t, { ...th, max_acos: 1.5 })).toBeNull(); // ACOS 120% < 150%
  });
  it("candidates never have spend_wasted <= 0", () => {
    const res = analyze([
      row({ search_term: "a", spend: 20, clicks: 100, orders: 1, sales: 100 }),
      row({ search_term: "b", spend: 25, clicks: 5, orders: 1, sales: 31.25 }), // ACOS exactly 80% → not > 80%
      row({ search_term: "c", spend: 6, clicks: 3 }),
    ]);
    expect(res.candidates.map((c) => c.keyword)).toEqual(["c"]);
    expect(res.candidates.every((c) => c.spend_wasted > 0)).toBe(true);
  });
  it("multi-rule match: primary reason only, wasted not summed", () => {
    // 0 orders + spend>=5 + clicks>=10 + modifier → zero_orders_high_spend, wasted = spend once
    const c = one(row({ search_term: "free earbuds", spend: 8, clicks: 15 }));
    expect(c).toMatchObject({ reason: "zero_orders_high_spend", spend_wasted: 8 });
  });
  it("min_spend_global gates everything", () => {
    expect(one(row({ search_term: "x", spend: 0.5, clicks: 50 }))).toBeNull();
  });
  it("brand_competitor reserved: fires only when list configured", () => {
    const t = aggregateTerms([row({ search_term: "airpods pro", spend: 3, clicks: 2 })])[0];
    expect(classify(t, th)).toBeNull();
    expect(classify(t, { ...th, brand_competitor_terms: ["airpods"] })?.reason).toBe("brand_competitor");
  });
  it("thresholds are configurable", () => {
    const t = aggregateTerms([row({ search_term: "x", spend: 4, clicks: 3 })])[0];
    expect(classify(t, th)).toBeNull();
    expect(classify(t, { ...th, min_spend_zero_orders: 3 })?.reason).toBe("zero_orders_high_spend");
  });
});

describe("labels / defaults", () => {
  it("tooltips are built from config thresholds", () => {
    expect(reasonTooltip("zero_orders_high_spend", DEFAULT_THRESHOLDS)).toBe("花费 ≥ $5 且 0 订单");
    expect(reasonTooltip("zero_orders_high_clicks", { ...DEFAULT_THRESHOLDS, min_clicks_zero_orders: 15 })).toBe("点击 ≥ 15、花费 ≥ $2.50 且 0 订单");
    expect(reasonTooltip("zero_orders_high_clicks", { ...DEFAULT_THRESHOLDS, min_spend_zero_orders: 400, min_clicks_zero_orders: 10 }, "INR")).toContain("₹200");
    const lc = reasonTooltip("low_conv_high_spend", { ...DEFAULT_THRESHOLDS, max_acos: 0.6 });
    expect(lc).toContain("ACOS > 60%");
    expect(lc).not.toContain("80%");
  });
  it("toy is not a default irrelevant modifier", () => {
    expect(DEFAULT_THRESHOLDS.irrelevant_modifiers).not.toContain("toy");
    const t = aggregateTerms([row({ search_term: "dog toy", spend: 3, clicks: 2 })])[0];
    expect(classify(t, DEFAULT_THRESHOLDS)).toBeNull();
  });
});

describe("modifier list & matching", () => {
  const th = DEFAULT_THRESHOLDS;
  const one = (term: string) => classify(aggregateTerms([row({ search_term: term, spend: 3, clicks: 2 })])[0], th);

  it("default list is the agreed tightened set", () => {
    expect([...th.irrelevant_modifiers].sort()).toEqual(
      ["free", "used", "how to", "what is", "pdf", "jobs", "免费", "二手", "教程"].sort()
    );
    for (const gone of ["repair", "维修", "manual", "diy", "rental", "wholesale", "cheap", "cheapest", "toy"])
      expect(th.irrelevant_modifiers).not.toContain(gone);
  });
  it("removed modifiers no longer fire", () => {
    for (const t of ["earbuds repair kit", "cheap earbuds", "diy earbuds", "earbuds manual"]) expect(one(t)).toBeNull();
  });
  it("whole word / phrase only", () => {
    expect(one("how to pair earbuds")?.reason).toBe("irrelevant_modifier");
    expect(one("earbuds pdf")?.reason).toBe("irrelevant_modifier");
    expect(one("showto earbuds")).toBeNull();
    expect(one("pdfs earbuds")).toBeNull();
  });
  it("free attribute phrases are excluded (incl. hyphenated)", () => {
    for (const t of ["hands free earbuds", "hands-free earbuds", "sugar free gum", "sugar-free gum", "gluten free snacks", "bpa free bottle", "BPA-Free bottle"])
      expect(one(t), t).toBeNull();
  });
  it("free still fires on its own, even next to an excluded phrase", () => {
    expect(one("free earbuds")?.reason).toBe("irrelevant_modifier");
    expect(one("free hands free earbuds")?.reason).toBe("irrelevant_modifier");
  });
  it("'X free' / 'X-free' (free preceded by a word) is an attribute, not flagged", () => {
    for (const t of ["gmo free tea", "gmo-free tea", "preservatives free snack", "cruelty free shampoo", "earbuds free shipping", "lead-free solder"])
      expect(one(t), t).toBeNull();
  });
  it("free as first token, or 'for free', is flagged", () => {
    expect(one("free earbuds")?.reason).toBe("irrelevant_modifier");
    expect(one("earbuds for free")?.reason).toBe("irrelevant_modifier");
  });
  it("used only as first token", () => {
    expect(one("used earbuds")?.reason).toBe("irrelevant_modifier");
    expect(one("used-earbuds")?.reason).toBe("irrelevant_modifier");
    expect(one("harry potter wand that can be used with paper")).toBeNull();
    expect(one("most used earbuds")).toBeNull();
  });
  it("position rules are configurable", () => {
    expect(matchesModifier("gmo free tea", ["free"], [], {})).toBe(true);
    expect(matchesModifier("gmo free tea", ["free"], [], { attribute_when_preceded: ["free"] })).toBe(false);
    expect(matchesModifier("can be used with", ["used"], [], { first_token_only: [] })).toBe(true);
    expect(matchesModifier("can be used with", ["used"], [], { first_token_only: ["used"] })).toBe(false);
  });
  it("exclusions are configurable", () => {
    expect(matchesModifier("hands free earbuds", ["free"], [])).toBe(true);
    expect(matchesModifier("hands free earbuds", ["free"], ["hands free"])).toBe(false);
  });
  it("CJK modifiers match", () => {
    expect(one("二手耳机")?.reason).toBe("irrelevant_modifier");
  });
});

describe("analyze(fixture)", () => {
  const { rows, missingRequired } = parseStrCsv(fixture);
  const res = analyze(rows);
  const byKw = Object.fromEntries(res.candidates.map((c) => [c.keyword, c]));

  it("parses fixture with all required columns", () => {
    expect(missingRequired).toEqual([]);
    expect(rows).toHaveLength(15);
    expect(res.summary.unique_terms).toBe(14);
  });
  it("finds expected candidates with correct reasons", () => {
    expect(byKw["earbuds for sleeping"]).toMatchObject({ reason: "zero_orders_high_spend", spend_wasted: 18.4, clicks: 28 });
    expect(byKw["bluetooth headphones kids"]?.reason).toBe("zero_orders_high_clicks");
    expect(byKw["noise cancelling earbuds"]?.reason).toBe("low_conv_high_spend");
    expect(byKw["free earbuds"]).toMatchObject({ reason: "irrelevant_modifier", spend_wasted: 2.5 });
    expect(byKw["earbuds with mic, waterproof"]?.reason).toBe("low_conv_high_spend");
  });
  it("excludes healthy / tiny / reserved terms", () => {
    for (const k of ["wireless earbuds", "sport earbuds", "earbud case", "airpods pro", "cheap earbuds", "earbuds repair kit", "hands free earbuds"]) expect(byKw[k]).toBeUndefined();
  });
  it("ASIN term skipped and counted; ordered (>=2) term protected", () => {
    expect(byKw["b0abc12345"]).toBeUndefined();
    expect(res.summary.skipped_asin).toEqual({ count: 1, spend_wasted: 9 });
    expect(byKw["premium earbuds gift"]).toBeUndefined();
    expect(res.candidates.some((c) => c.orders >= 2)).toBe(false);
  });
  it("fixture totals: 5 candidates, $55.11 wasted", () => {
    expect(res.summary.candidate_count).toBe(5);
    expect(res.summary.total_spend_wasted).toBe(55.11);
    expect(res.candidates.every((c) => c.spend_wasted > 0)).toBe(true);
  });
  it("all candidates are negativeExact with valid reason enum, sorted by spend_wasted", () => {
    for (const c of res.candidates) {
      expect(c.match_type).toBe("negativeExact");
      expect(WASTE_REASONS).toContain(c.reason);
    }
    const w = res.candidates.map((c) => c.spend_wasted);
    expect([...w].sort((a, b) => b - a)).toEqual(w);
  });
  it("missing required columns reported", () => {
    expect(parseStrCsv("Foo,Clicks\na,1\n").missingRequired).toContain("search_term");
  });
});
