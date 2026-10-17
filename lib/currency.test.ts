import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { analyze, parseStrCsv, reasonTooltip, DEFAULT_THRESHOLDS, type StrRow } from "@/lib/analysis";
import {
  CURRENCY_CODES, CURRENCY_THRESHOLDS, currencyFromCell, currencyFromHeader, detectCurrency, formatMoney, thresholdsFor,
} from "@/lib/currency";
import { gridFromCsv, tableFromGrid } from "@/lib/tabular";

const tableOf = (csv: string) => tableFromGrid(gridFromCsv(csv));
const H = "Customer Search Term,Impressions,Clicks,Spend,Orders,Sales\n";

describe("currency detection", () => {
  it("cells: Rs./₹/INR → INR, $/US$ → USD, € → EUR, £ → GBP, ¥ → JPY, CA$ → CAD", () => {
    expect(currencyFromCell("Rs.8707.78")).toBe("INR");
    expect(currencyFromCell("Rs. 12")).toBe("INR");
    expect(currencyFromCell("₹1,000")).toBe("INR");
    expect(currencyFromCell("1,000 INR")).toBe("INR");
    expect(currencyFromCell("$5.00")).toBe("USD");
    expect(currencyFromCell("US$ 5")).toBe("USD");
    expect(currencyFromCell("€1.234,56")).toBe("EUR");
    expect(currencyFromCell("1.234,56 €")).toBe("EUR");
    expect(currencyFromCell("£12.30")).toBe("GBP");
    expect(currencyFromCell("¥1,200")).toBe("JPY");
    expect(currencyFromCell("CA$5")).toBe("CAD");
    expect(currencyFromCell("12.5")).toBeNull();
    expect(currencyFromCell(12.5)).toBeNull();
  });
  it("headers: '(₹)', '($)', '(USD)', '(INR)', '(€)'", () => {
    expect(currencyFromHeader("7 Day Total Sales (₹)")).toBe("INR");
    expect(currencyFromHeader("Sales ($)")).toBe("USD");
    expect(currencyFromHeader("Spend (EUR)")).toBe("EUR");
    expect(currencyFromHeader("Total cost (£)")).toBe("GBP");
    expect(currencyFromHeader("7 Day Total Orders (#)")).toBeNull();
  });
  it("priority: Currency column > header > cells > default", () => {
    expect(detectCurrency(tableOf("Customer Search Term,Impressions,Clicks,Spend,Orders,Currency\na,1,1,₹5,0,INR\n"))).toMatchObject({ currency: "INR", source: "column", mixed: false });
    expect(detectCurrency(tableOf("Customer Search Term,Impressions,Clicks,Spend,Orders,Sales (£)\na,1,1,£5,0,3\n"))).toMatchObject({ currency: "GBP", source: "header", mixed: false });
    expect(detectCurrency(tableOf(H + "a,1,1,€5,0,€3\nb,1,1,€2,0,€0\n"))).toMatchObject({ currency: "EUR", source: "cells", mixed: false });
    expect(detectCurrency(tableOf(H + "a,1,1,5,0,3\n"))).toMatchObject({ currency: "USD", source: "default", mixed: false, found: [] });
  });
  it("INR synthetic fixture → INR, not mixed", () => {
    const t = tableOf(readFileSync(path.join(__dirname, "../fixtures/sample-str-inr.csv"), "utf8"));
    expect(detectCurrency(t)).toMatchObject({ currency: "INR", mixed: false });
  });
  it("cells majority wins when a single currency dominates (no second currency)", () => {
    expect(detectCurrency(tableOf(H + "a,1,1,₹5,0,₹3\nb,1,1,₹2,0,₹1\nc,1,1,₹1,0,0\n"))).toMatchObject({ currency: "INR", mixed: false });
  });
});

describe("multi-currency reject (Day6)", () => {
  it("flags mixed when Currency column has ≥2 codes", () => {
    const d = detectCurrency(tableOf("Customer Search Term,Impressions,Clicks,Spend,Orders,Currency\na,1,1,5,0,USD\nb,1,1,5,0,INR\n"));
    expect(d.mixed).toBe(true);
    expect(d.found.sort()).toEqual(["INR", "USD"]);
  });
  it("flags mixed when cell symbols differ ($ vs ₹)", () => {
    const d = detectCurrency(tableOf(H + "a,1,1,$5,0,0\nb,1,1,₹100,0,0\n"));
    expect(d.mixed).toBe(true);
    expect(d.found.sort()).toEqual(["INR", "USD"]);
  });
  it("flags mixed when header currency disagrees with cell currency", () => {
    const d = detectCurrency(tableOf("Customer Search Term,Impressions,Clicks,Spend,Orders,Sales (£)\na,1,1,$5,0,3\n"));
    expect(d.mixed).toBe(true);
    expect(d.found).toEqual(expect.arrayContaining(["GBP", "USD"]));
  });
  it("single-currency file is not mixed", () => {
    expect(detectCurrency(tableOf(H + "a,1,1,€5,0,€3\n")).mixed).toBe(false);
  });
});

