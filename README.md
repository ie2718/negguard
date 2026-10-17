# NegGuard MVP

Amazon Search Term Report → 浪费词分析 → 否词导出。  
栈：Next.js App Router + TypeScript + Tailwind + API Routes；Supabase 优先，本地文件回退。

## Day1 范围

- 拖拽/选择 CSV 上传
- 访客限制：≤15MB / ≤2 万行
- 表头归一化与必填列映射（见 `docs/str-column-mapping.md`）
- 结果显示「已上传 X 行」+ 列状态
- 无 Supabase 时写入 `.data/uploads/` + `.data/meta/`

## 本地运行

```bash
cd /workspace/negguard/app
pnpm install
pnpm dev
```

打开 http://localhost:3000

## 环境变量（需老板提供）

复制 `.env.example` → `.env.local`：

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role（仅服务端） |
| `APP_URL` | 默认 `http://localhost:3000` |

未配置时仍可本地演示（JSON 元数据 + 磁盘存 CSV）。配置后会尝试上传到 Storage bucket `search-term-csvs` 并写入 `uploads` 表（见 `supabase/migrations/001_init.sql`）。

Week2：`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID`（$29/月单档）。

## 文档

- `docs/PRD-v0.1.md`
- `docs/architecture.md`
- `docs/str-column-mapping.md`
- `docs/neg-keyword-export.md`
- `docs/waste-reason-enums.md`

## Day2：浪费词规则引擎

- 引擎：`lib/analysis/`（纯 TS，`pnpm test` 运行 vitest）
- API：`POST /api/uploads/[id]/analyze`（可选 body `{ "thresholds": {...} }` 覆盖默认值）；`GET` 同路径取最近一次结果
- 结果持久化：`.data/meta/jobs/<jobId>.json` + `latest_<uploadId>.json`
- reason 枚举与默认阈值见 `docs/waste-reason-enums.md`；Week1 仅 `negativeExact`
- 示例数据：`fixtures/sample-str.csv`

```bash
pnpm test        # 单测
pnpm build       # 生产构建
```

### 规则口径（架构师 2026-10-17）
- 每个搜索词只取**主要理由**（按优先级第一个命中），浪费额只按该理由计，不叠加。
- 低转化浪费额 = `max(0, spend − sales × max_acos)`，`max_acos` 取自配置。
- `irrelevant_modifier` 仅在 **0 订单**时触发；有订单的词不进候选。
- 默认修饰词：free, used, how to, what is, pdf, jobs, 免费, 二手, 教程。英文按整词/整短语匹配（连字符视为空格），中文按子串。
- 排除短语（`irrelevant_modifier_exclusions`，可配置）：sugar free, gluten free, hands free, bpa free（含 hands-free 等连字符写法）。
- 理由标签 tooltip 由本次分析实际使用的阈值生成（`lib/analysis/labels.ts`）。

## Day3：导出 + 真实数据修复

- 上传支持 **CSV 与 XLSX**（同样 ≤15MB / ≤2 万行）；金额支持 `Rs.` `₹` `$` `€` `£` 等币种；花费列无法识别或全为 0 时分析失败并提示。
- 新列名：`Total cost`（花费）、`Purchases`（订单）、带币种后缀的销售额表头。
- 规则：低转化只按 ACOS；出单 ≥2 的词不进候选；浪费额为 0 不进候选；ASIN 搜索词不作为否词导出（单独计数）。
- 导出：`POST /api/uploads/[id]/export`，两列 `Keyword Text,Match Type`（`negativeExact`）。
- 付费闸门桩：`NEGGUARD_FREE_EXPORT_LIMIT`（默认 10）、`NEGGUARD_SIMULATE_PAID=true` 模拟付费。
- **真实卖家数据只能放在仓库外**（如 `/workspace/negguard-validation/`），不得进 `fixtures/` 或提交。仓库内 fixtures 均为合成数据。

## Day4：币种

- 每次上传自动识别币种（Currency 列 / 表头 / 单元格符号），金额按该币种显示；识别不到默认 USD 并提示，可选择币种重新分析。
- 金额阈值按币种静态表取值（无实时汇率），见 `docs/currency-thresholds.md`。
- 修饰词：「X free」属性词不算；`used` 仅限开头。

## Day6：多币种拒绝 / 14 天列 / 15MB

- 同一文件 ≥2 种币种 → 422，提示按站点分别导出（不拆结果）
- `14 Day Total Orders/Sales`（及德文）别名
- 访客快检 **15MB**（行数仍 2 万）

## Day5：德文 / EU + 点击规则花费下限

- 德文表头（Kundensuchbegriff / Impressionen / Klicks / Ausgaben / Bestellungen / Verkaufserlöse …）
- 分号分隔 CSV；欧式数字 `1.234,56` / `12.000`；UTF-8 → Windows-1252，UTF-16 BOM
- 点击规则需花费 ≥ 当前币种 `min_spend_zero_orders / 2`
- 合成夹具：`fixtures/sample-str-de.csv`
