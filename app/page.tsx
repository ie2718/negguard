"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_MB = 15;

export default function HomePage() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setHint(null);
      if (!/\.(csv|xlsx)$/i.test(file.name)) {
        setError("请上传 Search Term Report 的 .csv 或 .xlsx 文件");
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`访客快检限 ≤${MAX_MB}MB。注册后可分析更大文件。`);
        return;
      }
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "上传失败");
          return;
        }
        if (data.missingRequired?.length) {
          setHint(
            "报告已接收，但缺少必填列，无法分析。"
          );
        }
        router.push(`/uploads/${data.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "网络错误");
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void upload(f);
    },
    [upload]
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          NegGuard
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          找出广告里正在漏掉的搜索词
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          上传 Sponsored Products 的 Search Term Report（CSV 或 XLSX），估算疑似浪费金额，并导出可导入的否词表（Negative Exact）。
        </p>
        <p className="text-sm text-zinc-500">
          访客快检：文件 ≤{MAX_MB}MB / ≤2 万行。完整分析与完整导出需注册 / 订阅。
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
          dragging
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <p className="mb-4 text-lg">
          {busy ? "正在解析报告…" : "将报告（CSV / XLSX）拖到此处，或点击选择文件"}
        </p>
        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white">
          {busy ? "处理中…" : "选择文件"}
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}
      {hint && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {hint}
        </div>
      )}

      <footer className="text-xs text-zinc-500">
        导出的否词表仅含 Negative Exact（Keyword Text + Match Type），不区分广告活动。建议先导入浪费最多的那个广告活动试用；如果某个词在其他活动里出过单，就别在那里否定。
      </footer>
    </main>
  );
}
