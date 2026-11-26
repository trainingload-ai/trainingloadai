"use client";
import { palette as tokenPalette } from '@trainingloadai/design-tokens/colors';


import { useLocale, useTranslations } from "next-intl";
import { Activity, Heart, Layers, Zap } from "lucide-react";
import { useContext, useId, useState } from "react";
import { CoachPreviewCard } from "./cards/coach-preview-card";
import { CoachCard } from "./cards/CoachCard";
import { CoachLocalPreviewContext } from "./coach-preview-panel";
import { formatPaceSeconds } from "@/app/[locale]/(main)/account/component/user-profile-metric-model";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";

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
  tokenPalette["green-500"],
  tokenPalette["lime-500"],
  tokenPalette["yellow-500"],
  tokenPalette["orange-500"],
  tokenPalette["red-500"],
  tokenPalette["purple-500"],
  tokenPalette["indigo-500"],
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
  baseDistanceMeters: number,
  paceDistanceMeters: number,
) {
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return undefined;
  // `resolvePaceZoneSettings` returns pace boundaries as sec/m.
  // Backward compatibility: if value is already a large seconds-per-lap number,
  // avoid multiplying again.
  const seconds = (raw > 20 ? raw / baseDistanceMeters : raw) * paceDistanceMeters;
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds;
}

