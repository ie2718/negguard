import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/analysis/types";
import { mapHeaders } from "@/lib/str-columns";
import type { Table } from "@/lib/tabular";

export const CURRENCY_CODES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];
export type CurrencySource = "column" | "header" | "cells" | "override" | "default";

export type CurrencyDetection = {
  currency: CurrencyCode;
  source: CurrencySource;
  /** Every distinct currency found in the file (column + headers + cells). */
  found: CurrencyCode[];
  /** True when ≥2 distinct currencies appear — caller must reject the upload/job. */
  mixed: boolean;
};

export const MIXED_CURRENCY_ERROR =
  "检测到多种币种，请按站点分别导出后再上传。 / Multiple currencies detected — please export one marketplace at a time.";

export const isCurrencyCode = (v: unknown): v is CurrencyCode =>
  typeof v === "string" && (CURRENCY_CODES as readonly string[]).includes(v);

type MoneyKey = "min_spend_zero_orders" | "min_spend_low_conv" | "min_spend_irrelevant" | "min_spend_global";

/**
 * Static per-currency money thresholds (no live FX). USD = DEFAULT_THRESHOLDS.
 * Rounded "nice" values from fixed multipliers: EUR/GBP ×1, CAD ×1.4, AUD ×1.5, INR ×80, JPY ×150.
 * Non-money thresholds (clicks, max_acos, orders) are currency-independent.
 * Documented in docs/currency-thresholds.md — keep in sync.
 */
export const CURRENCY_THRESHOLDS: Record<CurrencyCode, Record<MoneyKey, number>> = {
  USD: { min_spend_zero_orders: 5, min_spend_low_conv: 20, min_spend_irrelevant: 2, min_spend_global: 1 },
  EUR: { min_spend_zero_orders: 5, min_spend_low_conv: 20, min_spend_irrelevant: 2, min_spend_global: 1 },
  GBP: { min_spend_zero_orders: 5, min_spend_low_conv: 20, min_spend_irrelevant: 2, min_spend_global: 1 },
  CAD: { min_spend_zero_orders: 7, min_spend_low_conv: 28, min_spend_irrelevant: 3, min_spend_global: 1.5 },
  AUD: { min_spend_zero_orders: 7.5, min_spend_low_conv: 30, min_spend_irrelevant: 3, min_spend_global: 1.5 },
  INR: { min_spend_zero_orders: 400, min_spend_low_conv: 1600, min_spend_irrelevant: 160, min_spend_global: 80 },
  JPY: { min_spend_zero_orders: 750, min_spend_low_conv: 3000, min_spend_irrelevant: 300, min_spend_global: 150 },
};

export function thresholdsFor(currency: CurrencyCode): Thresholds {
  return { ...DEFAULT_THRESHOLDS, ...CURRENCY_THRESHOLDS[currency] };
}

/* ---------------- display ---------------- */

const SYMBOL: Record<CurrencyCode, string> = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹", CAD: "CA$", AUD: "A$", JPY: "¥",
};
export const currencySymbol = (c: CurrencyCode) => SYMBOL[c];

