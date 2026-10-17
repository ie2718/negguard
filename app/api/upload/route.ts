import { NextRequest, NextResponse } from "next/server";
import { mapHeaders, type InternalField } from "@/lib/str-columns";
import { saveUploadLocal } from "@/lib/local-store";
import { fileKind, readTable } from "@/lib/tabular";
import { detectCurrency, MIXED_CURRENCY_ERROR } from "@/lib/currency";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB guest
const MAX_ROWS = 20_000; // guest

async function trySupabaseStorage(
  id: string,
  filename: string,
  buffer: Buffer,
  meta: {
    row_count: number;
    mapped_columns: Record<string, string>;
    missing_required: string[];
    bytes: number;
  }
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServerClient();
  if (!supabase) return null;

  const path = `guest/${id}/${filename}`;
  const { error: upErr } = await supabase.storage
    .from("search-term-csvs")
    .upload(path, buffer, {
      contentType: filename.toLowerCase().endsWith(".xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv",
      upsert: false,
    });
  if (upErr) {
    console.warn("[upload] Supabase Storage skipped:", upErr.message);
    return null;
  }

  const { error: dbErr } = await supabase.from("uploads").insert({
    id,
    user_id: null,
    filename,
    bytes: meta.bytes,
    row_count: meta.row_count,
    status: meta.missing_required.length ? "failed" : "uploaded",
    storage_path: path,
    mapped_columns: meta.mapped_columns,
    missing_required: meta.missing_required,
  });
  if (dbErr) {
    console.warn("[upload] Supabase DB insert skipped:", dbErr.message);
  }
  return path;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "请上传 Search Term Report 的 .csv 或 .xlsx 文件" },
        { status: 400 }
      );
    }

    const filename = file.name || "upload.csv";
    if (!fileKind(filename)) {
      return NextResponse.json(
        { error: "请上传 Search Term Report 的 .csv 或 .xlsx 文件" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `访客快检限 ≤${MAX_BYTES / 1024 / 1024}MB。注册后可分析更大文件。`,
        },
        { status: 413 }
      );
    }

    let table;
    try {
      table = readTable(buffer, filename, MAX_ROWS);
    } catch {
      return NextResponse.json(
        { error: "文件无法读取，请确认是从亚马逊广告后台导出的 CSV / XLSX 报告" },
        { status: 400 }
      );
    }
    const headers = table.headers;
    const rowCount = table.records.length;
    if (rowCount > MAX_ROWS) {
      return NextResponse.json(
        {
          error: `访客快检限 ≤2 万行（当前超过 ${MAX_ROWS.toLocaleString()} 行）。注册后可分析更大文件。`,
        },
        { status: 413 }
      );
    }

    const { mappedColumns, missingRequired } = mapHeaders(headers);
    const mappedRecord = mappedColumns as Record<string, string>;
    const missing = missingRequired as InternalField[];

    const cur = detectCurrency(table);
    if (cur.mixed) {
      return NextResponse.json(
        {
          error: MIXED_CURRENCY_ERROR,
          currencies: cur.found,
        },
        { status: 422 }
      );
    }
    const status = missing.length ? "failed" : "uploaded";
    const local = await saveUploadLocal(filename, buffer, {
      currency: cur.currency,
      currency_source: cur.source,
      row_count: rowCount,
      mapped_columns: mappedRecord,
      missing_required: missing,
      status,
    });

    // Best-effort Supabase; local store is source of truth for now
    await trySupabaseStorage(local.id, filename, buffer, {
      row_count: rowCount,
      mapped_columns: mappedRecord,
      missing_required: missing,
      bytes: buffer.byteLength,
    });

    return NextResponse.json({
      id: local.id,
      rowCount,
      mappedColumns: mappedRecord,
      missingRequired: missing,
      sheetName: table.sheetName,
      currency: cur.currency,
      currencySource: cur.source,
      status,
    });
  } catch (e) {
    console.error("[upload]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "上传失败" },
      { status: 500 }
    );
  }
}
