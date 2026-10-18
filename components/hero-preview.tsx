const ROWS = [
  ["free replacement filter", "¥4,280"],
  ["how to install filter", "¥3,150"],
  ["used water filter", "¥2,640"],
  ["filter manual pdf", "¥2,410"],
] as const;

export function HeroPreview() {
  return (
    <div className="mx-auto w-full max-w-md lg:max-w-none">
      <p className="mb-3 text-xs font-medium text-muted">示意界面 · 非真实数据</p>
      <div className="grid gap-3">
        <article className="rounded-2xl border border-line bg-card p-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted">疑似浪费</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">¥12,480</p>
              <p className="mt-2 text-xs leading-5 text-muted">按报告期内规则估算，非保证节省</p>
            </div>
            <div className="rounded-xl bg-brand-soft px-3 py-2 text-right">
              <p className="text-[11px] text-brand">否词候选</p>
              <p className="text-lg font-semibold tabular-nums text-brand">4</p>
              <p className="text-[11px] text-brand">Negative Exact</p>
            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-xs font-medium text-muted">示意否词清单</p>
            <p className="text-xs text-muted">匹配</p>
          </div>
          <ul className="divide-y divide-line">
            {ROWS.map(([term, amount]) => (
              <li key={term} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate font-medium">{term}</span>
                <span className="hidden shrink-0 text-xs text-muted sm:inline">Negative Exact</span>
                <span className="w-16 shrink-0 text-right font-medium tabular-nums">{amount}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}
