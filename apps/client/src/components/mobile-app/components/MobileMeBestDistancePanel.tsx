"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight, Trophy } from "lucide-react";
import { usePaceBestPerformance, type PaceBestPerformanceItem } from "@/api/use-pace";
import type { Time } from "@/components/DateSelector/types";
import { Link } from "@/i18n/navigation";
import type { SportType } from "@/lib/store";
import { cn } from "@/lib/utils";
import { MobileGroupedList } from "./MobileGroupedList";

type MetricsSport = Extract<SportType, "RUN" | "CYCLING" | "SWIM">;
type Mode = "distance" | "time";
type Preset = "last60" | "year" | "allTime";
type Option = { label: string; value: string; translationKey?: string };
type RecordItem = {
  rank: number;
  timeSec: number;
  paceSec: number;
  distanceM?: number;
  activityId?: number;
  activityTime?: string;
};

const DISTANCES: Record<MetricsSport, Option[]> = {
  RUN: [
    { label: "400m", value: "400" }, { label: "800m", value: "800" },
    { label: "1000m", value: "1000" }, { label: "1500m", value: "1500" },
    { label: "1mi", value: "1609" }, { label: "3km", value: "3000" },
    { label: "5km", value: "5000" }, { label: "10km", value: "10000" },
    { label: "Half marathon", value: "21097", translationKey: "halfMarathon" },
    { label: "Marathon", value: "42195", translationKey: "marathon" },
  ],
  CYCLING: [
    { label: "10km", value: "10000" }, { label: "20km", value: "20000" },
    { label: "40km", value: "40000" }, { label: "90km", value: "90000" },
    { label: "180km", value: "180000" },
  ],
  SWIM: [
    { label: "100m", value: "100" }, { label: "400m", value: "400" },
    { label: "1500m", value: "1500" },
  ],
};

const TIMES: Record<MetricsSport, Option[]> = {
  RUN: [
    { label: "1m", value: "60s", translationKey: "1min" }, { label: "5m", value: "300s", translationKey: "5min" },
    { label: "12m", value: "720s", translationKey: "cooperTest" }, { label: "20m", value: "1200s", translationKey: "20min" },
    { label: "30m", value: "1800s", translationKey: "30min" }, { label: "1h", value: "3600s", translationKey: "1hour" },
    { label: "2h", value: "7200s", translationKey: "2hour" }, { label: "3h", value: "10800s", translationKey: "3hour" },
    { label: "5h", value: "18000s", translationKey: "5hour" }, { label: "8h", value: "28800s", translationKey: "8hour" },
  ],
  CYCLING: [
    { label: "1m", value: "60s", translationKey: "1min" }, { label: "5m", value: "300s", translationKey: "5min" },
    { label: "FTP 20m", value: "1200s", translationKey: "ftp20" }, { label: "FTP 60m", value: "3600s", translationKey: "ftp60" },
    { label: "2h", value: "7200s", translationKey: "2hour" }, { label: "3h", value: "10800s", translationKey: "3hour" },
    { label: "5h", value: "18000s", translationKey: "5hour" }, { label: "8h", value: "28800s", translationKey: "8hour" },
  ],
  SWIM: [
    { label: "1m", value: "60s", translationKey: "1min" }, { label: "5m", value: "300s", translationKey: "5min" },
    { label: "20m", value: "1200s", translationKey: "20min" }, { label: "1h", value: "3600s", translationKey: "1hour" },
    { label: "2h", value: "7200s", translationKey: "2hour" },
  ],
};

function timeRange(preset: Preset): Time[] {
  const now = new Date();
  if (preset === "allTime") return [{ mode: "all-time" }];
  if (preset === "year") return [{ mode: "year", year: String(now.getFullYear()) }];
  const start = new Date(now);
  start.setDate(start.getDate() - 59);
  return [{ mode: "range", startDate: start.toISOString(), endDate: now.toISOString(), wellKnown: "Last 60 days" }];
}

function parseTarget(value: string) {
  return Number.parseInt(value, 10);
}