describe("formatMoney", () => {
  it("uses the report currency symbol with grouping", () => {
    expect(formatMoney(33765.42, "INR")).toBe("₹33,765.42");
    expect(formatMoney(1181.02, "USD")).toBe("$1,181.02");
    expect(formatMoney(5, "EUR")).toBe("€5.00");
    expect(formatMoney(12.3, "GBP")).toBe("£12.30");
    expect(formatMoney(1200.4, "JPY")).toBe("¥1,200");
    expect(formatMoney(-3.1, "USD")).toBe("-$3.10");
    expect(formatMoney(400, "INR", { compact: true })).toBe("₹400");
  });
  it("₹ never renders as $", () => {
    for (const n of [0, 1, 999.99, 1234567.89]) {
      const s = formatMoney(n, "INR");
      expect(s.startsWith("₹")).toBe(true);
      expect(s).not.toContain("$");
    }
  });
});

describe("per-currency thresholds", () => {
  it("USD equals DEFAULT_THRESHOLDS", () => {
    expect(thresholdsFor("USD")).toEqual(DEFAULT_THRESHOLDS);
  });
  it("INR ≈ ×80 on money keys; EUR/GBP same as USD; non-money keys unchanged", () => {
    expect(CURRENCY_THRESHOLDS.INR).toEqual({ min_spend_zero_orders: 400, min_spend_low_conv: 1600, min_spend_irrelevant: 160, min_spend_global: 80 });
    expect(CURRENCY_THRESHOLDS.EUR).toEqual(CURRENCY_THRESHOLDS.USD);
    expect(CURRENCY_THRESHOLDS.GBP).toEqual(CURRENCY_THRESHOLDS.USD);
    for (const c of CURRENCY_CODES) {
      const th = thresholdsFor(c);
      expect(th.max_acos).toBe(0.8);
      expect(th.min_clicks_zero_orders).toBe(10);
      expect(th.min_orders_protected).toBe(2);
    }
  });
  const row = (search_term: string, spend: number, clicks = 3, orders = 0, sales: number | null = 0): StrRow => ({
    search_term, impressions: 100, clicks, spend, orders, sales, campaign_name: null, ad_group_name: null,
  });
  it("₹50 zero-order term is waste in USD terms but not in INR", () => {
    const rows = [row("small inr term", 50)];
    expect(analyze(rows, {}, "USD").candidates).toHaveLength(1);
    expect(analyze(rows, {}, "INR").candidates).toHaveLength(0);
    expect(analyze([row("big inr term", 450)], {}, "INR").candidates[0].reason).toBe("zero_orders_high_spend");
  });
  it("result carries currency + source; explicit overrides still win", () => {
    const r = analyze([row("x", 300)], { min_spend_zero_orders: 100 }, "INR", "cells");
    expect(r).toMatchObject({ currency: "INR", currency_source: "cells" });
    expect(r.thresholds.min_spend_zero_orders).toBe(100);
    expect(r.candidates).toHaveLength(1);
  });
  it("tooltips show the currency symbol and per-currency threshold", () => {
    expect(reasonTooltip("zero_orders_high_spend", thresholdsFor("INR"), "INR")).toBe("花费 ≥ ₹400 且 0 订单");
    expect(reasonTooltip("zero_orders_high_spend", thresholdsFor("EUR"), "EUR")).toBe("花费 ≥ €5 且 0 订单");
  });
  it("INR fixture end-to-end with INR thresholds", () => {
    const p = parseStrCsv(readFileSync(path.join(__dirname, "../fixtures/sample-str-inr.csv"), "utf8"));
    const res = analyze(p.rows, {}, "INR", "cells");
    const kws = res.candidates.map((c) => c.keyword);
    expect(kws).toEqual(["widget stand", "widget holder"]); // ₹1,700.80 (ACOS 250%, 1 order, ≥ ₹1,600) then ₹1,234.50 0-order
  });
});
