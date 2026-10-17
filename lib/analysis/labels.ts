import { formatMoney, type CurrencyCode } from "@/lib/currency";
import type { Thresholds, WasteReason } from "./types";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Customer-facing tooltip per reason, built from the thresholds actually used (never hard-coded). */
export function reasonTooltip(reason: WasteReason, th: Thresholds, currency: CurrencyCode = "USD"): string {
  const m = (n: number) => formatMoney(n, currency, { compact: true });
  switch (reason) {
    case "zero_orders_high_spend":
      return `花费 ≥ ${m(th.min_spend_zero_orders)} 且 0 订单`;
    case "zero_orders_high_clicks":
      return `点击 ≥ ${th.min_clicks_zero_orders}、花费 ≥ ${m(th.min_spend_zero_orders / 2)} 且 0 订单`;
    case "low_conv_high_spend":
      return `仅 1 单、花费 ≥ ${m(th.min_spend_low_conv)} 且 ACOS > ${pct(th.max_acos)}；ACOS 超 ${pct(th.max_acos)} 的部分计为浪费。出单 ≥ ${th.min_orders_protected} 的词不建议否定`;
    case "irrelevant_modifier": {
      const sample = th.irrelevant_modifiers.filter((x) => /^[\x00-\x7f]+$/.test(x)).slice(0, 3);
      return `搜索词含 ${sample.join(" / ")} 等无关修饰词（「X free」属性词不算，used 仅限开头），花费 ≥ ${m(th.min_spend_irrelevant)} 且 0 订单`;
    }
    case "brand_competitor":
      return "竞品/品牌词";
  }
}
