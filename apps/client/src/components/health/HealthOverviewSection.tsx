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
  type HealthIntradayResponse,
} from "@/api/health-data";
import ChartContainer from "@/components/ChartContainer";
import {
  HEALTH_RANGE_DAYS,
  type HealthRangeDays,
} from "@/components/metrics/metric-chart-policy";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMetricColor } from "@/lib/chart-data-utils";
import {
  buildHealthOverviewCards,
  calculateHealthBaseline,
  formatHealthCardValue,
  getHealthBaselineStatus,
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
    description: "支持 1、3、7 天切换",
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
    noTodayData: "今日暂无数据",
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
    description: "Switch between 1, 3, and 7 days",
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
    noTodayData: "No data today",
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
  disabled = false,
  rangeDays,
  setRangeDays,
}: {
  copy: HealthOverviewCopy;
  disabled?: boolean;
  rangeDays: HealthRangeDays;
  setRangeDays: (rangeDays: HealthRangeDays) => void;
}) {
  return (
    <Tabs
      value={rangeDays}
      onValueChange={(next) => setRangeDays(next as HealthRangeDays)}
    >
      <TabsList className="h-7">
        {HEALTH_RANGE_DAYS.map((days) => (
          <TabsTrigger
            key={days}
            value={days}
            disabled={disabled}
            className="h-6 px-1.5 text-mobile-unit pc:text-[10px] md:px-2 md:text-mobile-caption"
          >
            {days}
            {copy.day}
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
  const [rangeDays, setRangeDays] = useState<HealthRangeDays>("1");
  const Icon = HEALTH_CARD_ICONS[card.key];
  const accentColor = getMetricColor(card.key);
  const intradayKey: HealthIntradayMetricKey = isHealthIntradayMetricKey(
    card.key,
  )
    ? card.key
    : "sleep";
  const supportsIntraday = isHealthIntradayMetricKey(card.key);
  const intradayQuery = useHealthIntraday(
    intradayKey,
    supportsIntraday && rangeDays === "1",
    referenceDate,
  );
  const period = useMemo(
    () =>
      buildHealthCardPeriod(card, rangeDays, intradayQuery.data, referenceDate),
    [card, intradayQuery.data, rangeDays, referenceDate],
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
    rangeDays !== "1" &&
    (card.key === "hrv" || card.key === "restingHeartRate");
  const baseline = usesPersonalBaseline
    ? calculateHealthBaseline(period.baselinePoints)
    : null;
  const baselineStatus =
    baseline != null && period.currentAggregate != null
      ? getHealthBaselineStatus(period.currentAggregate, baseline)
      : null;
  const showsOneDayValueSummary =
    rangeDays === "1" &&
    (card.key === "hrv" || card.key === "restingHeartRate");
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
      isLoading={rangeDays === "1" && intradayQuery.isLoading}
      tools={
        <HealthRangeTabs
          copy={copy}
          rangeDays={rangeDays}
          setRangeDays={setRangeDays}
        />
      }
    >
      {period.currentAggregate == null ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {rangeDays === "1" ? copy.noTodayData : copy.noPeriodData}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {!showsOneDayValueSummary ? (
            <div className="flex min-h-9 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-2.5 py-1.5">
              <div className="flex min-w-0 items-baseline gap-1.5">
                {rangeDays !== "1" ? (
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
              <div className="max-w-[48%] shrink-0 truncate text-right text-mobile-unit text-muted-foreground pc:text-[10px]">
                {card.key === "sleep" &&
                rangeDays === "1" &&
                card.latestDate === referenceDate &&
                card.secondaryValue != null
                  ? `${copy.sleepScoreShort} ${Math.round(card.secondaryValue)}`
                  : periodContext}
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
              intraday={rangeDays === "1" ? intradayQuery.data : undefined}
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

function average(values: Array<number | undefined>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finite.length > 0
    ? finite.reduce((total, value) => total + value, 0) / finite.length
    : undefined;
}

export function buildHealthCardPeriod(
  card: HealthOverviewCard,
  rangeDays: HealthRangeDays,
  intraday?: HealthIntradayResponse,
  referenceDate = card.latestDate,
) {
  if (rangeDays === "1") {
    const aggregate = (
      points: HealthIntradayResponse["current"] | undefined,
    ) => {
      const values =
        points
          ?.filter(
            (point) =>
              card.key !== "sleep" ||
              (point.stage ?? "sleep").toLowerCase() !== "awake",
          )
          .map((point) => point.value) ?? [];
      if (card.key === "sleep") {
        return values.length > 0
          ? values.reduce((total, value) => total + value, 0)
          : undefined;
      }
      return average(values);
    };
    const previousDate = new Date(`${referenceDate}T12:00:00`);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateKey = [
      previousDate.getFullYear(),
      String(previousDate.getMonth() + 1).padStart(2, "0"),
      String(previousDate.getDate()).padStart(2, "0"),
    ].join("-");
    const currentPoint = card.points.find(
      (point) => point.date === referenceDate,
    );
    const previousPoint = card.points.find(
      (point) => point.date === previousDateKey,
    );
    return {
      currentPoints: currentPoint ? [currentPoint] : [],
      previousPoints: previousPoint ? [previousPoint] : [],
      baselinePoints: [],
      currentAggregate: aggregate(intraday?.current) ?? currentPoint?.value,
      previousAggregate: aggregate(intraday?.previous) ?? previousPoint?.value,
    };
  }
  const count = Number(rangeDays);
  const referenceIndex = card.points.findIndex(
    (point) => point.date === referenceDate,
  );
  const endIndex =
    referenceIndex >= 0 ? referenceIndex + 1 : card.points.length;
  const currentPoints = card.points.slice(
    Math.max(0, endIndex - count),
    endIndex,
  );
  const previousPoints = card.points.slice(
    Math.max(0, endIndex - count * 2),
    Math.max(0, endIndex - count),
  );
  const currentStartIndex = Math.max(0, endIndex - count);
  const baselinePoints = card.points.slice(
    Math.max(0, currentStartIndex - 21),
    currentStartIndex,
  );
  return {
    currentPoints,
    previousPoints,
    baselinePoints,
    currentAggregate: average(currentPoints.map((point) => point.value)),
    previousAggregate: average(previousPoints.map((point) => point.value)),
  };
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
          disabled
          rangeDays="1"
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
  const [rangeDays, setRangeDays] = useState<HealthRangeDays>("1");
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
          rangeDays={rangeDays}
          setRangeDays={setRangeDays}
        />
      }
    >
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {rangeDays === "1" ? copy.noTodayData : copy.noPeriodData}
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
