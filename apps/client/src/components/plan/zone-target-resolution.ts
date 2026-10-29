"use client";

import type { UserProfile, UserZoneSetting } from "@/api/settings";
import { SportType } from "@/api/activities";
import { BenchmarkType } from "@/app/[locale]/(main)/account/component/zoneSettings";
import { calculateZoneAbsoluteValue } from "@/app/[locale]/(main)/account/component/zone-editor-model";
import type { WorkoutZoneBasisSnapshot } from "@/api/workout";
import { resolveLthrForCalculation } from "@shared/lthr";

/** 将手动步骤里「区间 %」换算为 bpm / W 时使用的上下文（来自资料与区间设置） */
export type ZoneResolutionContext = {
  sportType: string;
  profile: UserProfile | undefined;
  hrBenchmark: BenchmarkType | undefined;
  powerBenchmark: BenchmarkType | undefined;
  paceBenchmark: BenchmarkType | undefined;
};

export function buildZoneResolutionContext(
  sportType: string,
  profile: UserProfile | undefined,
  userZones: UserZoneSetting[] | undefined,
): ZoneResolutionContext | undefined {
  if (!userZones?.length && !profile) return undefined;
  const hr = userZones?.find(
    (z) => z.sportType === sportType && z.zoneType === "HEART_RATE",
  );
  const pw = userZones?.find(
    (z) => z.sportType === sportType && z.zoneType === "POWER",
  );
  const pace = userZones?.find(
    (z) => z.sportType === sportType && z.zoneType === "PACE",
  );
  return {
    sportType,
    profile,
    hrBenchmark: hr?.benchmark,
    powerBenchmark: pw?.benchmark,
    paceBenchmark: pace?.benchmark,
  };
}

function toFiniteNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function hrBenchmarkToValue(
  benchmark: BenchmarkType,
  profile: UserProfile | undefined,
): number | null {
  switch (benchmark) {
    case BenchmarkType.MHR:
      return profile?.maxHeartRate ?? 200;
    case BenchmarkType.LTHR:
      return (
        resolveLthrForCalculation({
          lthr: profile?.lthr,
          maxHeartRate: profile?.maxHeartRate,
        })?.value ?? null
      );
    case BenchmarkType.HRR: {
      const maxHr = profile?.maxHeartRate ?? 200;
      const rhr = profile?.restingHeartRate ?? 60;
      return maxHr - rhr;
    }
    case BenchmarkType.CUSTOM:
      return null;
    default:
      return null;
  }
}

function powerBenchmarkToValue(
  benchmark: BenchmarkType,
  profile: UserProfile | undefined,
): number | null {
  switch (benchmark) {
    case BenchmarkType.FTP:
      return profile?.ftp ?? 250;
    case BenchmarkType.CP:
      return profile?.cp ?? 250;
    case BenchmarkType.CUSTOM:
      return null;
    default:
      return null;
  }
}

function pickBenchmarkValue(
  value: number | null | undefined,
  fallback: number | null,
) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { value, source: "PROFILE" as const };
  }
  if (
    typeof fallback === "number" &&
    Number.isFinite(fallback) &&
    fallback > 0
  ) {
    return { value: fallback, source: "FALLBACK" as const };
  }
  return { value: undefined, source: "UNKNOWN" as const };
}

function buildHrBenchmarkSnapshot(
  benchmark: BenchmarkType,
  profile: UserProfile | undefined,
) {
  if (benchmark === BenchmarkType.CUSTOM) {
    return {
      benchmarkValue: undefined,
      benchmarkUnit: "bpm",
      benchmarkSource: "CUSTOM" as const,
      inputs: undefined,
    };
  }

  if (benchmark === BenchmarkType.HRR) {
    const maxHr = pickBenchmarkValue(profile?.maxHeartRate, 200);
    const restingHr = pickBenchmarkValue(profile?.restingHeartRate, 60);
    const reserve =
      typeof maxHr.value === "number" && typeof restingHr.value === "number"
        ? maxHr.value - restingHr.value
        : undefined;
    return {
      benchmarkValue:
        typeof reserve === "number" && Number.isFinite(reserve) && reserve > 0
          ? reserve
          : undefined,
      benchmarkUnit: "bpm",
      benchmarkSource:
        maxHr.source === "PROFILE" && restingHr.source === "PROFILE"
          ? ("PROFILE" as const)
          : ("FALLBACK" as const),
      inputs: {
        maxHeartRate: maxHr.value,
        restingHeartRate: restingHr.value,
      },
    };
  }

  if (benchmark === BenchmarkType.LTHR) {
    const resolved = resolveLthrForCalculation({
      lthr: profile?.lthr,
      maxHeartRate: profile?.maxHeartRate,
    });
    return {
      benchmarkValue: resolved?.value,
      benchmarkUnit: "bpm",
      benchmarkSource: resolved?.source ?? ("UNKNOWN" as const),
      inputs: {
        lthr: profile?.lthr,
        maxHeartRate: profile?.maxHeartRate,
      },
    };
  }

  const picked = pickBenchmarkValue(profile?.maxHeartRate, 200);
  return {
    benchmarkValue: picked.value,
    benchmarkUnit: "bpm",
    benchmarkSource: picked.source,
    inputs: { maxHeartRate: picked.value },
  };
}

