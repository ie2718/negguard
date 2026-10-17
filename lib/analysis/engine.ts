import { thresholdsFor, type CurrencyCode, type CurrencySource } from "@/lib/currency";
import {
  REASON_LABEL_ZH,
  type AggregatedTerm,
  type AnalysisResult,
  type Candidate,
  type StrRow,
  type Thresholds,
  type WasteReason,
} from "./types";

export const RULES_VERSION = "w1-2026.10.17e";

/** Amazon ASIN-looking search term (product-targeting traffic). Needs negative product targeting, not a negative keyword. */
export const ASIN_RE = /^b0[0-9a-z]{8}$/i;
export const isAsinTerm = (term: string) => ASIN_RE.test(term.trim());

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeTerm(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Aggregate duplicate search terms (across campaigns/ad groups). */
export function aggregateTerms(rows: StrRow[]): AggregatedTerm[] {
  const map = new Map<string, AggregatedTerm>();
  for (const r of rows) {
    const key = normalizeTerm(r.search_term);
    if (!key) continue;
    let a = map.get(key);
    if (!a) {
      a = {
        search_term: r.search_term.trim().replace(/\s+/g, " "),
        key, impressions: 0, clicks: 0, spend: 0, orders: 0,
        sales: null, campaigns: [], row_count: 0,
      };
      map.set(key, a);
    }
    a.impressions += r.impressions;
    a.clicks += r.clicks;
    a.spend += r.spend;
    a.orders += r.orders;
    if (r.sales !== null) a.sales = (a.sales ?? 0) + r.sales;
    if (r.campaign_name && !a.campaigns.includes(r.campaign_name)) a.campaigns.push(r.campaign_name);
    a.row_count += 1;
  }
  return [...map.values()];
}

/** For modifier matching: lowercase, hyphens → spaces, collapse whitespace. */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[-‐-―]+/g, " ").replace(/\s+/g, " ").trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whole-word / whole-phrase match for Latin terms (word boundaries, hyphen = space);
 * CJK terms have no word boundaries, so they match as substrings.
 * Exclusion phrases (e.g. "hands free") are blanked out before matching.
 */
export type ModifierPositionRules = {
  /** Modifiers that only count as the first token ("used earbuds", not "can be used with"). */
  first_token_only?: string[];
  /** Modifiers that are an attribute when another word precedes them ("sugar free", "gmo-free"). */
  attribute_when_preceded?: string[];
  /** Preceding words that do NOT make it an attribute ("for free"). */
  attribute_preceding_allow?: string[];
};

export function matchesModifier(
  term: string,
  modifiers: string[],
  exclusions: string[] = [],
  rules: ModifierPositionRules = {}
): boolean {
  let text = ` ${normalizeForMatch(term)} `;
  const firstOnly = new Set((rules.first_token_only ?? []).map(normalizeForMatch));
  const attr = new Set((rules.attribute_when_preceded ?? []).map(normalizeForMatch));
  const allow = new Set((rules.attribute_preceding_allow ?? []).map(normalizeForMatch));
  for (const ex of exclusions) {
    const e = normalizeForMatch(ex);
    if (!e) continue;
    text = text.replace(new RegExp(`(?<![a-z0-9])${escapeRe(e)}(?![a-z0-9])`, "g"), " | ");
  }
  return modifiers.some((m) => {
    const n = normalizeForMatch(m);
    if (!n) return false;
    if (/[^\x00-\x7f]/.test(n)) return text.includes(n);
    const re = new RegExp(`(?<![a-z0-9])${escapeRe(n)}(?![a-z0-9])`, "g");
    for (const mt of text.matchAll(re)) {
      const before = text.slice(0, mt.index).trim();
      const prevToken = before.split(" ").pop() ?? "";
      if (firstOnly.has(n) && before !== "") continue;
      if (attr.has(n) && before !== "" && !allow.has(prevToken)) continue;
      return true;
    }
    return false;
  });
}

function containsTerm(haystack: string, needle: string): boolean {
  const n = normalizeTerm(needle);
  if (!n) return false;
  // CJK: substring; Latin: word boundary
  if (/[^\x00-\x7f]/.test(n)) return haystack.includes(n);
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(haystack);
}

/**
 * Classify one aggregated term. Returns the FIRST matching (primary) reason in
 * priority order; spend_wasted comes from that reason only (never summed).
 * Low-conv: ACOS-only trigger (no conversion-rate trigger);
 *   wasted = max(0, spend - sales * th.max_acos) — max_acos from config.
 * Terms with orders >= th.min_orders_protected are never candidates.
 * A result with spend_wasted <= 0 is not a candidate.
 */