function recordsFor(
  data: PaceBestPerformanceItem[] | undefined,
  option: Option,
  mode: Mode,
  sport: MetricsSport,
): RecordItem[] {
  const normalized = String(parseTarget(option.value));
  const records: Omit<RecordItem, "rank">[] = [];
  for (const row of data ?? []) {
    const values = row.topValues?.[option.value]
      ?? row.topValues?.[normalized]
      ?? row.topValues?.[`${normalized}s`]
      ?? (row.values?.[option.value] ? [row.values[option.value]!] : row.values?.[normalized] ? [row.values[normalized]!] : row.values?.[`${normalized}s`] ? [row.values[`${normalized}s`]!] : []);
    values.forEach((value) => records.push({
      ...value,
      distanceM: mode === "time" && value.paceSec > 0
        ? (value.timeSec * (sport === "SWIM" ? 100 : 1000)) / value.paceSec
        : undefined,
    }));
  }
  return records
    .sort((a, b) => mode === "time" ? (b.distanceM ?? 0) - (a.distanceM ?? 0) : a.timeSec - b.timeSec)
    .map((record, index) => ({ ...record, rank: index + 1 }));
}

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "--";
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDistance(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return "--";
  return value >= 1000 ? `${(value / 1000).toFixed(2)}km` : `${Math.round(value)}m`;
}

function formatPace(value: number, sport: MetricsSport) {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return `${formatDuration(value)}/${sport === "SWIM" ? "100m" : "km"}`;
}

