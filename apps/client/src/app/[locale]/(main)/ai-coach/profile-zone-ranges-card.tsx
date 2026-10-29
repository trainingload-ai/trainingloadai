"use client";

import { useLocale, useTranslations } from "next-intl";
import { Activity, Heart, Layers, Zap } from "lucide-react";
import { useState } from "react";
import { CoachCard } from "./cards/CoachCard";
import { formatPaceSeconds } from "@/app/[locale]/(main)/account/component/user-profile-metric-model";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ZoneMetricKey = "pace" | "heartRate" | "power";

type ZoneItem = {
  order: number;
  name?: string;
  min?: number;
  max?: number;
  color?: string;
};

type MetricBundle = {
  configured?: boolean;
  benchmark?: string | null;
  zones?: ZoneItem[];
};

const ZONE_FALLBACK_COLORS = [
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#6366f1",
] as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function parseZones(raw: unknown): ZoneItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((z, idx) => {
    const r = asRecord(z);
    return {
      order:
        r && Number.isFinite(Number(r.order)) && Number(r.order) > 0
          ? Number(r.order)
          : idx + 1,
      name: r?.name != null ? String(r.name) : undefined,
      min:
        r?.min != null && Number.isFinite(Number(r.min))
          ? Number(r.min)
          : undefined,
      max:
        r?.max != null && Number.isFinite(Number(r.max))
          ? Number(r.max)
          : undefined,
      color: r?.color != null ? String(r.color) : undefined,
    };
  });
}

function metricBundle(raw: unknown): MetricBundle {
  const r = asRecord(raw);
  if (!r) return { configured: false, zones: [] };
  const zones = parseZones(r.zones);
  const configured =
    r.configured === true || (zones.length > 0 && r.configured !== false);
  return {
    configured,
    benchmark:
      r.benchmark != null && String(r.benchmark).trim()
        ? String(r.benchmark)
        : undefined,
    zones,
  };
}

function availableMetrics(payload: Record<string, unknown>): ZoneMetricKey[] {
  const keys: ZoneMetricKey[] = ["pace", "heartRate", "power"];
  const out: ZoneMetricKey[] = [];
  for (const k of keys) {
    const b = metricBundle(payload[k]);
    if ((b.zones?.length ?? 0) > 0) out.push(k);
  }
  return out;
}

function sortMetricKeys(
  keys: ZoneMetricKey[],
  sportUpper: string,
  priorityRaw: unknown,
): ZoneMetricKey[] {
  const defaultPri: ZoneMetricKey[] = ["pace", "heartRate", "power"];
  const pri =
    Array.isArray(priorityRaw) && priorityRaw.length > 0
      ? priorityRaw
          .map((x) => String(x).trim())
          .filter(
            (x): x is ZoneMetricKey =>
              x === "pace" || x === "heartRate" || x === "power",
          )
      : defaultPri;
  const byPriority = pri.filter((p) => keys.includes(p));
  const rest = keys.filter((k) => !byPriority.includes(k));
  let ordered = [...byPriority, ...rest];

  const primaryForSport: ZoneMetricKey | null =
    sportUpper === "CYCLING"
      ? "power"
      : sportUpper === "RUN" || sportUpper === "SWIM"
        ? "pace"
        : null;

  if (
    primaryForSport &&
    ordered.includes(primaryForSport) &&
    ordered[0] !== primaryForSport
  ) {
    ordered = [
      primaryForSport,
      ...ordered.filter((k) => k !== primaryForSport),
    ];
  }

  return ordered;
}

function formatPaceBoundarySeconds(
  raw: number | undefined,
  paceDistanceMeters: number,
) {
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return undefined;
  // `resolvePaceZoneSettings` returns pace boundaries as sec/m.
  // Backward compatibility: if value is already a large seconds-per-lap number,
  // avoid multiplying again.
  const seconds = raw > 20 ? raw : raw * Math.max(1, paceDistanceMeters);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds;
}

function formatNumericBoundary(
  metric: ZoneMetricKey,
  n: number | undefined,
  paceDistanceMeters: number,
) {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (metric === "pace") {
    const seconds = formatPaceBoundarySeconds(n, paceDistanceMeters);
    const s = formatPaceSeconds(seconds);
    return s || "—";
  }
  return String(Math.round(n));
}

function MetricIcon({ metric }: { metric: ZoneMetricKey }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (metric === "heartRate") return <Heart className={cls} />;
  if (metric === "power") return <Zap className={cls} />;
  return <Activity className={cls} />;
}

