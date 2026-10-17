import { mapHeaders } from "@/lib/str-columns";
import { gridFromCsv, tableFromGrid, type Table } from "@/lib/tabular";
import type { StrRow } from "./types";

const CODES = "rs\\.?|inr|usd|eur|gbp|cad|aud|jpy|mxn|brl|sek|pln|aed|sar|sgd|try|egp|zł|kr";
const CURRENCY_PREFIX = new RegExp(`^(?:us\\$|ca\\$|c\\$|au\\$|a\\$|r\\$|mx\\$|s\\$|${CODES}|[$€£¥₹])\\s*`, "i");
const CURRENCY_SUFFIX = new RegExp(`\\s*(?:${CODES}|[$€£¥₹])$`, "i");

/**
 * Parse a numeric/money cell.
 *  - returns `null` for empty cells ("", "-", "—")
 *  - returns `NaN` when the cell has content but isn't a number
 * Handles currency prefixes/suffixes (Rs. ₹ $ € £ ¥ INR USD US$ …), thousands
 * separators, EU decimals ("1.234,56"), parentheses negatives, trailing %.
 */
export function tryParseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v).trim();
  if (!s || s === "-" || s === "—" || s === "–") return null;

  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
  for (let i = 0; i < 2; i++) s = s.replace(CURRENCY_PREFIX, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
  s = s.replace(/%$/, "").replace(CURRENCY_SUFFIX, "");
  s = s.replace(/[\s\u00a0\u202f']/g, ""); // spaces / apostrophes as thousands separators

  if (!/^\d[\d.,]*$|^[.,]\d+$/.test(s)) return NaN;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // whichever comes last is the decimal separator
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // US thousands "1,234,567" OR EU decimal "12,50" / "1.234,56" already handled above
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(/,(?=\d+$)/, ".").replace(/,/g, "");
  } else if ((s.match(/\./g) ?? []).length >= 1) {
    // EU thousands without decimals: "1.234" / "1.234.567" (every group after the first is exactly 3 digits)
    // US decimal "1.23" / "12.5" keeps the dot (last group length ≠ 3, or single short fractional).
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

/** Lenient: empty or unparseable → 0. */
export function parseNumber(v: unknown): number {
  const n = tryParseNumber(v);
  return n === null || Number.isNaN(n) ? 0 : n;
}

export type ParseResult = {
  rows: StrRow[];
  missingRequired: string[];
  totalRows: number;
  /** Set when the file cannot be analysed reliably (e.g. spend column unreadable). */
  error: string | null;
  spendStats: { nonEmpty: number; unparseable: number; total: number; sample: string | null };
};

/** Max share of non-empty spend cells allowed to be unparseable before the job fails. */
export const MAX_SPEND_UNPARSEABLE_RATIO = 0.05;

export function rowsFromTable(table: Table): ParseResult {
  const { mappedColumns: m, missingRequired } = mapHeaders(table.headers);
  const spendStats = { nonEmpty: 0, unparseable: 0, total: 0, sample: null as string | null };
  if (missingRequired.length) {
    return { rows: [], missingRequired, totalRows: table.records.length, error: null, spendStats };
  }
  const rows: StrRow[] = [];
  for (const r of table.records) {
    const term = String(r[m.search_term!] ?? "").trim();
    if (!term) continue;
    const rawSpend = r[m.spend!];
    const sp = tryParseNumber(rawSpend);
    if (sp !== null) {
      spendStats.nonEmpty++;
      if (spendStats.sample === null) spendStats.sample = String(rawSpend);
      if (Number.isNaN(sp)) spendStats.unparseable++;
      else spendStats.total += sp;
    }
    rows.push({
      search_term: term,
      impressions: parseNumber(r[m.impressions!]),
      clicks: parseNumber(r[m.clicks!]),
      spend: sp === null || Number.isNaN(sp) ? 0 : sp,
      orders: parseNumber(r[m.orders!]),
      sales: m.sales ? parseNumber(r[m.sales]) : null,
      campaign_name: m.campaign_name ? String(r[m.campaign_name] ?? "").trim() || null : null,
      ad_group_name: m.ad_group_name ? String(r[m.ad_group_name] ?? "").trim() || null : null,
    });
  }

  let error: string | null = null;
  const sample = spendStats.sample ? `（示例值：${spendStats.sample.slice(0, 30)}）` : "";
  if (rows.length > 0) {
    if (spendStats.nonEmpty === 0 || spendStats.unparseable === spendStats.nonEmpty) {
      error = `花费列无法识别，无法分析${sample}。请确认「${m.spend}」列是金额数字。`;
    } else if (spendStats.unparseable / spendStats.nonEmpty > MAX_SPEND_UNPARSEABLE_RATIO) {
      error = `花费列有 ${spendStats.unparseable} / ${spendStats.nonEmpty} 个值无法识别${sample}，为避免结果失真已停止分析。`;
    } else if (spendStats.total <= 0) {
      error = `花费列解析后全部为 0${sample}，无法分析。请确认导出的报告含花费数据。`;
    }
  }
  return { rows, missingRequired: [], totalRows: table.records.length, error, spendStats };
}

/** CSV text → parsed STR rows (kept for tests / scripts). */
export function parseStrCsv(text: string): ParseResult {
  return rowsFromTable(tableFromGrid(gridFromCsv(text)));
}
