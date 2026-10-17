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

export default async function UploadDetailPage({ params }: Props) {
  const { id } = await params;
  const meta = await getUploadMeta(id);
  if (!meta) notFound();
  const job = await getLatestJobForUpload(id);

  const mapped = meta.mapped_columns ?? {};
  const missing = new Set(meta.missing_required ?? []);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-16">
      <div>
        <Link
          href="/"
          className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
        >
          ← 再传一份
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          报告已接收 · {meta.row_count.toLocaleString()} 行
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          文件：{meta.filename}（{(meta.bytes / 1024).toFixed(1)} KB）
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
        <h2 className="border-b border-zinc-200 px-4 py-3 text-sm font-medium dark:border-zinc-800">
          报告列检查
        </h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {REQUIRED_FIELDS.map((field) => {
            const ok = Boolean(mapped[field]) && !missing.has(field);
            return (
              <li
                key={field}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span>{FIELD_LABEL_ZH[field] ?? field}</span>
                {ok ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ✓ {mapped[field]}
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">✗ 缺失</span>
                )}
              </li>
            );
          })}
          {Object.entries(mapped)
            .filter(([k]) => !REQUIRED_FIELDS.includes(k as (typeof REQUIRED_FIELDS)[number]))
            .map(([field, orig]) => (
              <li
                key={field}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-zinc-500"
              >
                <span>{FIELD_LABEL_ZH[field] ?? field}</span>
                <span>✓ {orig}</span>
              </li>
            ))}
        </ul>
      </section>

      {missing.size > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          报告缺少搜索词 / 点击 / 花费 / 订单等列，无法分析。请导出 Sponsored Products 的 Search Term Report。
        </p>
      )}

      <AnalysisPanel uploadId={meta.id} initialJob={job} canAnalyze={missing.size === 0} exportGate={getExportGate()} />
    </main>
  );
}