function formatNumericBoundary(
  metric: ZoneMetricKey,
  n: number | undefined,
  baseDistanceMeters: number,
  paceDistanceMeters: number,
) {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (metric === "pace") {
    const seconds = formatPaceBoundarySeconds(n, baseDistanceMeters, paceDistanceMeters);
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
  baseDistanceMeters,
  paceDistanceMeters,
}: {
  metric: ZoneMetricKey;
  bundle: MetricBundle;
  unitSuffix: string;
  baseDistanceMeters: number;
  paceDistanceMeters: number;
}) {
  const t = useTranslations("AiCoachPage");
  const zones = [...(bundle.zones ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div role="region" tabIndex={0} aria-label={metricLabel(t, metric)}
      className="overflow-x-auto rounded-md bg-background/70 dark:bg-background/40">
      <table className="w-full min-w-[220px] text-mobile-caption pc:text-[11px]">
        <thead>
          <tr className="bg-muted/40 text-left text-muted-foreground">
            <th scope="col" className="px-2 py-1.5 font-medium">
              {t("readCards.zoneRanges.colZone")}
            </th>
            <th scope="col" className="px-2 py-1.5 font-medium tabular-nums">
              {t("readCards.zoneRanges.colMin")}
              {unitSuffix ? ` ${unitSuffix}` : ""}
            </th>
            <th scope="col" className="px-2 py-1.5 font-medium tabular-nums">
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
                  {formatNumericBoundary(metric, z.min, baseDistanceMeters, paceDistanceMeters)}
                </td>
                <td className="px-2 py-1.5 tabular-nums text-foreground">
                  {formatNumericBoundary(metric, z.max, baseDistanceMeters, paceDistanceMeters)}
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
  const imperial = useStore((state) => state.systemUnit) === "imperial" && sportUpper !== "SWIM";
  const baseDistanceMeters = sportUpper === "SWIM" ? 100 : 1000;
  const paceDistanceMeters = imperial ? 1609.344 : baseDistanceMeters;
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
        : t(imperial ? "readCards.zoneRanges.unitPaceMi" : "readCards.zoneRanges.unitPace")
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
            baseDistanceMeters={baseDistanceMeters}
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
  const openPreview = useContext(CoachLocalPreviewContext);
  const id = useId();
  const imperial = useStore((state) => state.systemUnit) === "imperial";
  const o = asRecord(payload);
  if (!o || o.kind !== "profile_zone_ranges") return null;

  const sport = String(o.sportType ?? "").trim();
  const sportUpper = sport.toUpperCase();
  const avail = availableMetrics(o);
  const sortedKeys = sortMetricKeys(avail, sportUpper, o.availablePriority ?? o.priority);
  const focus = normalizeFocusMetric(o.focusMetric);
  const recommended = normalizeFocusMetric(o.recommendedMetric);
  const defaultTab = [focus, recommended].find((metric) => metric && sortedKeys.includes(metric)) ?? sortedKeys[0];
  const sportLabel = ["RUN", "CYCLING", "SWIM"].includes(sportUpper)
    ? t(`readCards.zoneRanges.sports.${sportUpper}`)
    : sport || t("readCards.zoneRanges.sports.UNKNOWN");
  const sportTitle = t("readCards.zoneRanges.title", { sport: sportLabel });
  const title = defaultTab ? metricLabel(t, defaultTab) : sportTitle;
  const detail = defaultTab ? <ZoneRangesBody sortedKeys={sortedKeys} payload={o}
    defaultTab={defaultTab} sportUpper={sportUpper} /> : null;

  if (!openPreview) {
    const metricSummary = new Intl.ListFormat(locale, {
      style: "short",
      type: "conjunction",
    }).format(sortedKeys.map((metric) => metricLabel(t, metric)));
    return (
      <CoachCard tone="neutral" icon={<Layers className="size-4" />} title={sportTitle}
        subtitle={metricSummary ? t("readCards.zoneRanges.summary", { metrics: metricSummary }) : undefined}
        dense collapsible={Boolean(detail)} defaultCollapsed hideDetailsHeader
        toggleAriaLabel={t("readCards.zoneRanges.toggleDetails")}>
        {detail ?? <p className="mt-2 text-mobile-caption text-muted-foreground pc:text-xs">{t("readCards.zoneRanges.empty")}</p>}
      </CoachCard>
    );
  }

  const bundle = defaultTab ? metricBundle(o[defaultTab]) : null;
  const zones = [...(bundle?.zones ?? [])].sort((a, b) => a.order - b.order);
  const shown = zones.length > 7 ? zones.slice(0, 6) : zones;
  const baseDistance = sportUpper === "SWIM" ? 100 : 1000;
  const paceDistance = imperial && sportUpper !== "SWIM" ? 1609.344 : baseDistance;
  const unit = defaultTab === "power" ? "W" : defaultTab === "heartRate" ? "bpm"
    : defaultTab === "pace" ? sportUpper === "SWIM" ? "min/100m" : imperial ? "min/mi" : "min/km" : undefined;
  const icon = defaultTab === "heartRate" ? Heart : defaultTab === "power" ? Zap : defaultTab === "pace" ? Activity : Layers;
  return (
    <CoachPreviewCard icon={icon} title={title}
      subtitle={[sportLabel, bundle?.benchmark, unit].filter(Boolean).join(" · ")}
      actionLabel={t("readCards.zoneRanges.toggleDetails")}
      onOpen={detail ? () => openPreview(id, title, detail) : undefined}>
      {defaultTab ? (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,3.5rem),1fr))] gap-1.5">
          {shown.map((zone, index) => {
            const label = zone.name?.match(/^Z\d+/i)?.[0] ?? `Z${zone.order}`;
            const min = formatNumericBoundary(defaultTab, zone.min, baseDistance, paceDistance);
            const max = formatNumericBoundary(defaultTab, zone.max, baseDistance, paceDistance);
            const color = zone.color && /^#[\da-f]{6}$/i.test(zone.color)
              ? zone.color : ZONE_FALLBACK_COLORS[index % ZONE_FALLBACK_COLORS.length];
            return (
              <li key={zone.order} className="min-w-0 space-y-1">
                <span aria-hidden className="block h-1 rounded-full" style={{ backgroundColor: color }} />
                <span className="block text-xs font-semibold">{label}</span>
                <span className="block break-words text-[11px] tabular-nums text-muted-foreground">{min} – {max}</span>
              </li>
            );
          })}
          {shown.length < zones.length ? <li className="self-center text-center text-xs text-muted-foreground">+{zones.length - shown.length}</li> : null}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{t("readCards.zoneRanges.empty")}</p>}
    </CoachPreviewCard>
  );
}
