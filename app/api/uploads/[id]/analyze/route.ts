import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { analyze, rowsFromTable, type Thresholds } from "@/lib/analysis";
import { readTable } from "@/lib/tabular";
import { detectCurrency, isCurrencyCode, MIXED_CURRENCY_ERROR, type CurrencyCode } from "@/lib/currency";
import {
  getLatestJobForUpload,
  getUploadMeta,
  readUploadFile,
  saveAnalysisJob,
  type AnalysisJob,
} from "@/lib/local-store";

type Ctx = { params: Promise<{ id: string }> };

const NUMERIC_KEYS = [
  "min_spend_zero_orders", "min_clicks_zero_orders", "min_spend_low_conv",
  "max_acos", "min_orders_protected", "min_spend_irrelevant", "min_spend_global",
] as const;

/** GET: latest analysis job for this upload (404 if none). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const job = await getLatestJobForUpload(id);
  if (!job) return NextResponse.json({ error: "尚未分析" }, { status: 404 });
  return NextResponse.json(job);
}

/** POST: run rules engine; optional JSON body { thresholds?: Partial<Thresholds>, currency?: "USD"|"INR"|… }. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const meta = await getUploadMeta(id);
  if (!meta) return NextResponse.json({ error: "上传不存在" }, { status: 404 });

  const overrides: Partial<Thresholds> = {};
  let currencyOverride: CurrencyCode | null = null;
  try {
    const body = await req.json();
    if (isCurrencyCode(body?.currency)) currencyOverride = body.currency;
    const t = body?.thresholds ?? {};
    for (const k of NUMERIC_KEYS) {
      if (typeof t[k] === "number" && Number.isFinite(t[k]) && t[k] >= 0) overrides[k] = t[k];
    }
    if (Array.isArray(t.irrelevant_modifiers))
      overrides.irrelevant_modifiers = t.irrelevant_modifiers.filter((s: unknown) => typeof s === "string");
    if (Array.isArray(t.irrelevant_modifier_exclusions))
      overrides.irrelevant_modifier_exclusions = t.irrelevant_modifier_exclusions.filter((s: unknown) => typeof s === "string");
    if (Array.isArray(t.brand_competitor_terms))
      overrides.brand_competitor_terms = t.brand_competitor_terms.filter((s: unknown) => typeof s === "string");
  } catch {
    /* empty body → defaults */
  }

  const buf = await readUploadFile(meta);
  const table = readTable(buf, meta.filename);
  const { rows, missingRequired, error: parseError } = rowsFromTable(table);
  const detected = detectCurrency(table);
  const currency = currencyOverride ?? detected.currency;
  const currencySource = currencyOverride ? "override" : detected.source;
  const base = { id: randomUUID(), upload_id: id, created_at: new Date().toISOString() };

  if (detected.mixed && !currencyOverride) {
    const failed: AnalysisJob = {
      ...base,
      ...analyze([], overrides, currency, currencySource),
      status: "failed",
      error: `${MIXED_CURRENCY_ERROR}（发现：${detected.found.join(", ")}）`,
    };
    await saveAnalysisJob(failed);
    return NextResponse.json(failed, { status: 422 });
  }

  if (missingRequired.length || parseError) {
    const failed: AnalysisJob = {
      ...base,
      ...analyze([], overrides, currency, currencySource),
      status: "failed",
      error: parseError ?? `缺少必填列：${missingRequired.join(", ")}`,
    };
    await saveAnalysisJob(failed);
    return NextResponse.json(failed, { status: 422 });
  }

  const job: AnalysisJob = { ...base, ...analyze(rows, overrides, currency, currencySource), status: "succeeded", error: null };
  await saveAnalysisJob(job);
  return NextResponse.json(job);
}
