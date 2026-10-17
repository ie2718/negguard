# 否词导出列规范
（来源：架构师小白 · 2026-10-17）

## 简易版 neg_keywords_simple.csv（默认）
keyword, match_type (negativeExact|negativePhrase), reason, spend_wasted, source_search_term

UI 勾选后再导出；同 job 内 (keyword+match_type) 去重。

## Bulk 友好版 neg_keywords_bulk.csv（可选）
Campaign Name, Ad Group Name, Keyword Text, Match Type, Status=enabled, Record Type=Keyword

## Week1 匹配类型决定（CEO 2026-10-17）
- Week1 仅输出 `negativeExact`（UI 显示 Negative Exact）。
- `negativePhrase` = **Week2 可选**（规则引擎 `MatchType` 类型已预留扩展点，当前未启用）。

## Day3 实现（2026-10-17）
- 默认导出文件：两列 `Keyword Text`, `Match Type`；Match Type 固定 `negativeExact`。
- `POST /api/uploads/[id]/export` body `{ "keywords": [...] }`：按结果页同一归一化规则去重，校验必须属于该上传最近一次成功分析的候选，未知词 → 400。输出顺序同结果页（疑似浪费降序）。
- 付费闸门（Stripe 前的桩）：未付费最多导出前 N 个（`NEGGUARD_FREE_EXPORT_LIMIT`，默认 10），超出显示 $29/月 解锁文案；`NEGGUARD_SIMULATE_PAID=true` 模拟付费。无真实计费。
- 简易版（含 reason/spend_wasted）与 Bulk 版尚未实现。

## Day4 文案
- 导出说明：「导出的否词表不区分广告活动。建议先导入浪费最多的那个广告活动试用；如果某个词在其他活动里出过单，就别在那里否定。」
