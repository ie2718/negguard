"use client";

import { useMemo, useState } from "react";
import type { AnalysisJob } from "@/lib/local-store";
import { reasonTooltip } from "@/lib/analysis/labels";
import type { ExportGate } from "@/lib/config";
import { CURRENCY_CODES, formatMoney, isCurrencyCode, type CurrencyCode } from "@/lib/currency";


export default function AnalysisPanel({
  uploadId,
  initialJob,
  canAnalyze,
  exportGate,
}: {
  uploadId: string;
  initialJob: AnalysisJob | null;
  canAnalyze: boolean;
  exportGate: ExportGate;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ ok: string; gated: string | null } | null>(null);
  const [job, setJob] = useState<AnalysisJob | null>(initialJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency: CurrencyCode = isCurrencyCode(job?.currency) ? job.currency : "USD";
  const money = (n: number) => formatMoney(n, currency);
  const [rerunCurrency, setRerunCurrency] = useState<CurrencyCode>("USD");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialJob?.candidates.map((c) => c.keyword) ?? [])
  );

  async function exportCsv() {
    if (!job) return;
    setExporting(true);
    setError(null);
    setExportMsg(null);
    try {
      // keep results order; send exactly the ticked rows
      const keywords = job.candidates.filter((c) => selected.has(c.keyword)).map((c) => c.keyword);
      const res = await fetch(`/api/uploads/${uploadId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "导出失败");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "negguard-negative-exact.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const total = Number(res.headers.get("X-NegGuard-Total") ?? keywords.length);
      const included = Number(res.headers.get("X-NegGuard-Included") ?? keywords.length);
      const gated = res.headers.get("X-NegGuard-Gated") === "true";
      setExportMsg({
        ok: `已生成否词表（仅 negativeExact，${included} 个）。在广告后台选好广告活动，再导入否定关键词。`,
        gated: gated
          ? `免费版已导出疑似浪费最高的前 ${included} 个（共勾选 ${total} 个）。完整可导入否词表需 $29/月订阅。`
          : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setExporting(false);
    }
  }

  async function run(currencyOverride?: CurrencyCode) {
    setBusy(true);
    setError(null);
    setExportMsg(null);
    try {
      const res = await fetch(`/api/uploads/${uploadId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currencyOverride ? { currency: currencyOverride } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "分析失败");
        return;
      }
      setJob(data);
      setSelected(new Set(data.candidates.map((c: { keyword: string }) => c.keyword)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  const selectedWasted = useMemo(
    () => job?.candidates.filter((c) => selected.has(c.keyword)).reduce((s, c) => s + c.spend_wasted, 0) ?? 0,
    [job, selected]
  );

  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const allSelected = !!job && job.candidates.length > 0 && selected.size === job.candidates.length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">浪费词分析</h2>
        <button
          onClick={() => run(job?.currency_source === "override" ? currency : undefined)}
          disabled={busy || !canAnalyze}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "分析中…" : job ? "重新分析" : "开始分析"}
        </button>
      </div>

      {canAnalyze && !job && !busy && (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          点「开始分析」，几秒内给出疑似浪费词和否词建议。
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {job && job.currency_source === "default" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <span>未能从报告识别币种，金额按 USD（$）显示，阈值也按 USD 计算。如果报告是其他币种，请选择后重新分析：</span>
          <select
            aria-label="选择币种"
            value={rerunCurrency}
            onChange={(e) => setRerunCurrency(e.target.value as CurrencyCode)}
            className="rounded border border-amber-300 bg-white px-2 py-1 text-xs dark:bg-zinc-900"
          >
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => run(rerunCurrency)}
            disabled={busy}
            className="rounded border border-amber-400 px-2 py-1 text-xs hover:bg-amber-100 disabled:opacity-50"
          >
            按此币种重新分析
          </button>
        </div>
      )}
      {job && job.currency_source === "override" && (
        <p className="text-xs text-zinc-500">已按你选择的币种 {currency} 显示金额并计算阈值。</p>
      )}

      {job && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["唯一搜索词", job.summary.unique_terms.toLocaleString()],
              ["总花费", money(job.summary.total_spend)],
              ["否词候选", job.summary.candidate_count.toLocaleString()],
              ["疑似浪费花费", `${money(job.summary.total_spend_wasted)}（${job.summary.wasted_pct_of_spend}%）`, "按报告期内规则估算，非保证节省金额"],
            ].map(([k, v, sub]) => (
              <div key={k} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-500">{k}</p>
                <p className="mt-1 text-lg font-semibold">{v}</p>
                {sub && <p className="mt-1 text-[11px] leading-tight text-zinc-400">{sub}</p>}
              </div>
            ))}
          </div>

          {job.candidates.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">按当前规则未发现明显浪费词。可换近 30–90 天的报告再试。</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="全选"
                        checked={allSelected}
                        onChange={() =>
                          setSelected(allSelected ? new Set() : new Set(job.candidates.map((c) => c.keyword)))
                        }
                      />
                    </th>
                    <th className="px-3 py-2">否定关键词</th>
                    <th className="px-3 py-2">原因</th>
                    <th className="px-3 py-2 text-right">浪费花费</th>
                    <th className="px-3 py-2 text-right">点击</th>
                    <th className="px-3 py-2 text-right">展示</th>
                    <th className="px-3 py-2 text-right">订单</th>
                    <th className="px-3 py-2">匹配</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {job.candidates.map((c) => (
                    <tr key={c.keyword} className={selected.has(c.keyword) ? "" : "opacity-50"}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(c.keyword)} onChange={() => toggle(c.keyword)} />
                      </td>
                      <td className="px-3 py-2 font-medium">{c.keyword}</td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" title={reasonTooltip(c.reason, job.thresholds, currency)}>
                          {c.reason_label_zh} <span aria-hidden className="opacity-60">ⓘ</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{money(c.spend_wasted)}</td>
                      <td className="px-3 py-2 text-right">{c.clicks}</td>
                      <td className="px-3 py-2 text-right">{c.impressions.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{c.orders}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">Negative Exact</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {job.candidates.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <p>已勾选 {selected.size} 个，疑似浪费 {money(selectedWasted)}。</p>
                <p className="text-xs text-zinc-500">
                  导出的否词表仅含 Negative Exact（Keyword Text + Match Type），不区分广告活动。建议先导入浪费最多的那个广告活动试用；如果某个词在其他活动里出过单，就别在那里否定。
                </p>
                {!exportGate.paid && selected.size > exportGate.freeLimit && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    免费版可导出疑似浪费最高的前 {exportGate.freeLimit} 个。完整可导入否词表需 $29/月订阅。
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={exportCsv}
                disabled={exporting || selected.size === 0}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {exporting ? "导出中…" : `导出否词表（${selected.size}）`}
              </button>
            </div>
          )}

          {exportMsg && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <p>{exportMsg.ok}</p>
              {exportMsg.gated && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emerald-200 pt-2 dark:border-emerald-900">
                  <p className="text-amber-800 dark:text-amber-200">{exportMsg.gated}</p>
                  <button type="button" disabled title="即将开放" className="cursor-not-allowed rounded-lg border border-amber-400 px-3 py-1.5 text-xs text-amber-700 opacity-70">
                    $29/月 解锁完整导出 · 即将开放
                  </button>
                </div>
              )}
            </div>
          )}

          {(job.summary.skipped_asin?.count ?? 0) > 0 && (
            <p className="text-xs text-zinc-500">
              另有 {job.summary.skipped_asin.count} 个 ASIN 形式的搜索词（疑似浪费 {money(job.summary.skipped_asin.spend_wasted)}）未列入：这类流量来自商品投放，需用「否定商品投放」处理，否定关键词拦不住。
            </p>
          )}
          <p className="text-xs text-zinc-500">
            出单 ≥ {job.thresholds.min_orders_protected ?? 2} 的搜索词不会建议否定；ACOS 偏高时建议降低竞价。
          </p>
        </>
      )}
    </section>
  );
}