export function MobileBestDistancePanel() {
  const locale = useLocale();
  const t = useTranslations("bestDistance");
  const activityT = useTranslations("activityFilter");
  const dateT = useTranslations("dateSelector");
  const [sport, setSport] = useState<MetricsSport>("RUN");
  const [mode, setMode] = useState<Mode>("distance");
  const [preset, setPreset] = useState<Preset>("last60");
  const options = mode === "distance" ? DISTANCES[sport] : TIMES[sport];
  const [activeValue, setActiveValue] = useState(options[0]?.value ?? "");
  const active = options.find((option) => option.value === activeValue) ?? options[0];
  const ranges = useMemo(() => timeRange(preset), [preset]);
  const targets = useMemo(() => options.map((option) => parseTarget(option.value)).filter(Boolean), [options]);
  const performance = usePaceBestPerformance(ranges, sport, undefined, mode, targets, 10);
  const records = useMemo(() => active ? recordsFor(performance.data, active, mode, sport) : [], [active, mode, performance.data, sport]);
  const labelFor = (option: Option) => option.translationKey ? t(`distances.${option.translationKey}`) : option.label;
  const selectSport = (next: MetricsSport) => {
    setSport(next);
    const nextOptions = mode === "distance" ? DISTANCES[next] : TIMES[next];
    setActiveValue(nextOptions[0]?.value ?? "");
  };
  const selectMode = (next: Mode) => {
    setMode(next);
    setActiveValue((next === "distance" ? DISTANCES[sport] : TIMES[sport])[0]?.value ?? "");
  };
  const labels = locale === "zh" || locale === "zh-hant"
    ? { current: "当前最佳", history: "历史记录", completedTime: "完成用时", completedDistance: "完成距离", emptyTitle: "暂无最佳表现", emptyDetail: `还没有 ${active ? labelFor(active) : ""} 的有效记录。`, loading: "正在加载最佳表现" }
    : { current: "Current best", history: "History", completedTime: "Completed time", completedDistance: "Completed distance", emptyTitle: "No best performance", emptyDetail: `No valid record for ${active ? labelFor(active) : ""} yet.`, loading: "Loading best performance" };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center px-1 py-1">
          <label className="relative min-h-[74px] w-[116px]">
            <span className="flex h-[74px] items-center text-[42px] font-semibold leading-[46px] text-[#007aff]">
              {sport === "RUN" ? activityT("run") : sport === "CYCLING" ? activityT("cycling") : activityT("swim")}
              <span className="ml-1 text-mobile-control">⌃⌄</span>
            </span>
            <select
              aria-label={t("title")}
              value={sport}
              onChange={(event) => selectSport(event.target.value as MetricsSport)}
              className="absolute inset-0 opacity-0"
            >
              <option value="RUN">{activityT("run")}</option>
              <option value="CYCLING">{activityT("cycling")}</option>
              <option value="SWIM">{activityT("swim")}</option>
            </select>
          </label>
          <div className="ml-auto space-y-3">
            <div className="grid h-8 w-[146px] grid-cols-2 rounded-lg bg-muted p-0.5 text-mobile-control">
              {(["distance", "time"] as Mode[]).map((value) => (
                <button key={value} type="button" onClick={() => selectMode(value)} className={cn("rounded-xs", mode === value && "bg-background font-medium shadow-sm")}>
                  {value === "distance" ? t("byDistance") : t("byTime")}
                </button>
              ))}
            </div>
            <div className="grid h-8 w-[204px] grid-cols-3 rounded-lg bg-muted p-0.5 text-mobile-control">
              {(["last60", "year", "allTime"] as Preset[]).map((value) => (
                <button key={value} type="button" onClick={() => setPreset(value)} className={cn("rounded-xs", preset === value && "bg-background font-medium shadow-sm")}>
                  {value === "last60" ? dateT("last60Days") : value === "year" ? dateT("thisYear") : dateT("allTime")}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1 rounded-lg bg-muted p-0.5">
            {options.map((option) => (
              <button key={option.value} type="button" onClick={() => setActiveValue(option.value)} className={cn("h-8 whitespace-nowrap rounded-xs px-3 text-mobile-caption", active?.value === option.value && "bg-background font-medium shadow-sm")}>
                {labelFor(option)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {performance.isLoading ? (
        <MobileGroupedList>
          <div className="flex min-h-[180px] items-center justify-center text-mobile-body text-muted-foreground">{labels.loading}</div>
        </MobileGroupedList>
      ) : performance.isError ? (
        <MobileGroupedList>
          <button type="button" onClick={() => void performance.refetch()} className="min-h-[180px] w-full text-mobile-body text-red-500">{t("loading")}</button>
        </MobileGroupedList>
      ) : records.length && active ? (
        <>
          <section className="space-y-2">
            <h2 className="px-1 text-mobile-caption font-medium text-muted-foreground">{labels.current}</h2>
            <MobileGroupedList>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-mobile-caption font-medium text-emerald-600">{labelFor(active)} · {mode === "time" ? labels.completedDistance : labels.completedTime}</p>
                    <p className="mt-2 text-[36px] font-semibold leading-[42px] tabular-nums">{mode === "time" ? formatDistance(records[0].distanceM) : formatDuration(records[0].timeSec)}</p>
                  </div>
                  <span className="grid size-12 place-items-center rounded-full bg-emerald-500/10"><Trophy className="size-[22px] text-emerald-600" /></span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-mobile-control text-muted-foreground">
                  <span>{records[0].activityTime ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(records[0].activityTime)) : "--"}</span>
                  <span className="font-medium tabular-nums">{formatPace(records[0].paceSec, sport)}</span>
                </div>
                {records[0].activityId ? (
                  <Link href={`/activities/${records[0].activityId}`} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-control-lg bg-muted text-mobile-body font-medium active:bg-muted/75">
                    {t("viewActivity")}<ChevronRight className="size-[13px] text-muted-foreground" />
                  </Link>
                ) : null}
              </div>
            </MobileGroupedList>
          </section>
          <section className="space-y-2">
            <h2 className="px-1 text-mobile-caption font-medium text-muted-foreground">{labels.history}</h2>
            <MobileGroupedList>
              {records.map((record) => {
                const row = (
                  <div className="flex min-h-[62px] items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                    <span className="grid h-8 min-w-[38px] place-items-center rounded-full bg-muted px-2 text-mobile-caption font-semibold text-muted-foreground">#{record.rank}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <strong className="text-[18px] tabular-nums">{mode === "time" ? formatDistance(record.distanceM) : formatDuration(record.timeSec)}</strong>
                        <span className="text-mobile-caption tabular-nums text-muted-foreground">{formatPace(record.paceSec, sport)}</span>
                      </span>
                      <span className="mt-0.5 block text-mobile-caption text-muted-foreground">{record.activityTime ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(record.activityTime)) : "--"}</span>
                    </span>
                    {record.activityId ? <ChevronRight className="size-[13px] text-muted-foreground/45" /> : null}
                  </div>
                );
                return record.activityId ? <Link key={`${record.rank}-${record.activityId}`} href={`/activities/${record.activityId}`}>{row}</Link> : <div key={`${record.rank}-${record.activityTime}`}>{row}</div>;
              })}
            </MobileGroupedList>
          </section>
        </>
      ) : (
        <MobileGroupedList>
          <div className="flex min-h-[180px] flex-col items-center justify-center px-6 text-center">
            <p className="text-mobile-headline font-semibold">{labels.emptyTitle}</p>
            <p className="mt-2 text-mobile-control leading-5 text-muted-foreground">{labels.emptyDetail}</p>
          </div>
        </MobileGroupedList>
      )}
    </div>
  );
}
