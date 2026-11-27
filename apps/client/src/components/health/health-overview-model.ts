export {
  buildHealthOverviewCards,
  formatHealthHrvLabel,
  getComparableHealthIntraday,
  getSleepTimelineRow,
  type HealthCardKey,
  type HealthChartPoint,
  type HealthOverviewCard,
  buildHealthPeriod as buildHealthCardPeriod,
  calculateHealthBaseline,
  formatHealthDate,
  getHealthBaselineStatus,
  getRecentHealthDate,
  type HealthBaseline,
} from "@shared/health-overview";
import type { HealthOverviewCard } from "@shared/health-overview";

export function formatHealthCardValue(
  card: HealthOverviewCard,
  locale: string,
  value = card.latestValue,
) {
  if (card.key === "sleep") return formatHealthDuration(value, locale);
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: card.key === "spo2" ? 1 : 0,
  }).format(value);
}

export function formatHealthDuration(seconds: number, locale: string) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const unit = (value: number, name: "hour" | "minute") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "short",
    }).format(value);
  return new Intl.ListFormat(locale, { style: "narrow", type: "unit" })
    .format([unit(hours, "hour"), unit(rest, "minute")]);
}
