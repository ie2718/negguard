import Link from "next/link";
import { notFound } from "next/navigation";
import { getLatestJobForUpload, getUploadMeta } from "@/lib/local-store";
import AnalysisPanel from "./AnalysisPanel";
import { getExportGate } from "@/lib/config";

const FIELD_LABEL_ZH: Record<string, string> = {
  search_term: "搜索词",
  impressions: "展示",
  clicks: "点击",
  spend: "花费",
  orders: "订单",
  sales: "销售额",
  campaign_name: "广告活动",
  ad_group_name: "广告组",
};
import { REQUIRED_FIELDS } from "@/lib/str-columns";

type Props = { params: Promise<{ id: string }> };

export const metadata = {
  title: "报告已接收",
};

export default async function UploadDetailPage({ params }: Props) {
  const { id } = await params;
  const meta = await getUploadMeta(id);
  if (!meta) notFound();
  const job = await getLatestJobForUpload(id);

  const mapped = meta.mapped_columns ?? {};
  const missing = new Set(meta.missing_required ?? []);

  return (
    <main id="main" className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-8 px-5 py-10">
      <div>
        <Link href="/#upload" className="text-sm font-medium text-brand hover:underline">
          ← 再传一份
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          报告已接收 · {meta.row_count.toLocaleString()} 行
        </h1>
        <p className="text-muted">
          文件：{meta.filename}（{(meta.bytes / 1024).toFixed(1)} KB）
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <h2 className="border-b border-line px-4 py-3 text-sm font-medium">报告列检查</h2>
        <ul className="divide-y divide-line">
          {REQUIRED_FIELDS.map((field) => {
            const ok = Boolean(mapped[field]) && !missing.has(field);
            return (
              <li
                key={field}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span>{FIELD_LABEL_ZH[field] ?? field}</span>
                {ok ? (
                  <span className="text-brand">✓ {mapped[field]}</span>
                ) : (
                  <span className="text-danger">✗ 缺失</span>
                )}
              </li>
            );
          })}
          {Object.entries(mapped)
            .filter(([k]) => !REQUIRED_FIELDS.includes(k as (typeof REQUIRED_FIELDS)[number]))
            .map(([field, orig]) => (
              <li
                key={field}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted"
              >
                <span>{FIELD_LABEL_ZH[field] ?? field}</span>
                <span>✓ {orig}</span>
              </li>
            ))}
        </ul>
      </section>

      {missing.size > 0 && (
        <p className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          报告缺少搜索词 / 点击 / 花费 / 订单等列，无法分析。请导出 Sponsored Products 的 Search Term Report。
        </p>
      )}

      <AnalysisPanel uploadId={meta.id} initialJob={job} canAnalyze={missing.size === 0} exportGate={getExportGate()} />
    </main>
  );
}
