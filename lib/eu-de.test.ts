import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { analyze, parseStrCsv, rowsFromTable, tryParseNumber } from "@/lib/analysis";
import { decodeTextBuffer } from "@/lib/encoding";
import { detectCurrency, formatMoney } from "@/lib/currency";
import { mapHeaders, normalizeHeader } from "@/lib/str-columns";
import { detectCsvDelimiter, gridFromCsv, readTable, tableFromGrid } from "@/lib/tabular";

const FIX = path.join(__dirname, "../fixtures");
const deCsv = readFileSync(path.join(FIX, "sample-str-de.csv"));

describe("German header mapping", () => {
  it("normalizes umlauts (ö→o, ü→u, ß→ss)", () => {
    expect(normalizeHeader("Verkaufserlöse")).toBe("verkaufserlose");
    expect(normalizeHeader("Verkäufe")).toBe("verkaufe");
    expect(normalizeHeader("Gesamtkosten")).toBe("gesamtkosten");
    expect(normalizeHeader("Straße")).toBe("strasse");
  });
  it("maps DE Sponsored Products STR headers", () => {
    const headers = [
      "Kampagnenname",
      "Anzeigengruppenname",
      "Kundensuchbegriff",
      "Impressionen",
      "Klicks",
      "Ausgaben",
      "7 Tage Verkaufserlöse",
      "7 Tage Gesamtbestellungen (#)",
    ];
    const { mappedColumns, missingRequired } = mapHeaders(headers);
    expect(missingRequired).toEqual([]);
    expect(mappedColumns).toMatchObject({
      search_term: "Kundensuchbegriff",
      impressions: "Impressionen",
      clicks: "Klicks",
      spend: "Ausgaben",
      orders: "7 Tage Gesamtbestellungen (#)",
      sales: "7 Tage Verkaufserlöse",
      campaign_name: "Kampagnenname",
      ad_group_name: "Anzeigengruppenname",
    });
  });
});

describe("semicolon CSV + European numbers", () => {
  it("detects ';' when the header line is semicolon-delimited DE STR", () => {
    expect(detectCsvDelimiter(deCsv.toString("utf8"))).toBe(";");
  });
  it("still prefers ',' for US CSV", () => {
    const us = readFileSync(path.join(FIX, "sample-str.csv"), "utf8");
    expect(detectCsvDelimiter(us)).toBe(",");
  });
  it("parses EU thousands+decimal and bare EU thousands", () => {
    expect(tryParseNumber("1.234,56")).toBeCloseTo(1234.56);
    expect(tryParseNumber("€1.234,56")).toBeCloseTo(1234.56);
    expect(tryParseNumber("12.000")).toBe(12000); // EU thousands (was 12 before Day5)
    expect(tryParseNumber("1.234.567")).toBe(1234567);
    expect(tryParseNumber("12,50")).toBeCloseTo(12.5);
    expect(tryParseNumber("12.5")).toBeCloseTo(12.5); // US decimal still works
    expect(tryParseNumber("$1,234.50")).toBeCloseTo(1234.5);
  });
  it("end-to-end: DE fixture → EUR currency, EU numbers, correct candidates", () => {
    const table = readTable(deCsv, "sample-str-de.csv");
    expect(table.delimiter).toBe(";");
    expect(table.encoding).toBe("utf-8");
    const cur = detectCurrency(table);
    expect(cur.currency).toBe("EUR");
    const p = rowsFromTable(table);
    expect(p.error).toBeNull();
    expect(p.rows.map((r) => r.impressions)).toContain(12000);
    expect(p.rows.find((r) => r.search_term === "widget halter")?.spend).toBeCloseTo(45.5);
    const res = analyze(p.rows, {}, cur.currency, cur.source);
    const byKw = Object.fromEntries(res.candidates.map((c) => [c.keyword, c]));
    // €45.50 0-order → zero_orders_high_spend (EUR floor €5)
    expect(byKw["widget halter"]?.reason).toBe("zero_orders_high_spend");
    // €18 / 12 clicks 0-order → high spend
    expect(byKw["widget ständer"]?.reason).toBe("zero_orders_high_spend");
    // €3.20 / 8 clicks — below €5 and below half-floor €2.5? 3.20 >= 2.5 but clicks 8 < 10 → none
    expect(byKw["blaues widget"]).toBeUndefined();
    // 1 order ACOS 150% → low_conv
    expect(byKw["premium widget set"]?.reason).toBe("low_conv_high_spend");
    // ASIN skipped
    expect(byKw["b0detest01"]).toBeUndefined();
    expect(res.summary.skipped_asin.count).toBe(1);
    // healthy 20-order term out
    expect(byKw["widget"]).toBeUndefined();
    expect(res.currency).toBe("EUR");
    expect(formatMoney(res.summary.total_spend_wasted, "EUR")).toMatch(/^€/);
  });
});

describe("encoding", () => {
  it("UTF-8 BOM stripped", () => {
    const body = "Kundensuchbegriff;Impressionen;Klicks;Ausgaben;Bestellungen\nä,1,1,€1,00,0\n";
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
    const d = decodeTextBuffer(buf);
    expect(d.encoding).toBe("utf-8");
    expect(d.text.startsWith("Kundensuchbegriff")).toBe(true);
    expect(d.text).toContain("ä");
  });
  it("UTF-16LE BOM", () => {
    const body = "Kundensuchbegriff;Impressionen;Klicks;Ausgaben;Bestellungen\nwidget,1,1,5,0\n";
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, "utf16le")]);
    const d = decodeTextBuffer(buf);
    expect(d.encoding).toBe("utf-16le");
    expect(d.text.startsWith("Kundensuchbegriff")).toBe(true);
  });
  it("Windows-1252 fallback for Latin-1 DE bytes that are invalid UTF-8", () => {
    // "Käse" — ä = 0xE4 in windows-1252; lone 0xE4 is invalid UTF-8
    const header = Buffer.from("Kundensuchbegriff;Impressionen;Klicks;Ausgaben;Bestellungen\n", "latin1");
    const term = Buffer.from([0x4b, 0xe4, 0x73, 0x65]); // Käse
    const rest = Buffer.from(";1.000;12;5,00;0\n", "latin1");
    const buf = Buffer.concat([header, term, rest]);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(buf)).toThrow();
    const d = decodeTextBuffer(buf);
    expect(d.encoding).toBe("windows-1252");
    expect(d.text).toContain("Käse");
    const delim = detectCsvDelimiter(d.text);
    const table = tableFromGrid(gridFromCsv(d.text, delim), null, { encoding: d.encoding, delimiter: delim });
    const p = rowsFromTable(table);
    expect(p.missingRequired).toEqual([]);
    expect(p.rows[0].search_term).toBe("Käse");
    expect(p.rows[0].impressions).toBe(1000);
    expect(p.rows[0].spend).toBeCloseTo(5);
  });
  it("readTable wires encoding through for .csv", () => {
    expect(readTable(deCsv, "x.csv").encoding).toBe("utf-8");
  });
});

describe("click-rule spend floor (Day5)", () => {
  it("DE fixture: low-spend high-click term under €2.5 is excluded", () => {
    // craft: 20 clicks, €2.00 — would have fired Day4, not Day5
    const csv = [
      "Kundensuchbegriff;Impressionen;Klicks;Ausgaben;Bestellungen",
      "noise term;500;20;€2,00;0",
      "real waste;800;15;€6,00;0",
    ].join("\n");
    const p = parseStrCsv(csv);
    const res = analyze(p.rows, {}, "EUR", "cells");
    expect(res.candidates.map((c) => c.keyword)).toEqual(["real waste"]);
  });
});
