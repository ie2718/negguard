# STR 列映射表草案
（来源：架构师小白 · 2026-10-17）

内部字段 snake_case；解析时对表头：trim、小写、去空格/下划线/连字符归一化后再匹配。

| 内部字段 | 必填 | 常见英文 | 常见中文 | 常见德文 |
|---|---|---|---|---|
| search_term | ✅ | Customer Search Term, Search Term, Query | 客户搜索词, 搜索词 | Kundensuchbegriff |
| impressions | ✅ | Impressions | 展示量, 曝光量 | Impressionen |
| clicks | ✅ | Clicks | 点击量 | Klicks |
| spend | ✅ | Spend, Cost, Total Spend, **Total cost** | 花费, 支出 | Ausgaben, Kosten, Gesamtkosten |
| orders | ✅ | 7 Day Total Orders (#), **14 Day Total Orders (#)**, Orders, **Purchases** | 7/14天总订单数(#), 订单数 | Bestellungen, 7/14 Tage Gesamtbestellungen (#) |
| sales | 建议 | 7 Day Total Sales, **14 Day Total Sales**, Sales, Total Sales；含币种后缀亦可 | 7/14天总销售额, 销售额 | Verkaufserlöse, Verkäufe, Umsatz, 7/14 Tage Verkaufserlöse |
| campaign_name | 建议 | Campaign Name, Campaign Name (Informational only)（Bulk） | 广告活动名称 | Kampagnenname |
| ad_group_name | 建议 | Ad Group Name, Ad Group Name (Informational only)（Bulk） | 广告组名称 | Anzeigengruppenname |

缺必填列 → Job failed。首版只认 Sponsored Products STR。

## 更新（2026-10-17 · Day3 真实数据修复）
- **表头归一化**：trim、小写；去掉括号内币种（`($)` `(₹)` `(USD)` `(INR)` `(Rs.)` 等）与 `(Informational only)`；去掉货币符号；再去空格/下划线/连字符/括号。`(#)` 保留。
- **金额解析**：支持前后缀币种 `Rs.` `Rs ` `₹` `$` `US$` `CA$` `€` `£` `¥` `INR`/`USD`/`EUR`… 、千分位、欧式小数 `1.234,56`、括号负数。
- **花费列校验**：花费列全部无法识别、超过 5% 无法识别、或解析后合计为 0 → 分析任务失败并给出示例值，不再静默输出 0。
- **文件格式**：CSV 与 XLSX。XLSX 取第一个表头能匹配 STR 必填列的工作表（如 Bulk 文件里的 `SP Search Term Report`），否则第一个工作表；表头可在前 10 行内（跳过报告标题行）。
- 已知未处理：欧式无小数千分位 `1.234`（会被读成 1.234）；SB 报告 14 天列。

## 更新（2026-10-17 · Day5 德文 / EU）
- **德文表头**：见上表；归一化会去掉变音符号（ö→o、ü→u、ß→ss），故 `Verkaufserlöse` 与 `Verkaufserlose` 等价。
- **分号 CSV**：欧陆导出常用 `;` 分隔；解析时自动在 `,` / `;` / tab 间选择（优先能映射全部必填列的分隔符）。
- **欧式数字**：`1.234,56`、`12.000`（千分位无小数）、`12,50`；美式 `$1,234.50` / `12.5` 仍可用。
- **编码**：UTF-8（含 BOM）→ 失败则 Windows-1252；识别 UTF-16LE/BE BOM。
- **Day6**：
  - 同一文件出现 ≥2 种币种符号/代码 → **整文件拒绝**（请按站点分别导出后再上传），不拆成多份结果。
  - 14 天归因列（Sponsored Brands 等）：`14 Day Total Orders (#)` / `14 Day Total Sales` 及德文等价。
  - 访客快检文件上限 **15MB**（行数仍 ≤2 万）。
- **仍未做**：混币文件自动拆分、访客行数上限放宽。
