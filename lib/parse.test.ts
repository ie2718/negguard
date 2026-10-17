import { readFileSync } from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { analyze, parseNumber, parseStrCsv, rowsFromTable, tryParseNumber } from "@/lib/analysis";
import { mapHeaders, normalizeHeader } from "@/lib/str-columns";
import { readTable, tableFromXlsx } from "@/lib/tabular";

const FIX = path.join(__dirname, "../fixtures");

describe("currency parsing", () => {
  it.each([
    ["Rs.8707.78", 8707.78],
    ["Rs. 12", 12],
    ["Rs 12.50", 12.5],
    ["₹8,707.78", 8707.78],
    ["INR 1,000", 1000],
    ["$1,234.50", 1234.5],
    ["US$ 99.90", 99.9],
    ["CA$5", 5],
    ["€1.234,56", 1234.56],
    ["1.234,56 €", 1234.56],
    ["£12.30", 12.3],
    ["¥1,200", 1200],
    ["12,50", 12.5],
    ["1,234,567", 1234567],
    ["-$5.00", -5],
    ["($3.10)", -3.1],
    ["25.5%", 25.5],
    [7.25, 7.25],
  ])("%s → %d", (raw, expected) => {
    expect(tryParseNumber(raw)).toBeCloseTo(expected as number, 6);
  });
  it("empty → null, garbage → NaN, lenient parseNumber → 0", () => {
    expect(tryParseNumber("")).toBeNull();
    expect(tryParseNumber("-")).toBeNull();
    expect(Number.isNaN(tryParseNumber("abc") as number)).toBe(true);
    expect(Number.isNaN(tryParseNumber("Rs.8707.78.1x") as number)).toBe(true);
    expect(parseNumber("abc")).toBe(0);
  });
});

describe("header mapping", () => {
  it("strips currency suffixes in headers", () => {
    expect(normalizeHeader("7 Day Total Sales (₹)")).toBe("7daytotalsales");
    expect(normalizeHeader("7 Day Total Sales ($)")).toBe("7daytotalsales");
    expect(normalizeHeader("Sales ($)")).toBe("sales");
    expect(normalizeHeader("Spend (USD)")).toBe("spend");
    expect(normalizeHeader("7 Day Total Orders (#)")).toBe("7daytotalorders#");
    expect(normalizeHeader("Campaign Name (Informational only)")).toBe("campaignname");
  });
  it("maps new unified-report names Total cost / Purchases and currency-suffixed sales", () => {
    const { mappedColumns, missingRequired } = mapHeaders(["Search term", "Impressions", "Clicks", "Total cost", "Purchases", "Sales ($)"]);
    expect(missingRequired).toEqual([]);
    expect(mappedColumns).toMatchObject({ spend: "Total cost", orders: "Purchases", sales: "Sales ($)" });
  });
  it("maps bulk-file informational campaign / ad group columns", () => {
    const { mappedColumns } = mapHeaders(["Customer Search Term", "Impressions", "Clicks", "Spend", "Orders", "Campaign Name (Informational only)", "Ad Group Name (Informational only)"]);
    expect(mappedColumns.campaign_name).toBe("Campaign Name (Informational only)");
    expect(mappedColumns.ad_group_name).toBe("Ad Group Name (Informational only)");
  });
});

describe("spend sanity → job failure", () => {
  const H = "Customer Search Term,Impressions,Clicks,Spend,Orders\n";
  it("all-zero spend fails with a clear error", () => {
    const r = parseStrCsv(H + "a,10,2,0,0\nb,10,3,0.00,0\n");
    expect(r.error).toMatch(/全部为 0/);
  });
  it("entirely unparseable spend fails", () => {
    const r = parseStrCsv(H + "a,10,2,n/a,0\nb,10,3,??,0\n");
    expect(r.error).toMatch(/无法识别/);
  });
  it("mostly unparseable spend (> 5%) fails", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `t${i},10,2,${i < 2 ? "x" : "1.5"},0`).join("\n");
    expect(parseStrCsv(H + rows).error).toMatch(/2 \/ 10/);
  });
  it("valid spend → no error", () => {
    expect(parseStrCsv(H + "a,10,2,$3.50,0\n").error).toBeNull();
  });
});

describe("INR synthetic fixture", () => {
  const r = parseStrCsv(readFileSync(path.join(FIX, "sample-str-inr.csv"), "utf8"));
  it("parses Rs./₹ spend and ₹-suffixed sales header", () => {
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => x.spend)).toEqual([1234.5, 2500, 4000, 600.25]);
    expect(r.rows.map((x) => x.sales)).toEqual([0, 999, 12000, 0]);
  });
  it("analysis: ASIN skipped, 6-order term protected", () => {
    const res = analyze(r.rows);
    const kws = res.candidates.map((c) => c.keyword);
    expect(kws).toContain("widget holder");
    expect(kws).toContain("widget stand"); // 1 order, ACOS 250%
    expect(kws).not.toContain("blue widget");
    expect(kws).not.toContain("b0demo0001");
    expect(res.summary.skipped_asin.count).toBe(1);
  });
});

function xlsxBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("xlsx upload", () => {
  const STR = [
    ["Customer Search Term", "Impressions", "Clicks", "Spend", "7 Day Total Orders (#)", "7 Day Total Sales ($)"],
    ["widget holder", 1000, 20, 12.5, 0, 0],
    ["widget stand", 500, 5, "$22.00", 1, 10],
  ];
  it("reads the first sheet with numeric and string cells", () => {
    const r = rowsFromTable(readTable(xlsxBuffer({ Report: STR }), "report.xlsx"));
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => [x.search_term, x.spend, x.sales])).toEqual([["widget holder", 12.5, 0], ["widget stand", 22, 10]]);
  });
  it("picks the sheet whose headers match STR (bulk file)", () => {
    const t = tableFromXlsx(xlsxBuffer({
      "Portfolios": [["Portfolio ID", "Name"], [1, "x"]],
      "Sponsored Products Campaigns": [["Campaign ID", "Bid"], [1, 0.5]],
      "SP Search Term Report": STR,
    }));
    expect(t.sheetName).toBe("SP Search Term Report");
    expect(t.records).toHaveLength(2);
  });
  it("finds the header row below report title rows", () => {
    const t = tableFromXlsx(xlsxBuffer({ S: [["Sponsored Products Search term report"], ["Date range: Jan 2026"], ...STR] }));
    expect(t.headerRowIndex).toBe(2);
    expect(rowsFromTable(t).rows).toHaveLength(2);
  });
  it("row cap is applied while parsing", () => {
    const big = [STR[0], ...Array.from({ length: 50 }, (_, i) => [`t${i}`, 1, 1, 1, 0, 0])];
    expect(tableFromXlsx(xlsxBuffer({ S: big }), 20).records.length).toBeLessThanOrEqual(31);
  });
  it("CSV still works via readTable", () => {
    const csv = Buffer.from(STR.map((r) => r.join(",")).join("\n"));
    expect(rowsFromTable(readTable(csv, "x.csv")).rows).toHaveLength(2);
  });
});
