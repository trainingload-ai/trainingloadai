"use client";

import {
  Activity,
  BatteryCharging,
  Footprints,
  HeartPulse,
  Moon,
  ShieldPlus,
  Waves,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";
import {
  useHealthIntraday,
  useHealthOverview,
  type HealthIntradayMetricKey,
} from "@/api/health-data";
import ChartContainer from "@/components/ChartContainer";
import {
  getHealthMetricChartPolicy,
  HEALTH_RANGES,
  type HealthRange,
} from "@/components/metrics/metric-chart-policy";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMetricColor } from "@/lib/chart-data-utils";
import {
  buildHealthCardPeriod,
  buildHealthOverviewCards,
  calculateHealthBaseline,
  formatHealthCardValue,
  formatHealthDate,
  getHealthBaselineStatus,
  getRecentHealthDate,
  type HealthCardKey,
  type HealthOverviewCard,
} from "./health-overview-model";

const HealthMetricMiniChart = dynamic(
  () =>
    import("./HealthMetricMiniChart").then(
      (module) => module.HealthMetricMiniChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-full animate-pulse rounded-md bg-muted/50" />
    ),
  },
);

export const HEALTH_CARD_ICONS = {
  sleep: Moon,
  hrv: Waves,
  restingHeartRate: HeartPulse,
  stress: Activity,
  bodyBattery: BatteryCharging,
  spo2: ShieldPlus,
  steps: Footprints,
} satisfies Record<HealthCardKey, typeof Moon>;

const COPY = {
  zh: {
    title: "全天健康",
    description: "查看最近一次记录或多日趋势",
    sleep: "睡眠",
    hrv: "HRV",
    restingHeartRate: "静息心率",
    stress: "压力",
    bodyBattery: "身体电量",
    spo2: "血氧",
    steps: "步数",
    score: "睡眠评分",
    timeAsleep: "总睡眠时间",
    timeInBed: "卧床时间",
    averageTimeAsleep: "平均睡眠时间",
    average: "平均值",
    sleepScoreShort: "评分",
    latest: "最近一次",
    range: "时间范围",
    noRecentData: "近 3 天暂无数据",
    noPeriodData: "所选时段暂无数据",
    noComparison: "暂无环比数据",
    comparison: "环比",
    withinBaseline: "基线内",
    aboveBaseline: "高于基线",
    belowBaseline: "低于基线",
    buildingBaseline: "正在建立基线",
    day: "天",
  },
  en: {
    title: "Daily health",
    description: "View the latest reading or trends over several days",
    sleep: "Sleep",
    hrv: "HRV",
    restingHeartRate: "Resting HR",
    stress: "Stress",
    bodyBattery: "Body Battery",
    spo2: "Blood oxygen",
    steps: "Steps",
    score: "Sleep score",
    timeAsleep: "Time asleep",
    timeInBed: "Time in bed",
    averageTimeAsleep: "Average time asleep",
    average: "average",
    sleepScoreShort: "Score",
    latest: "Latest",
    range: "Time range",
    noRecentData: "No data in the last 3 days",
    noPeriodData: "No data in this period",
    noComparison: "No comparison data",
    comparison: "vs prior",
    withinBaseline: "Within baseline",
    aboveBaseline: "Above baseline",
    belowBaseline: "Below baseline",
    buildingBaseline: "Building baseline",
    day: "d",
  },
} as const;

export type HealthOverviewCopy = (typeof COPY)[keyof typeof COPY];

export function getHealthOverviewCopy(locale: string): HealthOverviewCopy {
  return locale.startsWith("zh") ? COPY.zh : COPY.en;
}

