# 币种识别与分币种阈值（Day4 · 2026-10-17）

## 币种识别（每次上传/分析）
优先级：
1. 报告里的 `Currency` 列（取前 500 行中最常见的可识别值，如 `INR`）
2. 金额列表头中的币种：`7 Day Total Sales (₹)`、`Sales ($)`、`Spend (EUR)`
3. 花费/销售额单元格里的币种符号或代码（前 500 行，多数决）：`Rs.` `₹` `INR` → INR；`$` `US$` `USD` → USD；`€` → EUR；`£` → GBP；`¥` → JPY；`CA$` → CAD；`A$`/`AU$` → AUD
4. 都没有 → **默认 USD**，`currency_source = "default"`，结果页显示提示，并可选择币种后重新分析（`POST /api/uploads/[id]/analyze` body `{ "currency": "INR" }`，`currency_source = "override"`）

`currency` / `currency_source` 写入上传元数据和分析任务。结果页、摘要、提示中所有金额都使用该币种符号（₹ 不会显示成 $）。订阅价 `$29/月` 是我们的美元定价，不随报告币种变化。

## 分币种阈值（静态表，无实时汇率）
只换算金额类阈值；点击数、ACOS、出单保护与币种无关。USD = `DEFAULT_THRESHOLDS`。

| 币种 | 倍数（近似） | min_spend_zero_orders | min_spend_low_conv | min_spend_irrelevant | min_spend_global |
|---|---|---|---|---|---|
| USD | ×1 | 5 | 20 | 2 | 1 |
| EUR | ×1 | 5 | 20 | 2 | 1 |
| GBP | ×1 | 5 | 20 | 2 | 1 |
| CAD | ×1.4 | 7 | 28 | 3 | 1.5 |
| AUD | ×1.5 | 7.5 | 30 | 3 | 1.5 |
| INR | ×80 | 400 | 1600 | 160 | 80 |
| JPY | ×150 | 750 | 3000 | 300 | 150 |

不随币种变化：`min_clicks_zero_orders=10`、`max_acos=0.80`、`min_orders_protected=2`。

代码：`lib/currency.ts`（`CURRENCY_THRESHOLDS`，修改时同步本表）。请求体里的 `thresholds` 覆盖仍优先于币种表。

## Day6：多币种整文件拒绝
`detectCurrency` 会汇总 Currency 列、金额表头、花费/销售额单元格中出现的所有币种。若 `found.length ≥ 2`（`mixed: true`）：
- 上传接口返回 422 +「检测到多种币种，请按站点分别导出后再上传。」
- 分析任务同样失败，不拆成多份结果。

## Day5：点击规则的花费下限
`zero_orders_high_clicks` 除 `clicks ≥ min_clicks_zero_orders`（默认 10）外，还要求：

**`spend ≥ min_spend_zero_orders / 2`**（取当前币种阈值）

| 币种 | min_spend_zero_orders | 点击规则花费下限 |
|---|---|---|
| USD / EUR / GBP | 5 | **2.5** |
| CAD | 7 | 3.5 |
| AUD | 7.5 | 3.75 |
| INR | 400 | **200** |
| JPY | 750 | 375 |

避免 INR 等站点上「10 次点击、₹5」被算进浪费。`max_acos` / 点击数阈值本身不随币种变。