function ZoneRangeTable({
  metric,
  bundle,
  unitSuffix,
  paceDistanceMeters,
}: {
  metric: ZoneMetricKey;
  bundle: MetricBundle;
  unitSuffix: string;
  paceDistanceMeters: number;
}) {
  const t = useTranslations("AiCoachPage");
  const zones = [...(bundle.zones ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div className="overflow-x-auto rounded-md bg-background/70 dark:bg-background/40">
      <table className="w-full min-w-[220px] text-mobile-caption pc:text-[11px]">
        <thead>
          <tr className="bg-muted/40 text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">
              {t("readCards.zoneRanges.colZone")}
            </th>
            <th className="px-2 py-1.5 font-medium tabular-nums">
              {t("readCards.zoneRanges.colMin")}
              {unitSuffix ? ` ${unitSuffix}` : ""}
            </th>
            <th className="px-2 py-1.5 font-medium tabular-nums">
              {t("readCards.zoneRanges.colMax")}
              {unitSuffix ? ` ${unitSuffix}` : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {zones.map((z, index) => {
            const color =
              z.color?.trim() ||
              ZONE_FALLBACK_COLORS[index % ZONE_FALLBACK_COLORS.length];
            return (
              <tr
                key={`${z.order}-${z.name ?? ""}`}
                className="even:bg-muted/20"
              >
                <td className="px-2 py-1.5 text-foreground">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full border border-border/50"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    <span>
                      {z.name?.trim() ||
                        t("readCards.zoneRanges.fallbackZone", {
                          n: z.order,
                        })}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1.5 tabular-nums text-foreground">
                  {formatNumericBoundary(metric, z.min, paceDistanceMeters)}
                </td>
                <td className="px-2 py-1.5 tabular-nums text-foreground">
                  {formatNumericBoundary(metric, z.max, paceDistanceMeters)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function metricLabel(
  t: ReturnType<typeof useTranslations<"AiCoachPage">>,
  metric: ZoneMetricKey,
) {
  if (metric === "pace") return t("readCards.zoneRanges.tabPace");
  if (metric === "heartRate") return t("readCards.zoneRanges.tabHr");
  return t("readCards.zoneRanges.tabPower");
}

function ZoneRangesBody({
  sortedKeys,
  payload,
  defaultTab,
  sportUpper,
}: {
  sortedKeys: ZoneMetricKey[];
  payload: Record<string, unknown>;
  defaultTab: ZoneMetricKey;
  sportUpper: string;
}) {
  const t = useTranslations("AiCoachPage");
  const paceDistanceMeters = sportUpper === "SWIM" ? 100 : 1000;
  const [selectedMetric, setSelectedMetric] = useState<ZoneMetricKey>(
    sortedKeys.includes(defaultTab) ? defaultTab : sortedKeys[0]!,
  );
  const activeMetric = sortedKeys.includes(selectedMetric)
    ? selectedMetric
    : defaultTab;
  const benchmark = metricBundle(payload[activeMetric]).benchmark;

  const unitFor = (m: ZoneMetricKey) =>
    m === "pace"
      ? sportUpper === "SWIM"
        ? t("readCards.zoneRanges.unitPace100m")
        : t("readCards.zoneRanges.unitPace")
      : m === "heartRate"
        ? t("readCards.zoneRanges.unitHr")
        : t("readCards.zoneRanges.unitPower");

  return (
    <Tabs
      value={activeMetric}
      onValueChange={(value) => setSelectedMetric(value as ZoneMetricKey)}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <TabsList
          className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0"
          aria-label={t("readCards.zoneRanges.metricTabs")}
        >
          {sortedKeys.map((metric) => (
            <TabsTrigger
              key={metric}
              value={metric}
              className="gap-1.5 px-2.5 py-1.5 text-xs font-normal text-muted-foreground hover:bg-background/80 hover:text-foreground data-[state=active]:bg-foreground data-[state=active]:text-background"
            >
              <MetricIcon metric={metric} />
              {metricLabel(t, metric)}
            </TabsTrigger>
          ))}
        </TabsList>
        {benchmark ? (
          <p
            data-coach-zone-benchmark
            className="ml-auto min-w-0 break-words text-right text-mobile-caption pc:text-[11px] leading-snug text-muted-foreground"
          >
            {t("readCards.zoneRanges.benchmarkLine", { value: benchmark })}
          </p>
        ) : null}
      </div>
      {sortedKeys.map((metric) => (
        <TabsContent key={metric} value={metric} className="mt-0">
          <ZoneRangeTable
            metric={metric}
            bundle={metricBundle(payload[metric])}
            unitSuffix={unitFor(metric)}
            paceDistanceMeters={paceDistanceMeters}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function normalizeFocusMetric(raw: unknown): ZoneMetricKey | null {
  if (raw === "pace" || raw === "heartRate" || raw === "power") return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "pace") return "pace";
  if (s === "power") return "power";
  if (s === "heartrate" || s === "heart_rate" || s === "hr") {
    return "heartRate";
  }
  return null;
}

export function ProfileZoneRangesCard({ payload }: { payload: unknown }) {
  const locale = useLocale();
  const t = useTranslations("AiCoachPage");
  const o = asRecord(payload);
  if (!o || o.kind !== "profile_zone_ranges") return null;

  const sport = String(o.sportType ?? "").trim();
  const sportUpper = sport.toUpperCase();
  const avail = availableMetrics(o);
  const sortedKeys = sortMetricKeys(avail, sportUpper, o.priority);
  const focus = normalizeFocusMetric(o.focusMetric);
  const defaultTab =
    focus && sortedKeys.includes(focus) ? focus : (sortedKeys[0] ?? "pace");
  const sportLabel = ["RUN", "CYCLING", "SWIM"].includes(sportUpper)
    ? t(`readCards.zoneRanges.sports.${sportUpper}`)
    : sport || t("readCards.zoneRanges.sports.UNKNOWN");
  const metricSummary = new Intl.ListFormat(locale, {
    style: "short",
    type: "conjunction",
  }).format(sortedKeys.map((metric) => metricLabel(t, metric)));

  return (
    <CoachCard
      tone="neutral"
      icon={<Layers className="h-4 w-4" />}
      title={t("readCards.zoneRanges.title", { sport: sportLabel })}
      subtitle={
        metricSummary
          ? t("readCards.zoneRanges.summary", { metrics: metricSummary })
          : undefined
      }
      dense
      collapsible={sortedKeys.length > 0}
      defaultCollapsed
      hideDetailsHeader
      toggleAriaLabel={t("readCards.zoneRanges.toggleDetails")}
    >
      {sortedKeys.length === 0 ? (
        <p className="mt-2 text-mobile-caption pc:text-xs text-muted-foreground">
          {t("readCards.zoneRanges.empty")}
        </p>
      ) : (
        <ZoneRangesBody
          sortedKeys={sortedKeys}
          payload={o}
          defaultTab={defaultTab}
          sportUpper={sportUpper}
        />
      )}
    </CoachCard>
  );
}
