import { NextRequest, NextResponse } from "next/server";
import { getExportGate } from "@/lib/config";
import { applyExportGate, selectForExport, toNegativeKeywordCsv } from "@/lib/export";
import { getLatestJobForUpload } from "@/lib/local-store";

type Ctx = { params: Promise<{ id: string }> };

/** POST { keywords: string[] } → text/csv (Keyword Text, Match Type=negativeExact). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const job = await getLatestJobForUpload(id);
  if (!job || job.status !== "succeeded") {
    return NextResponse.json({ error: "请先完成分析再导出" }, { status: 409 });
  }

  let keywords: unknown;
  try {
    keywords = (await req.json())?.keywords;
  } catch {
    keywords = undefined;
  }
  if (!Array.isArray(keywords) || keywords.some((k) => typeof k !== "string")) {
    return NextResponse.json({ error: "请求格式错误：需要 keywords 字符串数组" }, { status: 400 });
  }

  const { rows, unknown } = selectForExport(job.candidates, keywords as string[]);
  if (unknown.length) {
    return NextResponse.json(
      { error: "所选关键词不在本次分析结果中", unknown: unknown.slice(0, 20) },
      { status: 400 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "请至少勾选 1 个否词" }, { status: 400 });
  }

  const gated = applyExportGate(rows, getExportGate());
  const csv = toNegativeKeywordCsv(gated.rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="negguard-negative-exact-${id.slice(0, 8)}.csv"`,
      "Cache-Control": "no-store",
      "X-NegGuard-Total": String(gated.total),
      "X-NegGuard-Included": String(gated.included),
      "X-NegGuard-Gated": String(gated.gated),
    },
  });
}
