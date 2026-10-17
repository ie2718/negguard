/** Reason enum — exact values from docs/waste-reason-enums.md */
export const WASTE_REASONS = [
  "zero_orders_high_spend",
  "zero_orders_high_clicks",
  "low_conv_high_spend",
  "irrelevant_modifier",
  "brand_competitor", // reserved: never fires while brand list is empty
] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const REASON_LABEL_ZH: Record<WasteReason, string> = {
  zero_orders_high_spend: "0 单·花费高",
  zero_orders_high_clicks: "0 单·点击多",
  low_conv_high_spend: "转化低·超目标 ACOS",
  irrelevant_modifier: "含无关修饰词",
  brand_competitor: "竞品/品牌词",
};

/** Week1: negativeExact only. negativePhrase = Week2 optional. */
export type MatchType = "negativeExact";

export type StrRow = {
  search_term: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number | null;
  campaign_name: string | null;
  ad_group_name: string | null;
};

export type AggregatedTerm = {
  search_term: string; // display form (first seen, trimmed)
  key: string; // normalized dedupe key
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number | null;
  campaigns: string[];
  row_count: number;
};

export type Candidate = {
  keyword: string;
  match_type: MatchType;
  reason: WasteReason;
  reason_label_zh: string;
  spend_wasted: number;
  spend: number;
  clicks: number;
  impressions: number;
  orders: number;
  sales: number | null;
  source_search_term: string;
  campaigns: string[];
};

export type Thresholds = {
  min_spend_zero_orders: number;
  min_clicks_zero_orders: number;
  min_spend_low_conv: number;
  max_acos: number;
  /** Terms with orders >= this are never proposed as negatives (bid down instead). */
  min_orders_protected: number;
  min_spend_irrelevant: number;
  min_spend_global: number;
  irrelevant_modifiers: string[];
  /** Attribute phrases that must not count as a modifier hit (e.g. "hands free"). Hyphens are treated as spaces. */
  irrelevant_modifier_exclusions: string[];
  /** e.g. ["used"] — only flagged as the first token */
  modifier_first_token_only: string[];
  /** e.g. ["free"] — "X free" / "X-free" is an attribute, not flagged */
  modifier_attribute_when_preceded: string[];
  /** preceding words that keep it a modifier, e.g. ["for"] → "for free" still flagged */
  modifier_attribute_preceding_allow: string[];
  brand_competitor_terms: string[];
};

/** Defaults from docs/waste-reason-enums.md */
export const DEFAULT_THRESHOLDS: Thresholds = {
  min_spend_zero_orders: 5,
  min_clicks_zero_orders: 10,
  min_spend_low_conv: 20,
  max_acos: 0.8,
  min_orders_protected: 2,
  min_spend_irrelevant: 2,
  min_spend_global: 1,
  irrelevant_modifiers: [
    "free", "used", "how to", "what is", "pdf", "jobs",
    "免费", "二手", "教程",
  ],
  irrelevant_modifier_exclusions: ["sugar free", "gluten free", "hands free", "bpa free"],
  modifier_first_token_only: ["used"],
  modifier_attribute_when_preceded: ["free"],
  modifier_attribute_preceding_allow: ["for"],
  brand_competitor_terms: [],
};

export type AnalysisSummary = {
  total_rows: number;
  unique_terms: number;
  total_spend: number;
  total_clicks: number;
  total_orders: number;
  candidate_count: number;
  total_spend_wasted: number;
  wasted_pct_of_spend: number;
  by_reason: Partial<Record<WasteReason, { count: number; spend_wasted: number }>>;
  /** Terms that matched a rule but look like ASINs — not exportable as negative keywords. */
  skipped_asin: { count: number; spend_wasted: number };
  /** Terms with orders >= min_orders_protected (never proposed as negatives). */
  protected_ordered_terms: number;
};

export type AnalysisResult = {
  /** ISO code, e.g. "USD" | "INR" (see lib/currency.ts) */
  currency: string;
  /** how the currency was determined: column | header | cells | override | default */
  currency_source: string;
  summary: AnalysisSummary;
  candidates: Candidate[];
  thresholds: Thresholds;
  rules_version: string;
};
