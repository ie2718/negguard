"use client";

import { useCallback, useId, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary } from "./button-styles";

const MAX_MB = 15;

export function UploadZone() {
  const router = useRouter();
  const helpId = useId();
  const errorId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
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
          setHint("报告已接收，但缺少必填列，无法分析。");
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
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void upload(file);
    },
    [upload]
  );

  const describedBy = [helpId, error ? errorId : "", hint ? hintId : ""].filter(Boolean).join(" ");

  return (
    <div className="scroll-mt-24" id="upload">
      <div className="mb-4 max-w-2xl">
        <h2 className="text-lg font-semibold tracking-tight">上传 Search Term Report</h2>
        <p id={helpId} className="mt-1 text-sm leading-6 text-muted">
          访客快检：文件 ≤{MAX_MB}MB / ≤2 万行。完整分析与完整导出需注册 / 订阅。
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-3xl border bg-card p-2 shadow-card transition-colors ${
          dragging ? "border-brand" : "border-line"
        }`}
      >
        <div
          className={`flex flex-col items-center rounded-[1.25rem] border border-dashed px-6 py-12 text-center sm:py-14 ${
            dragging ? "border-brand bg-brand-soft" : "border-line bg-background/60"
          } ${busy ? "cursor-wait" : ""}`}
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
            <svg viewBox="0 0 24 24" aria-hidden className="size-6" fill="none">
              <path
                d="M12 16V5M8 8.5 12 4.5l4 4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <p className="mt-4 text-base font-medium">
            {busy ? "正在解析报告…" : "将报告拖到此处，或选择文件"}
          </p>
          <p className="mt-1 text-sm text-muted">CSV / XLSX · Sponsored Products Search Term Report</p>
          <button
            type="button"
            className={`${btnPrimary} mt-6`}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy && (
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-on-brand/30 border-t-on-brand"
              />
            )}
            {busy ? "处理中…" : "选择文件"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            tabIndex={-1}
            disabled={busy}
            aria-describedby={describedBy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              event.target.blur();
              if (file) void upload(file);
            }}
          />
        </div>
      </div>

      {error && (
        <div
          id={errorId}
          role="alert"
          className="mt-4 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}
      {hint && (
        <div
          id={hintId}
          role="status"
          className="mt-4 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn"
        >
          {hint}
        </div>
      )}
    </div>
  );
}