function buildPowerBenchmarkSnapshot(
  benchmark: BenchmarkType,
  profile: UserProfile | undefined,
) {
  if (benchmark === BenchmarkType.CUSTOM) {
    return {
      benchmarkValue: undefined,
      benchmarkUnit: "W",
      benchmarkSource: "CUSTOM" as const,
      inputs: undefined,
    };
  }

  if (benchmark === BenchmarkType.CP) {
    const picked = pickBenchmarkValue(profile?.cp, 250);
    return {
      benchmarkValue: picked.value,
      benchmarkUnit: "W",
      benchmarkSource: picked.source,
      inputs: { cp: picked.value },
    };
  }

  const picked = pickBenchmarkValue(profile?.ftp, 250);
  return {
    benchmarkValue: picked.value,
    benchmarkUnit: "W",
    benchmarkSource: picked.source,
    inputs: { ftp: picked.value },
  };
}

function buildPaceBenchmarkSnapshot(
  benchmark: BenchmarkType,
  profile: UserProfile | undefined,
) {
  if (benchmark === BenchmarkType.CUSTOM) {
    return {
      benchmarkValue: undefined,
      benchmarkUnit: "m/s",
      benchmarkSource: "CUSTOM" as const,
      inputs: undefined,
    };
  }

  const picked = pickBenchmarkValue(profile?.cs, null);
  return {
    benchmarkValue: picked.value,
    benchmarkUnit: "m/s",
    benchmarkSource: picked.source,
    inputs: { cs: picked.value },
  };
}

export function buildZoneBasisSnapshot(args: {
  zoneType: "HEART_RATE" | "POWER" | "PACE";
  sportType: string;
  benchmark: BenchmarkType | string | undefined;
  profile: UserProfile | undefined;
  targetLow?: number;
  targetHigh?: number;
  targetUnit?: string;
}): WorkoutZoneBasisSnapshot {
  const benchmark = (args.benchmark || BenchmarkType.CUSTOM) as BenchmarkType;
  const basis =
    args.zoneType === "HEART_RATE"
      ? buildHrBenchmarkSnapshot(benchmark, args.profile)
      : args.zoneType === "POWER"
        ? buildPowerBenchmarkSnapshot(benchmark, args.profile)
        : buildPaceBenchmarkSnapshot(benchmark, args.profile);

  return {
    zoneType: args.zoneType,
    sportType: args.sportType,
    benchmark,
    ...basis,
    targetLow: args.targetLow,
    targetHigh: args.targetHigh,
    targetUnit: args.targetUnit,
  };
}

/** 心率区间边界（%）→ bpm 区间；与区间编辑器里「绝对值」算法一致 */
export function resolveHrZonePercentToBpmRange(
  lowPct: number,
  highPct: number | undefined,
  ctx: ZoneResolutionContext | null | undefined,
): { low: number; high?: number } | null {
  const benchmark = ctx?.hrBenchmark ?? BenchmarkType.MHR;
  if (benchmark === BenchmarkType.CUSTOM) {
    return null;
  }
  const bv = hrBenchmarkToValue(benchmark, ctx?.profile);
  if (bv == null || !Number.isFinite(bv) || bv <= 0) return null;

  const lowAbs = calculateZoneAbsoluteValue({
    pct: lowPct,
    benchmarkVal: bv,
    zoneType: "HEART_RATE",
    sportType: SportType.RUN,
    isCustom: false,
  });
  const low = toFiniteNumber(lowAbs);
  if (low == null) return null;

  if (highPct == null || !Number.isFinite(highPct)) {
    return { low };
  }
  const highAbs = calculateZoneAbsoluteValue({
    pct: highPct,
    benchmarkVal: bv,
    zoneType: "HEART_RATE",
    sportType: SportType.RUN,
    isCustom: false,
  });
  const high = toFiniteNumber(highAbs);
  if (high == null) return { low };
  return { low, high };
}

/** 功率区间边界（%）→ 瓦特区间 */
export function resolvePowerZonePercentToWattsRange(
  lowPct: number,
  highPct: number | undefined,
  ctx: ZoneResolutionContext | null | undefined,
): { low: number; high?: number } | null {
  const benchmark = ctx?.powerBenchmark ?? BenchmarkType.FTP;
  if (benchmark === BenchmarkType.CUSTOM) {
    return null;
  }
  const bv = powerBenchmarkToValue(benchmark, ctx?.profile);
  if (bv == null || !Number.isFinite(bv) || bv <= 0) return null;

  const lowAbs = calculateZoneAbsoluteValue({
    pct: lowPct,
    benchmarkVal: bv,
    zoneType: "POWER",
    sportType: SportType.CYCLING,
    isCustom: false,
  });
  const low = toFiniteNumber(lowAbs);
  if (low == null) return null;

  if (highPct == null || !Number.isFinite(highPct)) {
    return { low };
  }
  const highAbs = calculateZoneAbsoluteValue({
    pct: highPct,
    benchmarkVal: bv,
    zoneType: "POWER",
    sportType: SportType.CYCLING,
    isCustom: false,
  });
  const high = toFiniteNumber(highAbs);
  if (high == null) return { low };
  return { low, high };
}
