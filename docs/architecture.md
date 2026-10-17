# NegGuard MVP · 架构草案（对齐架构师）

更新：2026-10-17

## 目标

上传亚马逊 Search Term CSV → 浪费词/否词分析 → 导出否词表；自助注册 + 付费。

## 技术栈（已对齐）

| 层 | 优先方案 | 回退 |
|---|---|---|
| 前端/API | Next.js + App Router + API Routes | — |
| 鉴权 + DB + 文件 | **Supabase**（Postgres + Auth + Storage） | 自建 Postgres + S3/R2 |
| 分析 | Week1 同步处理（同请求/短任务） | 后加队列 |
| 支付 | **Week2** Stripe Checkout + Webhook | — |

## 产品规则（暂定）

### 导出

- 完整版目标列：`Campaign Name`, `Keyword Text`, `Match Type`
- Match Type 默认：`negative exact`
- **首版**：全站级否词清单两列 `Keyword Text` + `Match Type`
- 结果页注明：需用户在广告后台对应广告活动中自行导入

### 额度

- 未登录：1 次小文件快检（≤15MB / ≤2 万行）
- 注册免费：每月 1 次完整分析
- 超出 → 引导 `$29/月` 单档订阅

## Week1 Happy Path（Day1–3）

1. **Day1**：脚手架；CSV 上传 → 校验 → 落库/Storage；UI 显示「已上传 X 行」
2. **Day2**：浪费词规则引擎（高花费、高点击、0 转化等）→ 结果列表 + 理由
3. **Day3**：导出否词 CSV（两列）+ 假登录/Supabase Auth 可进演示；Stripe stub

验收：真实 Search Term CSV → 出表 → 下载，无需改代码。

## 核心数据模型（草案）

- `profiles`：用户、订阅状态、月度用量
- `uploads`：文件元数据、行数、大小、状态
- `analysis_jobs`：任务状态、规则版本、错误信息
- `negative_keywords`：词、match type、理由、关联 upload/job

## 环境变量清单（Supabase 优先）

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=          # 可选，若用 Prisma/Drizzle 直连
APP_URL=
# Week2
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
```

## 明确砍掉（2 周内）

多账户/团队、Amazon Ads API、ML 推荐、多语言/白标、复杂计费、运营后台、审批流。

## 已入库规范（建仓后迁入 repo /docs）

- `str-column-mapping.md`：STR 表头映射（架构师）
- `neg-keyword-export.md`：否词导出简易版 + Bulk 版（架构师）

### 与产品暂定的对齐备注

- 产品首版：全站级两列 `Keyword Text` + `Match Type`（默认 negative exact）
- 架构：简易版含 reason / spend_wasted 等；另有 Bulk 友好版
- **D3 建议**：默认下载「产品两列」；结果页可勾选导出架构「简易版」；Bulk 可选开关。不阻塞 Day1–2。

## 定价与漏斗（产品正式收口）

- 仅单档 **$29/月**（不做 $79）
- 漏斗：未登录 1 次快检 → 注册每月 1 次完整分析 → 付费解锁完整导出
- 规范文件：`waste-reason-enums.md` 已齐
