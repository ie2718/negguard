import Link from "next/link";

const LINKS = [
  { href: "/#features", label: "功能" },
  { href: "/#how", label: "怎么用" },
  { href: "/#pricing", label: "价格" },
  { href: "/#upload", label: "免费快检" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold tracking-tight">NegGuard</p>
          <nav aria-label="页脚">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="max-w-3xl space-y-2 text-xs leading-5 text-muted">
          <p>疑似浪费金额按报告期内规则估算，非保证节省。仅导出 Negative Exact。</p>
          <p>
            导出的否词表仅含 Negative Exact（Keyword Text + Match Type），不区分广告活动。建议先导入浪费最多的那个广告活动试用；如果某个词在其他活动里出过单，就别在那里否定。
          </p>
        </div>
      </div>
    </footer>
  );
}
