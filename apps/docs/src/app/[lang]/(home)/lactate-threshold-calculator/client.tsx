"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Printer, Share2, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import { formatPaceClock, KM_PER_MILE } from "@/lib/running-pace";
import {
  LT1_HEART_RATE_PERCENT,
  LT1_PACE_SPEED_PERCENT,
  LT1_POWER_PERCENT,
  estimateFtpFromProtocol,
  estimateLt2PaceFromRace,
  lt1HeartRateBand,
  lt1PaceBand,
  lt1PowerBand,
  standardRaceDistanceKm,
  type PowerProtocol,
  type RacePresetKey,
} from "@/lib/lactate-threshold";
import { heartRateZonesHref, powerZonesHref } from "@/lib/zone-tool-links";
import styles from "./lactate-threshold-calculator.module.css";

import {
  parseThresholdDuration,
  type ThresholdFileEstimate,
} from "@/lib/threshold-records";
import {
  calculatePowerZones,
  POWER_ZONE_MODELS,
  POWER_ZONE_MODEL_NAMES,
  type PowerZoneModel,
} from "@/lib/power-zones";

const ThresholdFileInput = dynamic(() =>
  import("./file-input").then((module) => module.ThresholdFileInput),
);

type MetricKey = "RACE" | "HEART_RATE" | "POWER" | "PACE";
type UnitSystem = "metric" | "imperial";

type ScoreZone = {
  id: string;
  name: string;
  figure: string;
  percent: string;
};

type ScoreLink = {
  href: string;
  label: string;
};

type ScoreExtra = {
  label: string;
  value: string;
};

type SessionAnchor = {
  kind: "pace" | "heartRate" | "power";
  pace?: string;
  lt1Pace?: string;
  hr?: string;
  lt1Hr?: string;
  power?: string;
  lt1Power?: string;
};

type Scorecard = {
  eyebrow: string;
  value: string;
  unit: string;
  pace: boolean;
  protocol: string;
  lt1Label: string;
  lt1Value: string;
  extras: ScoreExtra[];
  zonesTitle: string;
  zones: ScoreZone[];
  disclaimer: string;
  explainer: string;
  links: ScoreLink[];
  anchor: SessionAnchor;
};

const SESSION_KEYS = ["tempo", "cruise", "progression", "aerobic"] as const;
const RACE_PRESETS: RacePresetKey[] = [
  "5k",
  "10k",
  "half",
  "marathon",
  "custom",
];
const METRICS: MetricKey[] = ["RACE", "HEART_RATE", "POWER", "PACE"];
const METRIC_OPTION: Record<
  MetricKey,
  "race" | "heartRate" | "power" | "pace"
> = {
  RACE: "race",
  HEART_RATE: "heartRate",
  POWER: "power",
  PACE: "pace",
};
const MODE_PARAM: Record<MetricKey, string> = {
  RACE: "race",
  HEART_RATE: "hr",
  POWER: "power",
  PACE: "pace",
};

function UnitInput({
  suffix,
  className,
  ...props
}: { suffix: string } & ComponentProps<typeof Input>) {
  return (
    <div className={styles.inputShell}>
      <Input className={`pr-12 ${className ?? ""}`} {...props} />
      <span className={styles.inputSuffix} aria-hidden="true">
        {suffix}
      </span>
    </div>
  );
}