function HealthRangeTabs({
  copy,
  metricKey,
  disabled = false,
  rangeDays,
  setRangeDays,
}: {
  copy: HealthOverviewCopy;
  metricKey: HealthCardKey;
  disabled?: boolean;
  rangeDays: HealthRange;
  setRangeDays: (rangeDays: HealthRange) => void;
}) {
  return (
    <Tabs
      value={rangeDays}
      onValueChange={(next) => setRangeDays(next as HealthRange)}
    >
      <TabsList className="h-7" aria-label={`${copy[metricKey]} · ${copy.range}`}>
        {HEALTH_RANGES.map((days) => (
          <TabsTrigger
            key={days}
            value={days}
            disabled={disabled}
            className="h-6 px-1.5 text-mobile-unit pc:text-[10px] md:px-2 md:text-mobile-caption"
          >
            {days === "latest" ? copy.latest : `${days}${copy.day}`}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function HealthMetricCard({
  card,
  referenceDate = card.latestDate,
  locale,
  copy,
  className,
  height = "h-[112px]",
  appearance = "default",
}: {
  card: HealthOverviewCard;
  referenceDate?: string;
  locale: string;
  copy: HealthOverviewCopy;
  className?: string;
  height?: string;
  appearance?: "default" | "soft";
}) {
  const [rangeDays, setRangeDays] = useState(
    getHealthMetricChartPolicy(card.key).defaultRangeDays,
  );
  const isLatest = rangeDays === "latest";
  const recentDate = getRecentHealthDate(card.latestDate, referenceDate);
  const Icon = HEALTH_CARD_ICONS[card.key];
  const accentColor = getMetricColor(card.key);
  const intradayKey: HealthIntradayMetricKey = isHealthIntradayMetricKey(
    card.key,
  )
    ? card.key
    : "sleep";
  const showIntraday =
    isLatest && recentDate != null && isHealthIntradayMetricKey(card.key);
  const intradayQuery = useHealthIntraday(intradayKey, showIntraday, recentDate);
  const intraday =
    showIntraday && intradayQuery.data?.currentDate === recentDate
      ? intradayQuery.data
      : undefined;
  const period = useMemo(
    () =>
      buildHealthCardPeriod(card, rangeDays, intraday, referenceDate),
    [card, intraday, rangeDays, referenceDate],
  );
  const comparison = formatComparison(
    card,
    locale,
    period.currentAggregate,
    period.previousAggregate,
  );
  const value =
    period.currentAggregate == null
      ? "—"
      : formatHealthCardValue(card, locale, period.currentAggregate);
  const usesPersonalBaseline =
    !isLatest && (card.key === "hrv" || card.key === "restingHeartRate");
  const baseline = usesPersonalBaseline
    ? calculateHealthBaseline(period.baselinePoints)
    : null;
  const baselineStatus =
    baseline != null && period.currentAggregate != null
      ? getHealthBaselineStatus(period.currentAggregate, baseline)
      : null;
  const showsLatestValueSummary =
    isLatest && (card.key === "hrv" || card.key === "restingHeartRate");
  const periodContext = usesPersonalBaseline
    ? baselineStatus
      ? copy[`${baselineStatus}Baseline`]
      : copy.buildingBaseline
    : comparison
      ? `${copy.comparison} ${comparison}`
      : period.currentAggregate != null
        ? copy.noComparison
        : null;
  return (
    <ChartContainer
      title={copy[card.key]}
      titleIcon={<Icon className="h-4 w-4" />}
      accentColor={accentColor}
      className={className}
      height={height}
      appearance={appearance}
      isLoading={showIntraday && intradayQuery.isLoading}
      tools={
        <HealthRangeTabs
          copy={copy}
          metricKey={card.key}
          rangeDays={rangeDays}
          setRangeDays={setRangeDays}
        />
      }
    >
      {period.currentAggregate == null ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {rangeDays === "7" ? copy.noPeriodData : copy.noRecentData}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {!showsLatestValueSummary ? (
            <div className="flex min-h-9 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-2.5 py-1.5">
              <div className="flex min-w-0 items-baseline gap-1.5">
                {!isLatest ? (
                  <span className="shrink-0 text-mobile-unit text-muted-foreground pc:text-[10px]">
                    {copy.average}
                  </span>
                ) : null}
                <span className="truncate font-mono text-sm font-semibold tabular-nums text-foreground">
                  {value}
                </span>
                {card.key !== "sleep" && card.latestUnit ? (
                  <span className="shrink-0 text-mobile-unit text-muted-foreground pc:text-[10px]">
                    {card.latestUnit}
                  </span>
                ) : null}
              </div>
              <div className="flex max-w-[55%] shrink-0 items-center gap-1 text-right text-mobile-unit text-muted-foreground pc:text-[10px]">
                {isLatest && recentDate ? (
                  <>
                    <span className="truncate">
                      {card.key === "sleep" && card.secondaryValue != null
                        ? `${copy.sleepScoreShort} ${Math.round(card.secondaryValue)}`
                        : periodContext}
                    </span>
                    <time className="shrink-0" dateTime={recentDate}>
                      {formatHealthDate(recentDate, locale)}
                    </time>
                  </>
                ) : (
                  <span className="truncate">{periodContext}</span>
                )}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <HealthMetricMiniChart
              card={card}
              locale={locale}
              rangeDays={rangeDays}
              currentPoints={period.currentPoints}
              previousPoints={period.previousPoints}
              baseline={baseline}
              intraday={intraday}
            />
          </div>
        </div>
      )}
    </ChartContainer>
  );
}

function isHealthIntradayMetricKey(
  key: HealthCardKey,
): key is HealthIntradayMetricKey {
  return ["sleep", "hrv", "restingHeartRate", "stress", "bodyBattery"].includes(
    key,
  );
}

function formatComparison(
  card: HealthOverviewCard,
  locale: string,
  current?: number,
  previous?: number,
) {
  if (current == null || previous == null) return null;
  const delta = current - previous;
  const arrow = Math.abs(delta) < 0.05 ? "→" : delta > 0 ? "↑" : "↓";
  if (card.key === "sleep") {
    const minutes = Math.round(Math.abs(delta) / 60);
    return `${arrow} ${minutes}${locale.startsWith("zh") ? "分" : "m"}`;
  }
  const value = new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.abs(delta) >= 10 ? 0 : 1,
  }).format(Math.abs(delta));
  return `${arrow} ${value}${card.latestUnit ? ` ${card.latestUnit}` : ""}`;
}

export function HealthMetricCardLoading({
  metricKey,
  copy,
  height = "h-[112px]",
  appearance = "default",
}: {
  metricKey: HealthCardKey;
  copy: HealthOverviewCopy;
  height?: string;
  appearance?: "default" | "soft";
}) {
  const Icon = HEALTH_CARD_ICONS[metricKey];
  return (
    <ChartContainer
      title={copy[metricKey]}
      titleIcon={<Icon className="h-4 w-4" />}
      accentColor={getMetricColor(metricKey)}
      height={height}
      appearance={appearance}
      isLoading
      tools={
        <HealthRangeTabs
          copy={copy}
          metricKey={metricKey}
          disabled
          rangeDays={getHealthMetricChartPolicy(metricKey).defaultRangeDays}
          setRangeDays={() => undefined}
        />
      }
    />
  );
}

export function HealthMetricCardEmpty({
  metricKey,
  copy,
  height = "h-[112px]",
  appearance = "default",
}: {
  metricKey: HealthCardKey;
  copy: HealthOverviewCopy;
  height?: string;
  appearance?: "default" | "soft";
}) {
  const [rangeDays, setRangeDays] = useState(
    getHealthMetricChartPolicy(metricKey).defaultRangeDays,
  );
  const Icon = HEALTH_CARD_ICONS[metricKey];
  return (
    <ChartContainer
      title={copy[metricKey]}
      titleIcon={<Icon className="h-4 w-4" />}
      accentColor={getMetricColor(metricKey)}
      height={height}
      appearance={appearance}
      tools={
        <HealthRangeTabs
          copy={copy}
          metricKey={metricKey}
          rangeDays={rangeDays}
          setRangeDays={setRangeDays}
        />
      }
    >
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {rangeDays === "7" ? copy.noPeriodData : copy.noRecentData}
      </div>
    </ChartContainer>
  );
}

export function HealthOverviewSection({
  appearance = "default",
}: {
  appearance?: "default" | "soft";
} = {}) {
  const locale = useLocale();
  const copy = getHealthOverviewCopy(locale);
  const query = useHealthOverview(30);
  const cards = useMemo(
    () =>
      buildHealthOverviewCards(query.data?.days ?? []).filter((card) =>
        ["sleep", "hrv", "restingHeartRate"].includes(card.key),
      ),
    [query.data?.days],
  );

  if (query.isPending) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              key={index}
              className={
                appearance === "soft"
                  ? "h-56 rounded-surface"
                  : "h-56 rounded-xl"
              }
            />
          ))}
        </div>
      </section>
    );
  }

  if (cards.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="health-overview-full">
      <div className="flex items-baseline gap-2">
        <h2
          id="health-overview-full"
          className="text-sm font-semibold text-foreground"
        >
          {copy.title}
        </h2>
        <span
          className={
            appearance === "soft"
              ? "hidden text-mobile-caption pc:text-xs text-muted-foreground pc:inline"
              : "text-mobile-caption pc:text-xs text-muted-foreground"
          }
        >
          {copy.description}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <HealthMetricCard
            key={card.key}
            card={card}
            referenceDate={query.data?.endDate}
            locale={locale}
            copy={copy}
            appearance={appearance}
            height="h-[188px] md:h-[204px]"
          />
        ))}
      </div>
    </section>
  );
}
