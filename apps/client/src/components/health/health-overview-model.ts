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
  if (card.key === "sleep") {
    const totalMinutes = Math.round(value / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return locale.startsWith("zh")
      ? `${hours}小时${minutes}分`
      : `${hours}h ${minutes}m`;
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: card.key === "spo2" ? 1 : 0,
  }).format(value);
}
