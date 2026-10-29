"use client";

import {
  ArrowRight,
  Activity,
  BarChart3,
  CircleGauge,
  Flame,
  HeartPulse,
  LineChart,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useDashboardPMC, useRecentPMCData } from "@/api/usePMC";
import { useUserBasicInfo, useUserProfile } from "@/hooks/useUserProfile";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

type TranslateFn = ReturnType<typeof useTranslations>;

function buildMetricCards(t: TranslateFn) {
  return [
    {
      key: "trainingLoad",
      title: t("metricCards.trainingLoad.title"),
      body: t("metricCards.trainingLoad.body"),
      icon: Flame,
      value: "--",
      href: "/pmc",
    },
    {
      key: "power",
      title: t("metricCards.power.title"),
      body: t("metricCards.power.body"),
      icon: Zap,
      value: "--",
      href: "/power",
    },
    {
      key: "heartRate",
      title: t("metricCards.heartRate.title"),
      body: t("metricCards.heartRate.body"),
      icon: HeartPulse,
      value: "--",
      href: "/heart-rate",
    },
    {
      key: "pace",
      title: t("metricCards.pace.title"),
      body: t("metricCards.pace.body"),
      icon: Activity,
      value: "--",
      href: "/pace",
    },
  ];
}

function formatPace(paceSeconds?: number | null) {
  if (!paceSeconds || !Number.isFinite(paceSeconds) || paceSeconds <= 0) {
    return "--";
  }
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatNumber(value: number | undefined, digits: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "--";
}

function formatInteger(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "--";
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-md border border-border/70 bg-background/95 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionTitle({
  title,
  action,
  t,
}: {
  title: string;
  action?: string;
  t: TranslateFn;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action ? (
        <button
          type="button"
          onClick={() => toast.message(t("toast.inProgress"))}
          className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export default function V2MetricsPage() {
  const t = useTranslations("V2MetricsPage");
  useSetPageTitle(t("header.title"));
  const { data: pmcData } = useRecentPMCData();
  const { fitnessData, acRatioValue, tsbValue, monotonyValue } =
    useDashboardPMC();
  const { ftp, lthr } = useUserBasicInfo();
  const { data: userProfile } = useUserProfile();

  const trend = useMemo(() => {
    const source = (pmcData ?? [])
      .filter((item) => Number.isFinite(item.value))
      .slice(-6);

    if (source.length === 0) return [];

    return source.map((item, index) => ({
      label: `D${index + 1}`,
      value: Math.round(item.value ?? 0),
      ctl: Math.round(item.fitness ?? 0),
      atl: Math.round(item.fatigue ?? 0),
    }));
  }, [pmcData]);

  const maxLoad = Math.max(1, ...trend.map((item) => item.value));
  const latestTrend = trend.length > 0 ? trend[trend.length - 1] : null;
  const previousTrend = trend.length > 1 ? trend[trend.length - 2] : null;
  const loadTotal =
    typeof fitnessData?.ctl === "number"
      ? Math.round(fitnessData.ctl)
      : latestTrend
        ? latestTrend.ctl
        : null;
  const loadDone =
    typeof fitnessData?.atl === "number"
      ? Math.round(fitnessData.atl)
      : latestTrend
        ? latestTrend.atl
        : null;

  const trendDeltaText = useMemo(() => {
    if (!latestTrend || !previousTrend || previousTrend.value <= 0) return "--";
    const diff =
      ((latestTrend.value - previousTrend.value) / previousTrend.value) * 100;
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(1)}%`;
  }, [latestTrend, previousTrend]);

  const metricCards = useMemo(() => {
    const cards = buildMetricCards(t);
    return cards.map((item) => {
      if (item.key === "trainingLoad") {
        return {
          ...item,
          value: `${formatInteger(loadDone)} / ${formatInteger(loadTotal)}`,
        };
      }
      if (item.key === "power") {
        return { ...item, value: ftp ? `FTP ${Math.round(ftp)}w` : "--" };
      }
      if (item.key === "heartRate") {
        return { ...item, value: lthr ? `LTHR ${Math.round(lthr)}` : "--" };
      }
      if (item.key === "pace") {
        return {
          ...item,
          value: formatPace(userProfile?.aerobicThresholdPaceSec ?? null),
        };
      }
      return item;
    });
  }, [ftp, loadDone, loadTotal, lthr, t, userProfile?.aerobicThresholdPaceSec]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3 md:gap-4">
      <header className="rounded-md border border-border/70 bg-background/95 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-mobile-caption pc:text-xs text-muted-foreground">
              {t("header.badge")}
            </div>
            <h1 className="mt-1 text-xl font-semibold md:text-2xl">
              {t("header.title")}
            </h1>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t("header.description")}
            </p>
          </div>
          <div className="shrink-0 rounded-md bg-muted px-3 py-2 text-right">
            <div className="text-mobile-unit pc:text-[10px] text-muted-foreground">
              {t("header.coreMetric")}
            </div>
            <div className="text-sm font-semibold">
              {formatInteger(loadDone)}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-4">
        <div className="order-4 min-w-0 md:col-start-2 md:row-start-1 md:order-none">
          <Panel className="p-4">
            <SectionTitle title={t("explanation.title")} t={t} />
            <p className="text-sm leading-5 text-muted-foreground">
              {t("explanation.body")}
            </p>
          </Panel>
        </div>

        <div className="order-2 min-w-0 md:col-start-2 md:row-start-2 md:order-none">
          <Panel className="p-4">
            <SectionTitle title={t("weeklyFocus.title")} t={t} />
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-md bg-muted/35 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <Flame className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    {t("weeklyFocus.loadProgress.label")}
                  </span>
                </span>
                <span className="font-semibold">
                  {formatNumber(acRatioValue, 2)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/35 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <HeartPulse className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    {t("weeklyFocus.hrDrift.label")}
                  </span>
                </span>
                <span className="font-semibold">
                  {formatNumber(tsbValue, 1)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/35 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    {t("weeklyFocus.intensityDistribution.label")}
                  </span>
                </span>
                <span className="font-semibold">
                  {formatNumber(monotonyValue, 2)}
                </span>
              </div>
            </div>
          </Panel>
        </div>

        <main className="order-1 flex min-w-0 flex-col gap-3 md:gap-4 md:col-start-1 md:row-span-2 md:row-start-1 md:order-none">
          <Panel className="p-4">
            <SectionTitle
              title={t("loadTrend.title")}
              action={t("loadTrend.viewLoad")}
              t={t}
            />
            <div className="rounded-md border border-border/60 bg-gradient-to-b from-muted/35 to-background p-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-semibold md:text-3xl">
                    {formatInteger(loadTotal)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {trendDeltaText}
                  </div>
                </div>
                <div className="rounded-md bg-background px-3 py-2 text-right">
                  <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                    {t("loadTrend.currentDone")}
                  </div>
                  <div className="text-sm font-semibold">
                    {formatInteger(loadDone)}
                  </div>
                </div>
              </div>
              {trend.length === 0 ? (
                <div className="mt-5 rounded-md border border-dashed border-border/70 bg-background/70 p-4">
                  <div className="text-sm font-semibold">
                    {t("loadTrend.emptyTitle")}
                  </div>
                  <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                    {t("loadTrend.emptyDescription")}
                  </p>
                </div>
              ) : (
                <div className="mt-5 flex h-32 items-end gap-2">
                  {trend.map((item) => (
                    <div
                      key={item.label}
                      className="flex flex-1 flex-col items-center"
                    >
                      <div
                        className="w-full rounded-md bg-emerald-400/85"
                        style={{
                          height: `${Math.round((item.value / maxLoad) * 100)}%`,
                        }}
                      />
                      <span className="mt-2 text-mobile-unit pc:text-[10px] text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle title={t("entry.title")} t={t} />
            <div className="grid gap-2 sm:grid-cols-2">
              {metricCards.map((metric) => {
                const Icon = metric.icon;

                return (
                  <Link
                    key={metric.key}
                    href={metric.href}
                    className="block rounded-md border border-border/70 bg-background p-3 text-left transition-colors hover:bg-neutral-200 dark:hover:bg-muted"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-md bg-neutral-100 dark:bg-muted/45 p-2 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-sm font-semibold">
                        {metric.value}
                      </div>
                    </div>
                    <h2 className="mt-3 text-sm font-semibold">
                      {metric.title}
                    </h2>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {metric.body}
                    </p>
                  </Link>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle title={t("recentTrends.title")} t={t} />
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-muted/35 p-3">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <div className="mt-2 text-sm font-semibold">
                  {t("recentTrends.fitnessUp.title")}
                </div>
                <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  CTL {formatInteger(loadTotal)} · ATL {formatInteger(loadDone)}
                </p>
              </div>
              <div className="rounded-md bg-muted/35 p-3">
                <CircleGauge className="h-4 w-4 text-amber-500" />
                <div className="mt-2 text-sm font-semibold">
                  {t("recentTrends.fatigueHigh.title")}
                </div>
                <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  TSB {formatNumber(tsbValue, 1)}
                </p>
              </div>
              <div className="rounded-md bg-muted/35 p-3">
                <LineChart className="h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-sm font-semibold">
                  {t("recentTrends.efficiencyStable.title")}
                </div>
                <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  ACWR {formatNumber(acRatioValue, 2)} · Monotony{" "}
                  {formatNumber(monotonyValue, 2)}
                </p>
              </div>
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
}
