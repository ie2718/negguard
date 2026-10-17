/** STR header normalization + required column mapping (see docs/str-column-mapping.md) */

export type InternalField =
  | "search_term"
  | "impressions"
  | "clicks"
  | "spend"
  | "orders"
  | "sales"
  | "campaign_name"
  | "ad_group_name";

export const REQUIRED_FIELDS: InternalField[] = [
  "search_term",
  "impressions",
  "clicks",
  "spend",
  "orders",
];

/** Aliases after normalizeHeader */
const ALIASES: Record<InternalField, string[]> = {
  search_term: [
    "customersearchterm",
    "searchterm",
    "query",
    "kundensuchbegriff",  // DE
    "客户搜索词",
    "搜索词",
  ],
  impressions: ["impressions", "impressionen", "展示量", "曝光量"],
  clicks: ["clicks", "klicks", "点击量"],
  spend: [
    "spend", "cost", "totalspend", "totalcost",
    "ausgaben", "kosten", "gesamtkosten",  // DE
    "花费", "支出",
  ],
  orders: [
    "7daytotalorders",
    "7daytotalorders#",
    "14daytotalorders",       // Sponsored Brands / alternate attribution window
    "14daytotalorders#",
    "orders",
    "purchases",
    "bestellungen",           // DE
    "7tagegesamtbestellungen",
    "7tagegesamtbestellungen#",
    "14tagegesamtbestellungen",
    "14tagegesamtbestellungen#",
    "7天总订单数",
    "7天总订单数#",
    "14天总订单数",
    "14天总订单数#",
    "订单数",
  ],
  sales: [
    "7daytotalsales",
    "14daytotalsales",        // Sponsored Brands / alternate attribution window
    "sales", "totalsales",
    "verkaufserlose", "verkaufe", "umsatz",  // DE (umlauts stripped by normalizeHeader)
    "7tageverkaufserlose", "7tagegesamtverkaufe", "7tagegesamtverkaufserlose",
    "14tageverkaufserlose", "14tagegesamtverkaufserlose",
    "7天总销售额", "14天总销售额", "销售额",
  ],
  campaign_name: ["campaignname", "kampagnenname", "广告活动名称"],
  ad_group_name: ["adgroupname", "anzeigengruppenname", "广告组名称"],
};

const CURRENCY_CODES =
  "usd|eur|gbp|inr|cad|aud|jpy|mxn|brl|sek|pln|aed|sar|sgd|try|egp|rs\\.?";

/**
 * trim, lower, drop currency / "(informational only)" annotations,
 * strip spaces / underscores / hyphens / parentheses.
 *   "7 Day Total Sales (₹)" → "7daytotalsales"
 *   "Sales ($)"             → "sales"
 *   "Campaign Name (Informational only)" → "campaignname"
 *   "7 Day Total Orders (#)" → "7daytotalorders#"
 */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip combining marks: ö→o, ü→u, é→e …
    .replace(/ß/g, "ss")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(new RegExp(`\\(\\s*(?:[$€£¥₹]|${CURRENCY_CODES}|informational only|nur informational)\\s*\\)`, "g"), "")
    .replace(/[$€£¥₹]/g, "")
    .replace(/[\s_\-]+/g, "")
    .replace(/[()]/g, "");
}

export function mapHeaders(headers: string[]): {
  mappedColumns: Partial<Record<InternalField, string>>;
  missingRequired: InternalField[];
} {
  const normalizedToOriginal = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !normalizedToOriginal.has(n)) {
      normalizedToOriginal.set(n, h);
    }
  }

  const mappedColumns: Partial<Record<InternalField, string>> = {};
  for (const field of Object.keys(ALIASES) as InternalField[]) {
    for (const alias of ALIASES[field]) {
      const orig = normalizedToOriginal.get(normalizeHeader(alias));
      if (orig) {
        mappedColumns[field] = orig;
        break;
      }
    }
    // also try exact internal field name
    if (!mappedColumns[field]) {
      const orig = normalizedToOriginal.get(normalizeHeader(field));
      if (orig) mappedColumns[field] = orig;
    }
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => !mappedColumns[f]);
  return { mappedColumns, missingRequired };
}
