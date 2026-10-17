import { describe, expect, it } from "vitest";
import { analyze, rowsFromTable } from "@/lib/analysis";
import { detectCurrency, MIXED_CURRENCY_ERROR } from "@/lib/currency";
import { mapHeaders } from "@/lib/str-columns";
import { gridFromCsv, readTable, tableFromGrid } from "@/lib/tabular";

describe("14-day column aliases", () => {
  it("maps Sponsored Brands style 14 Day Total Orders / Sales", () => {
    const { mappedColumns, missingRequired } = mapHeaders([
      "Customer Search Term",
      "Impressions",
      "Clicks",
      "Spend",
      "14 Day Total Orders (#)",
      "14 Day Total Sales",
    ]);
    expect(missingRequired).toEqual([]);
    expect(mappedColumns.orders).toBe("14 Day Total Orders (#)");
    expect(mappedColumns.sales).toBe("14 Day Total Sales");
  });
  it("maps German 14-day sales / orders headers", () => {
    const { mappedColumns, missingRequired } = mapHeaders([
      "Kundensuchbegriff",
      "Impressionen",
      "Klicks",
      "Ausgaben",
      "14 Tage Gesamtbestellungen (#)",
      "14 Tage Verkaufserlöse",
    ]);
    expect(missingRequired).toEqual([]);
    expect(mappedColumns.orders).toBe("14 Tage Gesamtbestellungen (#)");
    expect(mappedColumns.sales).toBe("14 Tage Verkaufserlöse");
  });
  it("parses a 14-day CSV end-to-end", () => {
    const csv = [
      "Customer Search Term,Impressions,Clicks,Spend,14 Day Total Orders (#),14 Day Total Sales",
      "noise term,1000,20,$30.00,0,$0.00",
      "converter,500,10,$25.00,1,$10.00",
    ].join("\n");
    const table = tableFromGrid(gridFromCsv(csv));
    const p = rowsFromTable(table);
    expect(p.error).toBeNull();
    expect(p.rows[0].orders).toBe(0);
    expect(p.rows[1].sales).toBe(10);
    const res = analyze(p.rows, {}, "USD", "cells");
    expect(res.candidates.map((c) => c.keyword)).toContain("noise term");
    expect(res.candidates.map((c) => c.keyword)).toContain("converter"); // 1 order, ACOS 250%
  });
});

describe("mixed-currency upload detection", () => {
  it("synthetic mixed $ + ₹ file is mixed; single-currency is not", () => {
    const mixed = [
      "Customer Search Term,Impressions,Clicks,Spend,Orders,Sales",
      "us term,100,5,$10.00,0,$0",
      "in term,100,5,₹500.00,0,₹0",
    ].join("\n");
    const d = detectCurrency(tableFromGrid(gridFromCsv(mixed)));
    expect(d.mixed).toBe(true);
    expect(MIXED_CURRENCY_ERROR).toMatch(/请按站点分别导出/);
    expect(MIXED_CURRENCY_ERROR).toMatch(/Multiple currencies/);

    const single = [
      "Customer Search Term,Impressions,Clicks,Spend,Orders",
      "only usd,100,5,$10.00,0",
    ].join("\n");
    expect(detectCurrency(tableFromGrid(gridFromCsv(single))).mixed).toBe(false);
  });
  it("readTable + detectCurrency on a buffer still flags mixed", () => {
    const buf = Buffer.from(
      "Customer Search Term,Impressions,Clicks,Spend,Orders\na,1,1,$5,0\nb,1,1,€5,0\n",
      "utf8"
    );
    const d = detectCurrency(readTable(buf, "mixed.csv"));
    expect(d.mixed).toBe(true);
    expect(d.found.sort()).toEqual(["EUR", "USD"]);
  });
});
