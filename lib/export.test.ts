import { describe, expect, it } from "vitest";
import { analyze, type StrRow } from "@/lib/analysis";
import { applyExportGate, EXPORT_MATCH_TYPE, selectForExport, toNegativeKeywordCsv } from "@/lib/export";

const row = (search_term: string, spend: number, clicks = 3, orders = 0): StrRow => ({
  search_term, impressions: 100, clicks, spend, orders, sales: orders ? 1 : 0, campaign_name: null, ad_group_name: null,
});

const job = analyze([
  row("Alpha Term", 30),
  row("alpha  term", 5), // duplicate of "alpha term" (aggregated)
  row("beta, with comma", 20),
  row('gamma "quoted"', 10),
  row("=cmd formula", 8),
  row("delta", 6),
]);

describe("selectForExport", () => {
  it("exports exactly the ticked rows, in results order", () => {
    const { rows, unknown } = selectForExport(job.candidates, ["delta", "alpha term"]);
    expect(unknown).toEqual([]);
    expect(rows.map((r) => r.keyword)).toEqual(["alpha term", "delta"]); // spend_wasted desc
  });
  it("dedupes with the same normalization as results (case/whitespace)", () => {
    const { rows } = selectForExport(job.candidates, ["Alpha Term", "ALPHA   term ", "alpha term"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].spend_wasted).toBe(35);
  });
  it("rejects keywords not in the saved job", () => {
    const { unknown } = selectForExport(job.candidates, ["delta", "not a candidate", "wireless earbuds"]);
    expect(unknown).toEqual(["not a candidate", "wireless earbuds"]);
  });
});

describe("toNegativeKeywordCsv", () => {
  const csv = toNegativeKeywordCsv(job.candidates);
  const lines = csv.trim().split("\r\n");
  it("two columns, header Keyword Text + Match Type", () => {
    expect(lines[0]).toBe("Keyword Text,Match Type");
    expect(lines).toHaveLength(job.candidates.length + 1);
  });
  it("Match Type is negativeExact on every row, never phrase", () => {
    expect(EXPORT_MATCH_TYPE).toBe("negativeExact");
    for (const l of lines.slice(1)) expect(l.endsWith(",negativeExact")).toBe(true);
    expect(csv.toLowerCase()).not.toContain("phrase");
  });
  it("escapes commas/quotes and guards formula injection", () => {
    expect(csv).toContain('"beta, with comma",negativeExact');
    expect(csv).toContain('"gamma ""quoted""",negativeExact');
    expect(csv).toContain("'=cmd formula,negativeExact");
  });
});

describe("applyExportGate (stub)", () => {
  const rows = job.candidates;
  it("free: first N rows only, flagged gated", () => {
    const g = applyExportGate(rows, { paid: false, freeLimit: 2 });
    expect(g).toMatchObject({ total: rows.length, included: 2, gated: true });
    expect(g.rows.map((r) => r.keyword)).toEqual(rows.slice(0, 2).map((r) => r.keyword));
  });
  it("free under limit and paid: everything", () => {
    expect(applyExportGate(rows, { paid: false, freeLimit: 99 }).gated).toBe(false);
    expect(applyExportGate(rows, { paid: true, freeLimit: 2 })).toMatchObject({ included: rows.length, gated: false });
  });
});
