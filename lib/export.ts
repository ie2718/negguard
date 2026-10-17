import { normalizeTerm } from "@/lib/analysis/engine";
import type { Candidate } from "@/lib/analysis/types";
import type { ExportGate } from "@/lib/config";

/** Week1: negativeExact only — never Phrase. */
export const EXPORT_MATCH_TYPE = "negativeExact" as const;
export const EXPORT_HEADERS = ["Keyword Text", "Match Type"] as const;

/**
 * Validate a selection against saved job candidates. Uses the same normalization
 * (normalizeTerm) as aggregation so duplicates collapse exactly like the results table.
 * Output keeps the results order (spend_wasted desc).
 */
export function selectForExport(candidates: Candidate[], selected: string[]) {
  const wanted = new Set<string>();
  const unknown: string[] = [];
  const known = new Set(candidates.map((c) => c.keyword));
  for (const raw of selected) {
    const k = normalizeTerm(String(raw ?? ""));
    if (!k) continue;
    if (!known.has(k)) {
      if (!unknown.includes(k)) unknown.push(k);
      continue;
    }
    wanted.add(k);
  }
  const rows = candidates.filter((c) => wanted.has(c.keyword));
  return { rows, unknown };
}

export function applyExportGate(rows: Candidate[], gate: ExportGate) {
  if (gate.paid || rows.length <= gate.freeLimit) {
    return { rows, total: rows.length, included: rows.length, gated: false };
  }
  const limited = rows.slice(0, gate.freeLimit);
  return { rows: limited, total: rows.length, included: limited.length, gated: true };
}

function csvCell(v: string): string {
  // spreadsheet formula-injection guard
  let s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Product default: two columns, Keyword Text + Match Type. */
export function toNegativeKeywordCsv(rows: Candidate[]): string {
  const lines = [EXPORT_HEADERS.join(",")];
  for (const r of rows) lines.push([csvCell(r.keyword), EXPORT_MATCH_TYPE].join(","));
  return lines.join("\r\n") + "\r\n";
}