/** "₹33,765.42", "$1,181.02", "€5", "¥1,200". Deterministic (no locale lookup) so SSR = client. */
export function formatMoney(n: number, currency: CurrencyCode = "USD", opts: { compact?: boolean } = {}): string {
  const decimals = currency === "JPY" ? 0 : opts.compact && Number.isInteger(n) ? 0 : 2;
  const neg = n < 0;
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${SYMBOL[currency]}${grouped}${frac ? `.${frac}` : ""}`;
}

/* ---------------- detection ---------------- */

const CODE_ALIASES: [RegExp, CurrencyCode][] = [
  [/^(?:inr|rs\.?|₹)$/i, "INR"],
  [/^(?:usd|us\$|\$)$/i, "USD"],
  [/^(?:eur|€)$/i, "EUR"],
  [/^(?:gbp|£)$/i, "GBP"],
  [/^(?:cad|ca\$|c\$)$/i, "CAD"],
  [/^(?:aud|au\$|a\$)$/i, "AUD"],
  [/^(?:jpy|¥|￥)$/i, "JPY"],
];
function codeFromToken(tok: string): CurrencyCode | null {
  const t = tok.trim();
  for (const [re, c] of CODE_ALIASES) if (re.test(t)) return c;
  return null;
}

/** Currency marker inside a money cell: prefix or suffix. Order matters (CA$ before $). */
const CELL_PATTERNS: [RegExp, CurrencyCode][] = [
  [/^\s*-?\s*(?:rs\.?|inr|₹)|(?:₹|\binr|\brs\.?)\s*$/i, "INR"],
  [/^\s*-?\s*(?:ca\$|c\$|cad)|\bcad\s*$/i, "CAD"],
  [/^\s*-?\s*(?:au\$|a\$|aud)|\baud\s*$/i, "AUD"],
  [/^\s*-?\s*(?:€|eur)|(?:€|\beur)\s*$/i, "EUR"],
  [/^\s*-?\s*(?:£|gbp)|(?:£|\bgbp)\s*$/i, "GBP"],
  [/^\s*-?\s*(?:¥|￥|jpy)|(?:¥|\bjpy)\s*$/i, "JPY"],
  [/^\s*-?\s*(?:us\$|\$|usd)|\busd\s*$/i, "USD"],
];
export function currencyFromCell(v: unknown): CurrencyCode | null {
  if (typeof v !== "string") return null;
  for (const [re, c] of CELL_PATTERNS) if (re.test(v)) return c;
  return null;
}

/** "7 Day Total Sales (₹)" / "Spend (USD)" → code */
export function currencyFromHeader(h: string): CurrencyCode | null {
  const m = /[（(]\s*([^()（）]{1,5})\s*[)）]\s*$/.exec(h.trim());
  return m ? codeFromToken(m[1]) : null;
}

function mostCommon<T>(items: T[]): T | null {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  let best: T | null = null, n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

const SCAN_ROWS = 500;

/**
 * Detect report currency. Priority for the *primary* currency:
 *  1. a "Currency" column (most common recognised value)
 *  2. currency in money-column headers, e.g. "7 Day Total Sales (₹)"
 *  3. currency symbols / codes in spend / sales cells (first 500 rows)
 *  4. default USD (source = "default" → UI shows a notice)
 *
 * `found` unions currencies from all three sources. If `mixed` (found.length ≥ 2),
 * the upload/job must be rejected — do not split into multiple results.
 */
export function detectCurrency(table: Pick<Table, "headers" | "records">): CurrencyDetection {
  const curCol = table.headers.find((h) => /^currency(code)?$/i.test(h.replace(/[\s_-]/g, "")) || h.trim() === "币种" || h.trim() === "货币");
  const sample = table.records.slice(0, SCAN_ROWS);
  const foundSet = new Set<CurrencyCode>();

  let fromColumn: CurrencyCode | null = null;
  if (curCol) {
    const colCodes = sample.map((r) => codeFromToken(String(r[curCol] ?? ""))).filter((x): x is CurrencyCode => !!x);
    for (const c of colCodes) foundSet.add(c);
    fromColumn = mostCommon(colCodes);
  }

  const { mappedColumns: m } = mapHeaders(table.headers);
  const moneyCols = [m.spend, m.sales].filter((x): x is string => !!x);
  const moneyHeaders = [...moneyCols, ...table.headers.filter((h) => /cost|spend|sales|cpc|budget|bid|花费|销售|ausgaben|verkauf|umsatz/i.test(h))];
  const headerCodes = moneyHeaders.map(currencyFromHeader).filter((x): x is CurrencyCode => !!x);
  for (const c of headerCodes) foundSet.add(c);
  const fromHeaders = mostCommon(headerCodes);

  const cells: CurrencyCode[] = [];
  for (const r of sample) for (const col of moneyCols) {
    const c = currencyFromCell(r[col]);
    if (c) { cells.push(c); foundSet.add(c); }
  }
  const fromCells = mostCommon(cells);

  const found = [...foundSet];
  const mixed = found.length >= 2;

  if (fromColumn) return { currency: fromColumn, source: "column", found, mixed };
  if (fromHeaders) return { currency: fromHeaders, source: "header", found, mixed };
  if (fromCells) return { currency: fromCells, source: "cells", found, mixed };
  return { currency: "USD", source: "default", found, mixed };
}
