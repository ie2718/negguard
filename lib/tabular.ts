import Papa from "papaparse";
import * as XLSX from "xlsx";
import { decodeTextBuffer } from "@/lib/encoding";
import { mapHeaders } from "@/lib/str-columns";

export type Table = {
  headers: string[];
  records: Record<string, unknown>[];
  sheetName: string | null;
  headerRowIndex: number;
  encoding?: string;
  delimiter?: string;
};

type Grid = unknown[][];

/** How many leading rows to scan for the real header row (report titles above headers). */
const HEADER_SCAN_ROWS = 10;

/** Prefer the delimiter that yields a header row matching all required STR columns. */
export function detectCsvDelimiter(text: string): "," | ";" | "\t" {
  const firstNonEmpty = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  let best: "," | ";" | "\t" = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const cells = firstNonEmpty.split(d).map((c) => c.replace(/^"|"$/g, "").trim());
    const { missingRequired } = mapHeaders(cells);
    const score =
      (missingRequired.length === 0 ? 1000 : 0) +
      cells.filter(Boolean).length * 10 -
      missingRequired.length * 50 -
      // prefer the delimiter that appears more often when scores tie
      0;
    const count = (firstNonEmpty.match(new RegExp(d === "\t" ? "\\t" : `\\${d}`, "g")) ?? []).length;
    const total = score + count;
    if (total > bestScore) {
      bestScore = total;
      best = d;
    }
  }
  // If neither maps required columns, fall back to whichever separator is more frequent
  if (bestScore < 1000) {
    const commas = (firstNonEmpty.match(/,/g) ?? []).length;
    const semis = (firstNonEmpty.match(/;/g) ?? []).length;
    const tabs = (firstNonEmpty.match(/\t/g) ?? []).length;
    if (semis > commas && semis >= tabs) return ";";
    if (tabs > commas && tabs > semis) return "\t";
    return ",";
  }
  return best;
}

export function gridFromCsv(text: string, delimiter?: "," | ";" | "\t"): Grid {
  const d = delimiter ?? detectCsvDelimiter(text);
  const res = Papa.parse<unknown[]>(text.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: "greedy",
    delimiter: d,
  });
  return res.data;
}

function findHeaderRow(grid: Grid): { index: number; matched: boolean } {
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, grid.length); i++) {
    const cells = (grid[i] ?? []).map((c) => String(c ?? "").trim());
    if (mapHeaders(cells).missingRequired.length === 0) return { index: i, matched: true };
  }
  return { index: 0, matched: false };
}

export function tableFromGrid(
  grid: Grid,
  sheetName: string | null = null,
  meta: { encoding?: string; delimiter?: string } = {}
): Table {
  const { index } = findHeaderRow(grid);
  const headers = (grid[index] ?? []).map((c) => String(c ?? "").trim());
  const records: Record<string, unknown>[] = [];
  for (let i = index + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const rec: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h && !(h in rec)) rec[h] = row[j];
    });
    records.push(rec);
  }
  return {
    headers: headers.filter(Boolean),
    records,
    sheetName,
    headerRowIndex: index,
    encoding: meta.encoding,
    delimiter: meta.delimiter,
  };
}

/**
 * XLSX: pick the first sheet whose header row (within the first rows) maps all
 * required STR columns — e.g. "SP Search Term Report" inside a bulk file.
 * Falls back to the first sheet. `maxRows` caps parsing (row limits / zip bombs).
 */
export function tableFromXlsx(buf: Buffer | Uint8Array, maxRows?: number): Table {
  const wb = XLSX.read(buf, {
    type: "buffer",
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    sheetRows: maxRows ? maxRows + HEADER_SCAN_ROWS + 1 : 0,
  });
  let fallback: Table | null = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    });
    if (findHeaderRow(grid).matched) return tableFromGrid(grid, name);
    if (!fallback) fallback = tableFromGrid(grid, name);
  }
  return fallback ?? { headers: [], records: [], sheetName: null, headerRowIndex: 0 };
}

export type FileKind = "csv" | "xlsx";

export function fileKind(filename: string): FileKind | null {
  const f = filename.toLowerCase();
  if (f.endsWith(".csv")) return "csv";
  if (f.endsWith(".xlsx")) return "xlsx";
  return null;
}

export function readTable(buf: Buffer, filename: string, maxRows?: number): Table {
  const kind = fileKind(filename);
  if (kind === "xlsx") return tableFromXlsx(buf, maxRows);
  const { text, encoding } = decodeTextBuffer(buf);
  const delimiter = detectCsvDelimiter(text);
  return tableFromGrid(gridFromCsv(text, delimiter), null, { encoding, delimiter });
}