export function classify(
  t: AggregatedTerm,
  th: Thresholds
): { reason: WasteReason; spend_wasted: number } | null {
  if (t.spend < th.min_spend_global) return null;
  if (t.orders >= th.min_orders_protected) return null;
  const r = classifyRaw(t, th);
  return r && r.spend_wasted > 0 ? r : null;
}

function classifyRaw(
  t: AggregatedTerm,
  th: Thresholds
): { reason: WasteReason; spend_wasted: number } | null {

  if (t.orders <= 0) {
    if (t.spend >= th.min_spend_zero_orders)
      return { reason: "zero_orders_high_spend", spend_wasted: t.spend };
    // Click rule also needs a spend floor (= half of the currency's 0-order spend threshold)
    // so INR reports don't flag ₹5 / 10-click noise as waste.
    if (
      t.clicks >= th.min_clicks_zero_orders &&
      t.spend >= th.min_spend_zero_orders / 2
    )
      return { reason: "zero_orders_high_clicks", spend_wasted: t.spend };
  } else if (t.spend >= th.min_spend_low_conv) {
    // ACOS-only trigger; needs a sales column (sales 0 with orders → ACOS = ∞)
    if (t.sales !== null) {
      const acos = t.sales > 0 ? t.spend / t.sales : Infinity;
      if (acos > th.max_acos) {
        return { reason: "low_conv_high_spend", spend_wasted: Math.max(0, t.spend - t.sales * th.max_acos) };
      }
    }
  }

  if (th.brand_competitor_terms.some((b) => containsTerm(t.key, b)))
    return { reason: "brand_competitor", spend_wasted: t.orders <= 0 ? t.spend : 0 };

  // irrelevant_modifier: ONLY when orders = 0 (architect rule)
  if (
    t.orders <= 0 &&
    t.spend >= th.min_spend_irrelevant &&
    matchesModifier(t.key, th.irrelevant_modifiers, th.irrelevant_modifier_exclusions, {
      first_token_only: th.modifier_first_token_only,
      attribute_when_preceded: th.modifier_attribute_when_preceded,
      attribute_preceding_allow: th.modifier_attribute_preceding_allow,
    })
  )
    return { reason: "irrelevant_modifier", spend_wasted: t.spend };

  return null;
}

export function analyze(
  rows: StrRow[],
  overrides: Partial<Thresholds> = {},
  currency: CurrencyCode = "USD",
  currency_source: CurrencySource = "default"
): AnalysisResult {
  const th: Thresholds = { ...thresholdsFor(currency), ...overrides };
  const terms = aggregateTerms(rows);

  const candidates: Candidate[] = [];
  const skipped_asin = { count: 0, spend_wasted: 0 };
  let protected_ordered_terms = 0;
  for (const t of terms) {
    if (t.orders >= th.min_orders_protected) protected_ordered_terms++;
    const c = classify(t, th);
    if (!c) continue;
    if (isAsinTerm(t.key)) {
      skipped_asin.count++;
      skipped_asin.spend_wasted = round2(skipped_asin.spend_wasted + c.spend_wasted);
      continue;
    }
    candidates.push({
      keyword: t.key,
      match_type: "negativeExact",
      reason: c.reason,
      reason_label_zh: REASON_LABEL_ZH[c.reason],
      spend_wasted: round2(c.spend_wasted),
      spend: round2(t.spend),
      clicks: t.clicks,
      impressions: t.impressions,
      orders: t.orders,
      sales: t.sales === null ? null : round2(t.sales),
      source_search_term: t.search_term,
      campaigns: t.campaigns,
    });
  }
  candidates.sort((a, b) => b.spend_wasted - a.spend_wasted || b.clicks - a.clicks);

  const total_spend = terms.reduce((s, t) => s + t.spend, 0);
  const total_spend_wasted = candidates.reduce((s, c) => s + c.spend_wasted, 0);
  const by_reason: AnalysisResult["summary"]["by_reason"] = {};
  for (const c of candidates) {
    const r = (by_reason[c.reason] ??= { count: 0, spend_wasted: 0 });
    r.count += 1;
    r.spend_wasted = round2(r.spend_wasted + c.spend_wasted);
  }

  return {
    currency,
    currency_source,
    summary: {
      total_rows: rows.length,
      unique_terms: terms.length,
      total_spend: round2(total_spend),
      total_clicks: terms.reduce((s, t) => s + t.clicks, 0),
      total_orders: terms.reduce((s, t) => s + t.orders, 0),
      candidate_count: candidates.length,
      total_spend_wasted: round2(total_spend_wasted),
      wasted_pct_of_spend: total_spend > 0 ? round2((total_spend_wasted / total_spend) * 100) : 0,
      by_reason,
      skipped_asin,
      protected_ordered_terms,
    },
    candidates,
    thresholds: th,
    rules_version: RULES_VERSION,
  };
}
