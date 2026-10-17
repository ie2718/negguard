# 最小浪费规则 reason 枚举
（来源：架构师小白 · 2026-10-17）

Week1 必须：zero_orders_high_spend、zero_orders_high_clicks
Week1 建议：low_conv_high_spend、irrelevant_modifier
预留：brand_competitor（空表不触发）

默认阈值：min_spend_zero_orders=5, min_clicks_zero_orders=10, min_spend_low_conv=20, max_acos=0.80, min_orders_protected=2, min_spend_irrelevant=2, min_spend_global=1

（`max_cr_low_conv` 已于 Day3 移除，见下。）

配置化，勿写死。结果页展示 label_zh + 花费/点击/订单。

## 默认无关修饰词表（2026-10-17 收紧，对应 commit 45afdee）
free、used、how to、what is、pdf、jobs、免费、二手、教程

- 仅 orders=0 时触发；有订单的词不进候选。
- 英文按完整单词匹配；`free` 排除 sugar/gluten/hands/BPA free（含连字符写法），排除名单可配置。
- 已移除：toy、repair、manual、diy、rental、wholesale、cheap、cheapest（会误伤特定品类或低价卖家；未出单的词由 0 单规则兜底）。

## Day3 真实数据修复（2026-10-17，rules_version w1-2026.10.17b）
- **low_conv_high_spend 仅按 ACOS 触发**：去掉「转化率 ≤ 5%」单独触发；需要 sales 列；`ACOS > max_acos` 才算，浪费额 = max(0, spend − sales × max_acos)。
- **浪费额为 0 的词不进候选。**
- **出单 ≥ min_orders_protected（默认 2）的词永不进候选/导出**（核心出单词应降竞价，不应否定）。因此低转化实际只作用于 1 单的词。
- **ASIN 搜索词**（`^b0[0-9a-z]{8}$`）不作为否定关键词输出；summary.skipped_asin 记录数量与疑似浪费，结果页提示用「否定商品投放」处理。

## Day4（2026-10-17，rules_version w1-2026.10.17c）
- **金额阈值按币种取值**，见 `docs/currency-thresholds.md`（USD 为上方默认值；INR ≈ ×80，如 0 单花费阈值 ₹400）。max_acos 不变。
- **修饰词位置规则**（可配置）：
  - `free` 前面紧跟其他词（「X free」/「X-free」，如 gmo free、preservatives free）视为属性，不算无关修饰词；`for free` 仍算。原排除名单（sugar/gluten/hands/BPA free）保留作兜底。
  - `used` 只在搜索词开头时算（`used earbuds`），`can be used with` 不算。

## Day6（2026-10-17，rules_version w1-2026.10.17e）
- 多币种文件整份拒绝（见 `docs/currency-thresholds.md`）；14 天列别名；访客上限 15MB。

## Day5（2026-10-17，rules_version w1-2026.10.17d）
- **zero_orders_high_clicks** 增加花费下限：`spend ≥ min_spend_zero_orders / 2`（USD $2.5，INR ₹200）。详见 `docs/currency-thresholds.md`。
