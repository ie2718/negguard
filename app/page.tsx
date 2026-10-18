import { HeroPreview } from "@/components/hero-preview";
import { UploadZone } from "@/components/upload-zone";
import { btnPrimary, btnSecondary } from "@/components/button-styles";

const PAINS = [
  "Auto / Broad 开了很久，却很少认真看 Search Term Report",
  "ACOS 漂着，说不清钱花在哪些真实搜索词上",
  "否词表很薄，或只凭感觉偶发否定",
  "全托管太贵，只想先把漏水堵住",
];

const TRUST = [
  "月广告花费约 $1,500+",
  "CSV / XLSX 即可",
  "不必先开 Ads API",
  "对照：全托管 PPC 常见 $500–$1,500+/月",
];

const STEPS = [
  {
    title: "上传报告",
    body: "导出 Sponsored Products 的 Search Term Report（CSV 或 XLSX）并上传。",
  },
  {
    title: "看疑似浪费",
    body: "查看疑似浪费金额与否词建议（规则可解释）。",
  },
  {
    title: "导出否词",
    body: (
      <>
        导出 Keyword Text + Match Type（negativeExact），
        <br />
        在广告后台选广告活动导入。
      </>
    ),
  },
];

const LIMITS = [
  "不接 Amazon Ads API（首版 CSV 优先）",
  "不做全托管 PPC、代改竞价",
  "不保证 ACOS 降到某数字",
  "不接刷单 / 灰产",
];

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main id="main" className="flex-1">
      <section className="mx-auto grid w-full max-w-[1120px] px-5 pb-6 pt-12 sm:pt-16 lg:grid-cols-2 lg:gap-x-16 lg:pt-20">
        <div className="lg:col-start-1 lg:row-start-1">
          <p className="text-sm font-medium text-brand">自助快检 · 不托管投放</p>
          <h1 className="mt-3 max-w-xl text-[1.75rem] font-semibold leading-[1.28] tracking-[-0.02em] text-balance sm:text-4xl sm:leading-[1.2] lg:text-[2.65rem]">
            你的亚马逊广告费，有一块正在「搜索词」里漏掉。
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted sm:text-lg">
            上传 Sponsored Products 的 Search Term Report，几分钟内估算疑似浪费金额，导出可导入的 Negative Exact 否词表。不做全托管，不保证 ACOS——只交你能核对的清单。
          </p>

          <div id="features" className="mt-8 scroll-mt-24 max-w-xl">
            <h2 className="text-sm font-semibold">你是不是这样</h2>
            <ul className="mt-3 space-y-2.5">
              {PAINS.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-muted">
                  <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-brand" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-medium">以上 ≥2 条，NegGuard 就是为你准备的。</p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#upload" className={btnPrimary}>
              免费快检
              <Arrow />
            </a>
            <a href="#pricing" className={btnSecondary}>
              $29/月解锁完整导出
            </a>
          </div>

          <ul className="mt-6 grid max-w-xl gap-x-6 gap-y-2 text-sm text-muted sm:grid-cols-2">
            {TRUST.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="order-3 mt-10 lg:order-none lg:col-start-2 lg:row-start-1 lg:mt-0 lg:self-center">
          <HeroPreview />
        </div>

        <div className="order-2 mt-12 lg:order-none lg:col-span-2 lg:row-start-2 lg:mt-16">
          <UploadZone />
        </div>
      </section>

      <section id="how" className="scroll-mt-24 pb-16 pt-4 sm:pb-20 sm:pt-8">
        <div className="mx-auto w-full max-w-[1120px] px-5">
          <p className="text-sm font-medium text-brand">怎么用</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            三步，从报告到可导入否词表
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            你自己核对清单，再在广告后台导入。NegGuard 不代改竞价。
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-line bg-card p-6 shadow-card">
                <span aria-hidden className="font-mono text-sm text-brand">
                  0{index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-2xl border border-line bg-card px-5 py-4 text-sm leading-6 text-muted">
            <span className="font-medium text-foreground">导入前提示。 </span>
            导出表不区分广告活动；建议先导入浪费最多的那个活动试用。
          </p>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 border-y border-line bg-card/70 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-[1120px] px-5">
          <p className="text-sm font-medium text-brand">价格</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">免费快检，或 Pro $29/月</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            只有这两档。不做 $79 档。不保证 ACOS / 销量结果。
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <article className="flex h-full flex-col rounded-2xl border border-line bg-card p-6 shadow-card sm:p-8">
              <h3 className="text-lg font-semibold">免费快检</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">$0</span>
              </p>
              <dl className="mt-6 space-y-4 text-sm">
                <div>
                  <dt className="text-muted">分析</dt>
                  <dd className="mt-1 leading-6">访客快检 / 注册后每月 1 次完整分析</dd>
                </div>
                <div>
                  <dt className="text-muted">导出</dt>
                  <dd className="mt-1 leading-6">受限（如前 10 行）</dd>
                </div>
              </dl>
              <a href="#upload" className={`${btnPrimary} mt-8 w-full`}>
                免费快检
              </a>
            </article>

            <article className="flex h-full flex-col rounded-2xl border border-brand/30 bg-card bg-[linear-gradient(180deg,var(--brand-soft),transparent_8rem)] p-6 shadow-card sm:p-8">
              <h3 className="text-lg font-semibold">Pro</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">$29</span>
                <span className="text-sm text-muted">/月</span>
              </p>
              <dl className="mt-6 space-y-4 text-sm">
                <div>
                  <dt className="text-muted">分析</dt>
                  <dd className="mt-1 leading-6">多次完整分析</dd>
                </div>
                <div>
                  <dt className="text-muted">导出</dt>
                  <dd className="mt-1 leading-6">完整可导入否词表</dd>
                </div>
              </dl>
              <button type="button" disabled title="即将开放" className={`${btnSecondary} mt-8 w-full`}>
                $29/月 · 即将开放
              </button>
              <p className="mt-3 text-center text-xs leading-5 text-muted">
                订阅支付即将开放。现在可以先做免费快检。
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="limits" className="scroll-mt-24 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-[1120px] px-5">
          <p className="text-sm font-medium text-brand">范围</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">明确不做</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {LIMITS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-line bg-card px-4 py-4 text-sm leading-6 shadow-card"
              >
                <span aria-hidden className="mt-0.5 font-medium text-muted">
                  —
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