function parsePositiveNumber(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const parseDurationToSeconds = parseThresholdDuration;

function displayDistanceToKm(value: number, units: UnitSystem) {
  return units === "imperial" ? value * KM_PER_MILE : value;
}

function formatDisplayDistance(km: number, units: UnitSystem) {
  const value = units === "imperial" ? km / KM_PER_MILE : km;
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function convertDistanceText(text: string, from: UnitSystem, to: UnitSystem) {
  if (from === to) return text;
  const parsed = parsePositiveNumber(text);
  if (parsed == null) return text;
  return formatDisplayDistance(displayDistanceToKm(parsed, from), to);
}

function paceParts(secPerKm: number, units: UnitSystem) {
  const seconds = units === "imperial" ? secPerKm * KM_PER_MILE : secPerKm;
  const unit = units === "imperial" ? "mi" : "km";
  const clock = formatPaceClock(seconds);
  return { clock, unit, label: `${clock} /${unit}` };
}

function paceRangeLabel(
  fastSecPerKm: number,
  slowSecPerKm: number,
  units: UnitSystem,
) {
  const fast = paceParts(fastSecPerKm, units);
  const slow = paceParts(slowSecPerKm, units);
  return {
    clock: `${fast.clock}–${slow.clock}`,
    label: `${fast.clock}–${slow.clock} /${fast.unit}`,
  };
}

function isRacePreset(value: string | null): value is RacePresetKey {
  return (
    value === "5k" ||
    value === "10k" ||
    value === "half" ||
    value === "marathon" ||
    value === "custom"
  );
}

function isPowerProtocol(value: string | null): value is PowerProtocol {
  return value === "20MIN" || value === "8MIN" || value === "60MIN";
}

function isMetricKey(value: string | null | undefined): value is MetricKey {
  return (
    value === "RACE" ||
    value === "HEART_RATE" ||
    value === "POWER" ||
    value === "PACE"
  );
}

export function LactateThresholdCalculatorClient({
  hero,
}: {
  hero: ReactNode;
}) {
  const t = useTranslations("lactateThresholdCalculator.client");
  const tZones = useTranslations("powerZonesCalculator.client");
  const tPage = useTranslations("lactateThresholdCalculator.page");
  const locale = useLocale();
  const prefix = localePrefix(locale);
  const [metric, setMetric] = useState<MetricKey>("RACE");
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [ready, setReady] = useState(false);

  const [racePreset, setRacePreset] = useState<RacePresetKey>("5k");
  const [raceDistanceText, setRaceDistanceText] = useState("");
  const [raceTimeText, setRaceTimeText] = useState("");
  const [avgHr20Text, setAvgHr20Text] = useState("");
  const [powerProtocol, setPowerProtocol] = useState<PowerProtocol>("20MIN");
  const [avgPowerText, setAvgPowerText] = useState("");
  const [distanceText, setDistanceText] = useState("");
  const [timeText, setTimeText] = useState("");
  const [copied, setCopied] = useState(false);
  const [inputTab, setInputTab] = useState("manual");
  const [zoneModel, setZoneModel] = useState<PowerZoneModel>("COGGAN");

  useLayoutEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore a shared result link after SSR */
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const zone = params.get("zones");
    if (POWER_ZONE_MODELS.includes(zone as PowerZoneModel))
      setZoneModel(zone as PowerZoneModel);
    const metricParam = (
      {
        race: "RACE",
        hr: "HEART_RATE",
        power: "POWER",
        pace: "PACE",
      } as const
    )[mode ?? ""];
    const preset = params.get("preset");
    const protocol = params.get("protocol");
    if (isMetricKey(metricParam)) setMetric(metricParam);
    if (params.get("units") === "imperial") setUnits("imperial");
    if (isRacePreset(preset)) setRacePreset(preset);
    if (params.get("rdist")) setRaceDistanceText(params.get("rdist") ?? "");
    if (params.get("rtime")) setRaceTimeText(params.get("rtime") ?? "");
    if (params.get("hr")) setAvgHr20Text(params.get("hr") ?? "");
    if (isPowerProtocol(protocol)) setPowerProtocol(protocol);
    if (params.get("watts")) setAvgPowerText(params.get("watts") ?? "");
    if (params.get("dist")) setDistanceText(params.get("dist") ?? "");
    if (params.get("time")) setTimeText(params.get("time") ?? "");
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!ready) return;
    const hasInput =
      raceTimeText.trim() !== "" ||
      raceDistanceText.trim() !== "" ||
      avgHr20Text.trim() !== "" ||
      avgPowerText.trim() !== "" ||
      distanceText.trim() !== "" ||
      timeText.trim() !== "" ||
      units !== "metric" ||
      metric !== "RACE" ||
      racePreset !== "5k" ||
      powerProtocol !== "20MIN";
    if (!hasInput) {
      const url = new URL(window.location.href);
      for (const key of [
        "mode",
        "units",
        "preset",
        "rdist",
        "rtime",
        "hr",
        "protocol",
        "watts",
        "dist",
        "time",
        "zones",
      ])
        url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("mode", MODE_PARAM[metric]);
    params.set("zones", zoneModel);
    if (units === "imperial") params.set("units", "imperial");
    else params.delete("units");
    params.set("preset", racePreset);
    if (raceDistanceText.trim()) params.set("rdist", raceDistanceText.trim());
    else params.delete("rdist");
    if (raceTimeText.trim()) params.set("rtime", raceTimeText.trim());
    else params.delete("rtime");
    if (avgHr20Text.trim()) params.set("hr", avgHr20Text.trim());
    else params.delete("hr");
    params.set("protocol", powerProtocol);
    if (avgPowerText.trim()) params.set("watts", avgPowerText.trim());
    else params.delete("watts");
    if (distanceText.trim()) params.set("dist", distanceText.trim());
    else params.delete("dist");
    if (timeText.trim()) params.set("time", timeText.trim());
    else params.delete("time");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [
    avgHr20Text,
    avgPowerText,
    distanceText,
    metric,
    powerProtocol,
    raceDistanceText,
    racePreset,
    raceTimeText,
    ready,
    zoneModel,
    timeText,
    units,
  ]);

  const distanceUnit = units === "imperial" ? "mi" : "km";
  const raceDistanceKm = useMemo(() => {
    if (racePreset !== "custom") return standardRaceDistanceKm(racePreset);
    const parsed = parsePositiveNumber(raceDistanceText);
    return parsed == null ? null : displayDistanceToKm(parsed, units);
  }, [raceDistanceText, racePreset, units]);
  const raceTimeSeconds = useMemo(
    () => parseDurationToSeconds(raceTimeText),
    [raceTimeText],
  );
  const avgHr20 = useMemo(
    () => parsePositiveNumber(avgHr20Text),
    [avgHr20Text],
  );
  const avgPower = useMemo(
    () => parsePositiveNumber(avgPowerText),
    [avgPowerText],
  );
  const distanceKm = useMemo(() => {
    const parsed = parsePositiveNumber(distanceText);
    return parsed == null ? null : displayDistanceToKm(parsed, units);
  }, [distanceText, units]);
  const timeSeconds = useMemo(
    () => parseDurationToSeconds(timeText),
    [timeText],
  );

  const result = useMemo(() => {
    const zoneLabel = (
      key: "belowLt1" | "lt1" | "between" | "lt2" | "aboveLt2",
    ) => t(`zones.${key}`);
    const other: UnitSystem = units === "metric" ? "imperial" : "metric";
    const hrPercents = [
      `<${LT1_HEART_RATE_PERCENT.min}%`,
      `${LT1_HEART_RATE_PERCENT.min}–${LT1_HEART_RATE_PERCENT.max}%`,
      "",
      "100%",
      ">100%",
    ];

    const pointZones = (
      anchor: number,
      band: { min: number; max: number },
      percents: string[],
    ): ScoreZone[] => {
      const between =
        band.max + 1 <= anchor - 1 ? `${band.max + 1}–${anchor - 1}` : "—";
      return [
        {
          id: "z1",
          name: zoneLabel("belowLt1"),
          figure: `≤ ${band.min - 1}`,
          percent: percents[0] ?? "",
        },
        {
          id: "z2",
          name: zoneLabel("lt1"),
          figure: `${band.min}–${band.max}`,
          percent: percents[1] ?? "",
        },
        {
          id: "z3",
          name: zoneLabel("between"),
          figure: between,
          percent: percents[2] ?? "",
        },
        {
          id: "z4",
          name: zoneLabel("lt2"),
          figure: String(anchor),
          percent: percents[3] ?? "100%",
        },
        {
          id: "z5",
          name: zoneLabel("aboveLt2"),
          figure: `≥ ${anchor + 1}`,
          percent: percents[4] ?? "",
        },
      ];
    };

    const paceZones = (
      secPerKm: number,
      fast: number,
      slow: number,
    ): ScoreZone[] => {
      const lt2 = Math.round(secPerKm);
      const primary = (seconds: number) => paceParts(seconds, units).clock;
      const between =
        lt2 + 1 <= fast - 1
          ? paceRangeLabel(lt2 + 1, fast - 1, units).clock
          : "—";
      return [
        {
          id: "z1",
          name: zoneLabel("belowLt1"),
          figure: `> ${primary(slow)}`,
          percent: `<${LT1_PACE_SPEED_PERCENT.min}%`,
        },
        {
          id: "z2",
          name: zoneLabel("lt1"),
          figure: paceRangeLabel(fast, slow, units).clock,
          percent: `${LT1_PACE_SPEED_PERCENT.min}–${LT1_PACE_SPEED_PERCENT.max}%`,
        },
        { id: "z3", name: zoneLabel("between"), figure: between, percent: "" },
        {
          id: "z4",
          name: zoneLabel("lt2"),
          figure: primary(lt2),
          percent: "100%",
        },
        {
          id: "z5",
          name: zoneLabel("aboveLt2"),
          figure: `< ${primary(lt2)}`,
          percent: "",
        },
      ];
    };

    if (metric === "RACE") {
      if (!raceDistanceKm || !raceTimeSeconds) return null;
      const estimate = estimateLt2PaceFromRace(raceDistanceKm, raceTimeSeconds);
      if (!estimate) return null;
      const lt1 = lt1PaceBand(estimate.secPerKm);
      if (!lt1) return null;
      const racePace = raceTimeSeconds / raceDistanceKm;
      const primary = paceParts(estimate.secPerKm, units);
      const lt1Range = paceRangeLabel(
        lt1.fastSecPerKm,
        lt1.slowSecPerKm,
        units,
      );
      return {
        eyebrow: t("result.labels.pace"),
        value: primary.clock,
        unit: `/${primary.unit}`,
        pace: true,
        protocol: `${racePreset === "custom" ? `${formatDisplayDistance(raceDistanceKm, units)} ${distanceUnit}` : t(`race.presets.${racePreset}`)} · ${raceTimeText.trim()}`,
        lt1Label: t("result.labels.lt1"),
        lt1Value: lt1Range.clock,
        extras: [
          {
            label: t("result.race.racePace"),
            value: paceParts(racePace, units).label,
          },
          {
            label: t("scorecard.also"),
            value: paceParts(estimate.secPerKm, other).label,
          },
        ],
        zonesTitle: t("zones.title"),
        zones: paceZones(estimate.secPerKm, lt1.fastSecPerKm, lt1.slowSecPerKm),
        disclaimer: t("result.disclaimer.race"),
        explainer: t("result.lt1Explainer.pace", {
          minPct: LT1_PACE_SPEED_PERCENT.min,
          maxPct: LT1_PACE_SPEED_PERCENT.max,
        }),
        links: [
          {
            href: `${prefix}/running-pace-calculator`,
            label: t("handoff.runningPace"),
          },
          { href: `${prefix}/vdot-calculator`, label: t("handoff.vdot") },
          {
            href: `${prefix}/docs/metrics/pace/zones`,
            label: t("handoff.paceDocs"),
          },
          {
            href: `${prefix}/heart-rate-zones-calculator`,
            label: t("handoff.heartRatePlain"),
          },
          {
            href: `${prefix}/power-zones-calculator`,
            label: t("handoff.powerPlain"),
          },
        ],
        anchor: {
          kind: "pace",
          pace: primary.label,
          lt1Pace: lt1Range.label,
        },
      } satisfies Scorecard;
    }

    if (metric === "HEART_RATE") {
      if (!avgHr20) return null;
      const lthr = Math.round(avgHr20);
      const lt1 = lt1HeartRateBand(lthr);
      if (!lt1) return null;
      return {
        eyebrow: t("result.labels.heartRate"),
        value: String(lthr),
        unit: "bpm",
        pace: false,
        protocol: t("heartRate.avgHr20.label"),
        lt1Label: t("result.labels.lt1"),
        lt1Value: `${lt1.min}–${lt1.max}`,
        extras: [],
        zonesTitle: t("zones.title"),
        zones: pointZones(lthr, lt1, hrPercents).map((zone) => ({
          ...zone,
          percent: zone.id === "z4" ? "LTHR" : zone.percent,
        })),
        disclaimer: t("result.disclaimer.field"),
        explainer: t("result.lt1Explainer.heartRate", {
          minPct: LT1_HEART_RATE_PERCENT.min,
          maxPct: LT1_HEART_RATE_PERCENT.max,
        }),
        links: [
          {
            href: heartRateZonesHref(prefix, lthr),
            label: t("handoff.heartRate"),
          },
          {
            href: `${prefix}/power-zones-calculator`,
            label: t("handoff.powerPlain"),
          },
        ],
        anchor: {
          kind: "heartRate",
          hr: t("zones.bpmPoint", { value: lthr }),
          lt1Hr: t("zones.bpmRange", { min: lt1.min, max: lt1.max }),
        },
      } satisfies Scorecard;
    }

    if (metric === "POWER") {
      if (!avgPower) return null;
      const ftp = estimateFtpFromProtocol(avgPower, powerProtocol);
      if (!ftp) return null;
      const lt1 = lt1PowerBand(ftp);
      if (!lt1) return null;
      const protocolLabel =
        powerProtocol === "60MIN"
          ? t("power.protocols.60min")
          : powerProtocol === "8MIN"
            ? t("power.protocols.8min")
            : t("power.protocols.20min");
      return {
        eyebrow: t("result.labels.power"),
        value: String(ftp),
        unit: "W",
        pace: false,
        protocol: protocolLabel,
        lt1Label: t("result.labels.lt1"),
        lt1Value: `${lt1.min}–${lt1.max}`,
        extras: [],
        zonesTitle: `${POWER_ZONE_MODEL_NAMES[zoneModel]} · ${t("zones.powerTitle")}`,
        zones: (calculatePowerZones(zoneModel, ftp) ?? []).map((zone) => ({
          id: `z${zone.order}`,
          name: tZones(
            `zoneNames.${zoneModel === "COGGAN" ? "FRIEL" : zoneModel}.z${zone.order}`,
          ),
          figure: zone.wattLabel.replace(/W/g, "").trim(),
          percent: zone.percentLabel,
        })),
        disclaimer: t("result.disclaimer.field"),
        explainer: t("result.lt1Explainer.power", {
          minPct: LT1_POWER_PERCENT.min,
          maxPct: LT1_POWER_PERCENT.max,
        }),
        links: [
          {
            href: powerZonesHref(prefix, ftp, zoneModel),
            label: t("handoff.power"),
          },
          {
            href: `${prefix}/heart-rate-zones-calculator`,
            label: t("handoff.heartRatePlain"),
          },
        ],
        anchor: {
          kind: "power",
          power: t("zones.wattPoint", { value: ftp }),
          lt1Power: t("zones.wattRange", { min: lt1.min, max: lt1.max }),
        },
      } satisfies Scorecard;
    }

    if (!distanceKm || !timeSeconds) return null;
    const paceSecPerKm = timeSeconds / distanceKm;
    const lt1 = lt1PaceBand(paceSecPerKm);
    if (!lt1) return null;
    const primary = paceParts(paceSecPerKm, units);
    const lt1Range = paceRangeLabel(lt1.fastSecPerKm, lt1.slowSecPerKm, units);
    const speedKmh = Number((3600 / paceSecPerKm).toFixed(2));
    return {
      eyebrow: t("result.labels.pace"),
      value: primary.clock,
      unit: `/${primary.unit}`,
      pace: true,
      protocol: t("inputs.metric.options.pace"),
      lt1Label: t("result.labels.lt1"),
      lt1Value: lt1Range.clock,
      extras: [
        { label: t("result.pace.speed"), value: `${speedKmh} km/h` },
        {
          label: t("scorecard.also"),
          value: paceParts(paceSecPerKm, other).label,
        },
      ],
      zonesTitle: t("zones.title"),
      zones: paceZones(paceSecPerKm, lt1.fastSecPerKm, lt1.slowSecPerKm),
      disclaimer: t("result.disclaimer.paceEffort"),
      explainer: t("result.lt1Explainer.pace", {
        minPct: LT1_PACE_SPEED_PERCENT.min,
        maxPct: LT1_PACE_SPEED_PERCENT.max,
      }),
      links: [
        {
          href: `${prefix}/running-pace-calculator`,
          label: t("handoff.runningPace"),
        },
        {
          href: `${prefix}/docs/metrics/pace/zones`,
          label: t("handoff.paceDocs"),
        },
        {
          href: `${prefix}/heart-rate-zones-calculator`,
          label: t("handoff.heartRatePlain"),
        },
        {
          href: `${prefix}/power-zones-calculator`,
          label: t("handoff.powerPlain"),
        },
      ],
      anchor: {
        kind: "pace",
        pace: primary.label,
        lt1Pace: lt1Range.label,
      },
    } satisfies Scorecard;
  }, [
    avgHr20,
    avgPower,
    distanceKm,
    metric,
    powerProtocol,
    prefix,
    raceDistanceKm,
    racePreset,
    raceTimeSeconds,
    raceTimeText,
    t,
    timeSeconds,
    units,
    zoneModel,
    tZones,
    distanceUnit,
  ]);

  const warnings = useMemo(() => {
    const items: string[] = [];
    if (metric === "RACE") {
      if (
        racePreset === "custom" &&
        raceDistanceKm &&
        (raceDistanceKm < 1 || raceDistanceKm > 100)
      ) {
        items.push(
          units === "imperial"
            ? t("warnings.distanceRangeMi")
            : t("warnings.distanceRange"),
        );
      }
      if (raceDistanceKm && raceTimeSeconds) {
        const paceSecPerKm = raceTimeSeconds / raceDistanceKm;
        if (paceSecPerKm < 120 || paceSecPerKm > 900)
          items.push(t("warnings.racePace"));
        const estimate = estimateLt2PaceFromRace(
          raceDistanceKm,
          raceTimeSeconds,
        );
        if (estimate && !estimate.vdotSupported)
          items.push(t("warnings.modelRange"));
      }
    }
    if (
      metric === "HEART_RATE" &&
      avgHr20 &&
      (avgHr20 < 100 || avgHr20 > 220)
    ) {
      items.push(t("warnings.heartRateRange"));
    }
    if (metric === "POWER" && avgPower && (avgPower < 50 || avgPower > 700)) {
      items.push(t("warnings.powerRange"));
    }
    if (metric === "PACE") {
      if (distanceKm && (distanceKm < 1 || distanceKm > 100)) {
        items.push(
          units === "imperial"
            ? t("warnings.distanceRangeMi")
            : t("warnings.distanceRange"),
        );
      }
      if (distanceKm && timeSeconds) {
        const paceSecPerKm = timeSeconds / distanceKm;
        if (paceSecPerKm < 120 || paceSecPerKm > 900)
          items.push(t("warnings.paceRange"));
      }
    }
    return items;
  }, [
    avgHr20,
    avgPower,
    distanceKm,
    metric,
    raceDistanceKm,
    racePreset,
    raceTimeSeconds,
    t,
    timeSeconds,
    units,
  ]);

  const sessionKind = result?.anchor.kind ?? "pace";
  const sessionFill = {
    value:
      result?.anchor[sessionKind === "heartRate" ? "hr" : sessionKind] ??
      (units === "imperial"
        ? t("workouts.examples.paceMi")
        : t("workouts.examples.pace")),
    easy:
      result?.anchor[
        sessionKind === "heartRate"
          ? "lt1Hr"
          : sessionKind === "power"
            ? "lt1Power"
            : "lt1Pace"
      ] ??
      (units === "imperial"
        ? t("workouts.examples.lt1PaceMi")
        : t("workouts.examples.lt1Pace")),
  };
  const sessionNote = t(
    result ? "workouts.personalNote" : "workouts.exampleNote",
  );

  useInstantToolAnalytics(
    "lactate_threshold_calculator",
    "calculate_lactate_threshold",
    Boolean(result),
  );

  const resultRef = useRef<HTMLElement>(null);
  const hadResultRef = useRef(false);
  useEffect(() => {
    const hasResult = result !== null;
    if (
      hasResult &&
      !hadResultRef.current &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    hadResultRef.current = hasResult;
  }, [result]);

  function selectUnits(next: UnitSystem) {
    if (next === units) return;
    setRaceDistanceText((text) => convertDistanceText(text, units, next));
    setDistanceText((text) => convertDistanceText(text, units, next));
    setUnits(next);
  }

  function onUnitKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? "imperial" : "metric";
    selectUnits(next);
    document
      .getElementById(
        next === "metric" ? "lt-units-metric" : "lt-units-imperial",
      )
      ?.focus();
  }

  async function onShare() {
    const url = new URL(window.location.href);
    url.hash = "result";
    window.history.replaceState(window.history.state, "", url);
    try {
      if (navigator.share) {
        await navigator.share({
          title: t("scorecard.summaryTitle"),
          url: url.toString(),
        });
        trackToolEvent("tool_result_copied", "lactate_threshold_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      trackToolEvent("tool_result_copied", "lactate_threshold_calculator", {
        action: "copy_link",
      });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "lactate_threshold_calculator", {
        action: "copy_link",
        error_code: "clipboard_failed",
      });
    }
  }

  function onPrint() {
    trackToolEvent("tool_result_copied", "lactate_threshold_calculator", {
      action: "print_result_card",
    });
    window.print();
  }

  const steps = [
    [
      "metric",
      tPage("howTo.steps.metric.title"),
      tPage("howTo.steps.metric.body"),
    ],
    ["test", tPage("howTo.steps.test.title"), tPage("howTo.steps.test.body")],
    [
      "update",
      tPage("howTo.steps.update.title"),
      tPage("howTo.steps.update.body"),
    ],
  ] as const;
  const primaryLink = result?.links[0];

  function useFileResult(estimate: ThresholdFileEstimate) {
    const clock = `${Math.floor(estimate.seconds / 60)}:${String(Math.round(estimate.seconds % 60)).padStart(2, "0")}`;
    if (estimate.metric === "HEART_RATE")
      setAvgHr20Text(String(Number(estimate.average!.toFixed(1))));
    if (estimate.metric === "POWER") {
      setAvgPowerText(String(Number(estimate.average!.toFixed(1))));
      setPowerProtocol("20MIN");
    }
    if (estimate.metric === "RACE") {
      setRacePreset("custom");
      setRaceDistanceText(formatDisplayDistance(estimate.distanceKm!, units));
      setRaceTimeText(clock);
    }
    if (estimate.metric === "PACE") {
      setDistanceText(formatDisplayDistance(estimate.distanceKm!, units));
      setTimeText(clock);
    }
  }

  function resetFileResult() {
    if (metric === "HEART_RATE") setAvgHr20Text("");
    if (metric === "POWER") setAvgPowerText("");
    if (metric === "RACE") setRaceTimeText("");
    if (metric === "PACE") setTimeText("");
  }

  return (
    <>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <div className={styles.boardHead}>
            <h2 className={styles.boardLabel}>{t("manual.title")}</h2>
            <div
              role="radiogroup"
              aria-label={t("manual.unitsLabel")}
              className={styles.unitSwitch}
            >
              <Button
                id="lt-units-metric"
                type="button"
                role="radio"
                variant="ghost"
                aria-checked={units === "metric"}
                tabIndex={units === "metric" ? 0 : -1}
                onClick={() => selectUnits("metric")}
                onKeyDown={onUnitKeyDown}
                className={styles.unitOption}
              >
                {t("manual.unitsMetric")}
              </Button>
              <Button
                id="lt-units-imperial"
                type="button"
                role="radio"
                variant="ghost"
                aria-checked={units === "imperial"}
                tabIndex={units === "imperial" ? 0 : -1}
                onClick={() => selectUnits("imperial")}
                onKeyDown={onUnitKeyDown}
                className={styles.unitOption}
              >
                {t("manual.unitsImperial")}
              </Button>
            </div>
          </div>
          <p className={styles.boardLead}>{t("panel.subtitle")}</p>
          <ol className={styles.stepList}>
            {steps.map(([key, title, body], index) => (
              <li key={key} className={styles.stepItem}>
                <span className={styles.stepIndex}>{index + 1}</span>
                <p>
                  <strong>{title}</strong> {body}
                </p>
              </li>
            ))}
          </ol>
          <Tabs
            value={metric}
            onValueChange={(value) => setMetric(value as MetricKey)}
          >
            <TabsList
              className={styles.inputTabs}
              aria-label={t("inputs.metric.label")}
            >
              {METRICS.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {t(`inputs.metric.options.${METRIC_OPTION[key]}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <fieldset className={styles.inputSources}>
            <legend className="sr-only">{t("source.label")}</legend>
            <span className={styles.inputSourceLabel} aria-hidden="true">
              {t("source.label")}
            </span>
            <div className={styles.inputSourceOptions}>
              {(["manual", "file"] as const).map((source) => (
                <label key={source}>
                  <input
                    type="radio"
                    name="lt-input-source"
                    value={source}
                    checked={inputTab === source}
                    onChange={() => setInputTab(source)}
                  />
                  <span>{t(`source.${source}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {inputTab === "file" ? (
            <ThresholdFileInput
              key={metric}
              metric={metric}
              onResult={useFileResult}
              onReset={resetFileResult}
            />
          ) : (
            <>
              <p className={styles.fileHint}>
                {t(`inputs.metric.hint.${metric}`)}
              </p>
              <div className={styles.formStack}>
                {metric === "RACE" ? (
                  <>
                    <div className={styles.field}>
                      <Label htmlFor="lt-race-preset">
                        {t("race.preset.label")}
                      </Label>
                      <Select
                        value={racePreset}
                        onValueChange={(value) =>
                          setRacePreset(value as RacePresetKey)
                        }
                      >
                        <SelectTrigger id="lt-race-preset" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RACE_PRESETS.map((preset) => (
                            <SelectItem key={preset} value={preset}>
                              {t(`race.presets.${preset}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {racePreset === "custom" ? (
                      <div className={styles.field}>
                        <Label htmlFor="lt-race-distance">
                          {units === "imperial"
                            ? t("race.distanceMi.label")
                            : t("race.distanceKm.label")}
                        </Label>
                        <UnitInput
                          id="lt-race-distance"
                          suffix={distanceUnit}
                          inputMode="decimal"
                          placeholder={
                            units === "imperial"
                              ? t("race.distanceMi.placeholder")
                              : t("race.distanceKm.placeholder")
                          }
                          value={raceDistanceText}
                          onChange={(event) =>
                            setRaceDistanceText(event.target.value)
                          }
                          aria-invalid={
                            raceDistanceText.trim() !== "" &&
                            !parsePositiveNumber(raceDistanceText)
                          }
                        />
                      </div>
                    ) : null}
                    <div className={styles.field}>
                      <Label htmlFor="lt-race-time">
                        {t("race.time.label")}
                      </Label>
                      <Input
                        id="lt-race-time"
                        inputMode="text"
                        placeholder={t("race.time.placeholder")}
                        value={raceTimeText}
                        onChange={(event) =>
                          setRaceTimeText(event.target.value)
                        }
                        aria-invalid={
                          raceTimeText.trim() !== "" && !raceTimeSeconds
                        }
                      />
                    </div>
                  </>
                ) : null}

                {metric === "HEART_RATE" ? (
                  <div className={styles.field}>
                    <Label htmlFor="lt-hr">
                      {t("heartRate.avgHr20.label")}
                    </Label>
                    <UnitInput
                      id="lt-hr"
                      suffix="bpm"
                      inputMode="numeric"
                      placeholder={t("heartRate.avgHr20.placeholder")}
                      value={avgHr20Text}
                      onChange={(event) => setAvgHr20Text(event.target.value)}
                      aria-invalid={avgHr20Text.trim() !== "" && !avgHr20}
                    />
                  </div>
                ) : null}

                {metric === "POWER" ? (
                  <>
                    <div className={styles.field}>
                      <Label htmlFor="lt-protocol">
                        {t("power.protocol.label")}
                      </Label>
                      <Select
                        value={powerProtocol}
                        onValueChange={(value) =>
                          setPowerProtocol(value as PowerProtocol)
                        }
                      >
                        <SelectTrigger id="lt-protocol" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20MIN">
                            {t("power.protocols.20min")}
                          </SelectItem>
                          <SelectItem value="8MIN">
                            {t("power.protocols.8min")}
                          </SelectItem>
                          <SelectItem value="60MIN">
                            {t("power.protocols.60min")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="lt-power">
                        {t("power.avgPower.label")}
                      </Label>
                      <UnitInput
                        id="lt-power"
                        suffix="W"
                        inputMode="numeric"
                        placeholder={t("power.avgPower.placeholder")}
                        value={avgPowerText}
                        onChange={(event) =>
                          setAvgPowerText(event.target.value)
                        }
                        aria-invalid={avgPowerText.trim() !== "" && !avgPower}
                      />
                    </div>
                  </>
                ) : null}

                {metric === "PACE" ? (
                  <div className={styles.effortGrid}>
                    <div className={styles.field}>
                      <Label htmlFor="lt-distance">
                        {units === "imperial"
                          ? t("pace.distanceMi.label")
                          : t("pace.distanceKm.label")}
                      </Label>
                      <UnitInput
                        id="lt-distance"
                        suffix={distanceUnit}
                        inputMode="decimal"
                        placeholder={
                          units === "imperial"
                            ? t("pace.distanceMi.placeholder")
                            : t("pace.distanceKm.placeholder")
                        }
                        value={distanceText}
                        onChange={(event) =>
                          setDistanceText(event.target.value)
                        }
                        aria-invalid={
                          distanceText.trim() !== "" &&
                          !parsePositiveNumber(distanceText)
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="lt-time">{t("pace.time.label")}</Label>
                      <Input
                        id="lt-time"
                        inputMode="text"
                        placeholder={t("pace.time.placeholder")}
                        value={timeText}
                        onChange={(event) => setTimeText(event.target.value)}
                        aria-invalid={timeText.trim() !== "" && !timeSeconds}
                      />
                    </div>
                  </div>
                ) : null}

                {warnings.length > 0 ? (
                  <div role="status" className={styles.alert}>
                    <ul>
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      <div className={styles.posterWrap}>
        <section
          id="result"
          ref={resultRef}
          aria-live="polite"
          className={styles.poster}
        >
          <div className={styles.posterSheet}>
            <div className={styles.posterBrand}>
              <h2 className={styles.posterHeading}>
                {t("scorecard.summaryTitle")}
              </h2>
              <p className={styles.posterMark}>Trainingload.ai</p>
            </div>
            <div className={styles.posterMain}>
              <div className={styles.posterPower}>
                <p className={styles.posterEyebrow}>
                  {result?.eyebrow ?? t("result.labels.lt2")}
                </p>
                <p
                  className={styles.posterWatts}
                  data-pace={result?.pace ? "true" : "false"}
                >
                  <span className={styles.posterNumber}>
                    {result?.value ?? "—"}
                  </span>
                  {result ? (
                    <span className={styles.posterUnit}>{result.unit}</span>
                  ) : null}
                </p>
                <p className={styles.posterProtocol}>
                  {result ? result.protocol : t("scorecard.empty")}
                </p>
              </div>
              <div className={styles.pride}>
                <p className={styles.posterEyebrow}>
                  {result?.lt1Label ?? t("result.labels.lt1")}
                </p>
                <p className={styles.prideFigure}>
                  <span className={styles.prideValue} data-wide="true">
                    {result?.lt1Value ?? "—"}
                  </span>
                  {result ? (
                    <span className={styles.prideUnit}>{result.unit}</span>
                  ) : null}
                </p>
              </div>
            </div>
            {result && result.extras.length > 0 ? (
              <div
                className={styles.paceRow}
                role="group"
                aria-label={t("zones.title")}
              >
                {result.extras.map((extra) => (
                  <div key={extra.label}>
                    <span>{extra.label}</span>
                    <strong>{extra.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {result ? (
              <div className={styles.posterZones}>
                <div className={styles.zoneHeading}>
                  <h3>{result.zonesTitle}</h3>
                  <span>{result.unit}</span>
                </div>
                <ol
                  className={styles.zoneStrip}
                  data-count={result.zones.length}
                >
                  {result.zones.map((zone) => (
                    <li
                      key={zone.id}
                      className={styles.zoneCell}
                      data-zone={zone.id}
                      aria-label={`${zone.name} ${zone.figure}`}
                    >
                      <span className={styles.zoneSwatch}>
                        {metric === "POWER"
                          ? zone.id.replace("z", "Z")
                          : zone.name}
                      </span>
                      {metric === "POWER" ? (
                        <span className={styles.zoneName}>{zone.name}</span>
                      ) : null}
                      <span className={styles.zoneFigure}>{zone.figure}</span>
                      <span className={styles.zonePercent}>{zone.percent}</span>
                    </li>
                  ))}
                </ol>
                <p className={styles.zoneCaption}>{t("result.shortNote")}</p>
              </div>
            ) : null}
          </div>
        </section>
        <div className={`${styles.posterActions} lt-share-actions`}>
          {metric === "POWER" ? (
            <Select
              value={zoneModel}
              onValueChange={(value) => setZoneModel(value as PowerZoneModel)}
            >
              <SelectTrigger
                aria-label={t("scorecard.switchZones")}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                {t("scorecard.switchZones")}
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {POWER_ZONE_MODELS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {POWER_ZONE_MODEL_NAMES[model]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {primaryLink ? (
            <a href={primaryLink.href} className={styles.primaryAction}>
              {primaryLink.label}
            </a>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={!result}
            onClick={onPrint}
          >
            <Printer className="size-3.5" aria-hidden />
            {t("scorecard.print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={!result}
            onClick={onShare}
          >
            <Share2 className="size-3.5" aria-hidden />
            {copied ? t("scorecard.copied") : t("scorecard.copyLink")}
          </Button>
        </div>
        {result ? (
          <details className={styles.resultDetails}>
            <summary>{t("scorecard.evidence")}</summary>
            <p>{result.disclaimer}</p>
            <p>{result.explainer}</p>
          </details>
        ) : null}
      </div>

      <section id="workouts" className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 className={styles.sectionTitle}>{t("workouts.title")}</h2>
          <p className={styles.sectionBody}>{t("workouts.description")}</p>
        </div>
        <p className={styles.note}>{sessionNote}</p>
        <div className={styles.sessionGrid}>
          {SESSION_KEYS.map((key) => (
            <div key={key} className={styles.infoCard}>
              <h3>{t(`workouts.sessions.${key}.title`)}</h3>
              <p>{t(`workouts.byMetric.${sessionKind}.${key}`, sessionFill)}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
