import {
  fitCubic,
  lineFit,
  maximumDistance,
  predict,
  upwardCrossing,
  type Curve,
} from "./lactate-analysis/math";

export const LACTATE_REFERENCE_COMMIT =
  "2cd3709f6442447b3b9128e325f13fa38570eb17";
export const LACTATE_ENGINE_VERSION = "1.0.0";
export const LACTATE_METHOD_IDS = [
  "obla_2",
  "obla_4",
  "bsln_05",
  "bsln_10",
  "log_log",
  "dmax",
  "moddmax",
  "log_poly_moddmax",
] as const;
export type LactateMethodId = (typeof LACTATE_METHOD_IDS)[number];
export type LactateSport = "cycling" | "running";
export type LactateStage = {
  intensity: number;
  lactate: number;
  heartRate?: number;
};
export type LactateReason =
  | "invalid_value"
  | "too_few_stages"
  | "too_many_stages"
  | "duplicate_intensity"
  | "unsorted_stages"
  | "fit_degenerate"
  | "target_not_reached"
  | "loglog_unavailable"
  | "no_lactate_rise"
  | "no_distance"
  | "no_resting_sample"
  | "few_stages"
  | "early_dip"
  | "final_not_rising"
  | "uneven_steps"
  | "threshold_at_edge"
  | "negative_fit"
  | "invalid_pair";
export type LactateMethodResult = {
  methodId: LactateMethodId;
  status: "available" | "unavailable";
  intensity: number | null;
  lactate: number | null;
  heartRate: number | null;
  reasonCodes: LactateReason[];
  anchors?: { intensity: number; lactate: number }[];
  logFit?: { slope: number; intercept: number }[];
};
export type LactatePair = {
  lt1Method: LactateMethodId;
  lt2Method: LactateMethodId;
};
export type LactateZone = {
  zone: 1 | 2 | 3;
  from: number | null;
  to: number | null;
};
export type LactateAnalysisInput = {
  sport: LactateSport;
  stages: LactateStage[];
  selectedPair?: LactatePair;
};
export type LactateAnalysis = {
  schemaVersion: 1;
  engineVersion: string;
  referenceCommit: string;
  sport: LactateSport;
  stages: LactateStage[];
  status: "complete" | "partial" | "unavailable";
  methods: LactateMethodResult[];
  warnings: LactateReason[];
  selectedPair: LactatePair | null;
  zones: LactateZone[];
  curve: { intensity: number; lactate: number }[];
  fitQuality: {
    rmse: number;
    maxResidual: number;
    rSquared: number | null;
    residuals: {
      intensity: number;
      observed: number;
      fitted: number;
      residual: number;
    }[];
  } | null;
};

export const DEFAULT_LACTATE_PAIR: LactatePair = {
  lt1Method: "bsln_05",
  lt2Method: "log_poly_moddmax",
};

export class LactateInputError extends Error {
  constructor(
    public readonly code: LactateReason,
    public readonly row?: number,
  ) {
    super(code);
    this.name = "LactateInputError";
  }
}

export function validateLactateInput(input: LactateAnalysisInput) {
  if (!["cycling", "running"].includes(input.sport))
    throw new LactateInputError("invalid_value");
  for (let i = 0; i < input.stages.length; i++) {
    const row = input.stages[i]!;
    if (
      !Number.isFinite(row.intensity) ||
      row.intensity < 0 ||
      !Number.isFinite(row.lactate) ||
      row.lactate <= 0 ||
      (row.heartRate !== undefined &&
        (!Number.isFinite(row.heartRate) || row.heartRate <= 0))
    ) {
      throw new LactateInputError("invalid_value", i);
    }
    if (
      input.stages
        .slice(0, i)
        .some((previous) => previous.intensity === row.intensity)
    )
      throw new LactateInputError("duplicate_intensity", i);
    if (i > 0 && row.intensity < input.stages[i - 1]!.intensity)
      throw new LactateInputError("unsorted_stages", i);
  }
  const count = input.stages.filter((row) => row.intensity > 0).length;
  if (count < 4) throw new LactateInputError("too_few_stages");
  if (count > 30) throw new LactateInputError("too_many_stages");
}

/** Only interpolate between consecutive measured exercise stages. */
function heartRateAt(stages: LactateStage[], intensity: number): number | null {
  const exact = stages.find(
    (row) => Math.abs(row.intensity - intensity) < 1e-8,
  );
  if (exact) return exact.heartRate ?? null;
  const high = stages.findIndex((row) => row.intensity > intensity);
  if (high < 1) return null;
  const a = stages[high - 1]!;
  const b = stages[high]!;
  if (a.heartRate === undefined || b.heartRate === undefined) return null;
  return (
    a.heartRate +
    ((b.heartRate - a.heartRate) * (intensity - a.intensity)) /
      (b.intensity - a.intensity)
  );
}

function loglog(stages: LactateStage[]) {
  if (stages.length < 5) return null;
  const x = stages.map((row) => Math.log(row.intensity));
  const y = stages.map((row) => Math.log(row.lactate));
  let best: {
    intensity: number;
    lactate: number;
    rss: number;
    lines: { slope: number; intercept: number }[];
  } | null = null;
  for (let split = 2; split <= stages.length - 3; split++) {
    const first = lineFit(x.slice(0, split + 1), y.slice(0, split + 1));
    const last = lineFit(x.slice(split), y.slice(split));
    if (!first || !last) continue;
    const rss = first.rss + last.rss;
    // Choose the minimum-RSS split before checking its intersection domain.
    if (best && rss >= best.rss) continue;
    const delta = first.slope - last.slope;
    const z =
      Math.abs(delta) < 1e-10
        ? NaN
        : (last.intercept - first.intercept) / delta;
    best = {
      intensity: Math.exp(z),
      lactate: Math.exp(first.intercept + first.slope * z),
      rss,
      lines: [first, last].map(({ slope, intercept }) => ({
        slope,
        intercept,
      })),
    };
  }
  return best &&
    Number.isFinite(best.intensity) &&
    best.intensity >= stages[0]!.intensity &&
    best.intensity <= stages.at(-1)!.intensity
    ? best
    : null;
}

export function selectLactatePair(
  analysis: LactateAnalysis,
  pair: LactatePair,
): LactateAnalysis {
  const lt1 = analysis.methods.find(
    (method) => method.methodId === pair.lt1Method,
  )?.intensity;
  const lt2 = analysis.methods.find(
    (method) => method.methodId === pair.lt2Method,
  )?.intensity;
  const warnings = analysis.warnings.filter(
    (warning) => warning !== "invalid_pair",
  );
  const valid =
    lt1 !== null &&
    lt1 !== undefined &&
    lt2 !== null &&
    lt2 !== undefined &&
    lt1 < lt2;
  const any = analysis.methods.some((method) => method.status === "available");
  return {
    ...analysis,
    selectedPair: valid ? { ...pair } : null,
    status: !any
      ? "unavailable"
      : valid &&
          analysis.methods.every((method) => method.status === "available")
        ? "complete"
        : "partial",
    warnings: valid ? warnings : [...warnings, "invalid_pair"],
    zones: valid
      ? [
          { zone: 1, from: null, to: lt1 },
          { zone: 2, from: lt1, to: lt2 },
          { zone: 3, from: lt2, to: null },
        ]
      : [],
  };
}

export function analyzeLactate(input: LactateAnalysisInput): LactateAnalysis {
  validateLactateInput(input);
  const original = input.stages.map((stage) => ({ ...stage }));
  const stages = original.filter((row) => row.intensity > 0);
  const first = stages[0]!;
  const last = stages.at(-1)!;
  const baseline =
    original.find((row) => row.intensity === 0)?.lactate ?? first.lactate;
  const curve = fitCubic(
    stages.map((row) => row.intensity),
    stages.map((row) => row.lactate),
  );
  const log = loglog(stages);
  const warnings: LactateReason[] = [];
  if (!original.some((row) => row.intensity === 0))
    warnings.push("no_resting_sample");
  if (stages.length < 6) warnings.push("few_stages");
  if (
    stages
      .slice(1, Math.ceil(stages.length / 2))
      .some((row, i) => row.lactate < stages[i]!.lactate)
  )
    warnings.push("early_dip");
  if (last.lactate <= stages.at(-2)!.lactate) warnings.push("final_not_rising");
  const steps = stages
    .slice(1)
    .map((row, i) => row.intensity - stages[i]!.intensity);
  if (Math.max(...steps) - Math.min(...steps) > Math.max(...steps) * 0.05)
    warnings.push("uneven_steps");
  const output: LactateMethodResult[] = [];
  function add(
    methodId: LactateMethodId,
    intensity: number | null,
    reason: LactateReason,
    lactate?: number,
    anchors?: LactateMethodResult["anchors"],
  ) {
    const valid =
      intensity !== null &&
      Number.isFinite(intensity) &&
      intensity >= first.intensity - 1e-8 &&
      intensity <= last.intensity + 1e-8;
    const value = valid
      ? Math.min(last.intensity, Math.max(first.intensity, intensity))
      : null;
    output.push({
      methodId,
      status: value === null ? "unavailable" : "available",
      intensity: value,
      lactate:
        value === null
          ? null
          : (lactate ?? (curve ? predict(curve, value) : null)),
      heartRate: value === null ? null : heartRateAt(stages, value),
      reasonCodes:
        value === null
          ? [reason]
          : value - first.intensity < 1e-6 || last.intensity - value < 1e-6
            ? ["threshold_at_edge"]
            : [],
      ...(anchors ? { anchors } : {}),
    });
  }
  for (const [id, target] of [
    ["obla_2", 2],
    ["obla_4", 4],
    ["bsln_05", baseline + 0.5],
    ["bsln_10", baseline + 1],
  ] as const) {
    add(
      id,
      curve
        ? upwardCrossing(curve, target, first.intensity, last.intensity)
        : null,
      curve ? "target_not_reached" : "fit_degenerate",
    );
  }
  add(
    "log_log",
    log?.intensity ?? null,
    stages.length < 5 ? "too_few_stages" : "loglog_unavailable",
    log?.lactate,
  );
  const rise = stages.findIndex(
    (row, i) => i > 0 && row.lactate - stages[i - 1]!.lactate >= 0.4 - 1e-9,
  );
  if (log)
    output.find((method) => method.methodId === "log_log")!.logFit = log.lines;
  const variants: {
    id: LactateMethodId;
    x0: number | null;
    observed: boolean;
    reason: LactateReason;
  }[] = [
    { id: "dmax", x0: first.intensity, observed: false, reason: "no_distance" },
    {
      id: "moddmax",
      x0: rise > 0 ? stages[rise - 1]!.intensity : null,
      observed: true,
      reason: rise > 0 ? "no_distance" : "no_lactate_rise",
    },
    {
      id: "log_poly_moddmax",
      x0: log?.intensity ?? null,
      observed: true,
      reason: log ? "no_distance" : "loglog_unavailable",
    },
  ];
  for (const variant of variants) {
    const { id, x0 } = variant;
    if (!curve || x0 === null) {
      add(id, null, !curve ? "fit_degenerate" : variant.reason);
      continue;
    }
    const y0 =
      id === "moddmax" ? stages[rise - 1]!.lactate : predict(curve, x0);
    const y1 = variant.observed ? last.lactate : predict(curve, last.intensity);
    const intensity = maximumDistance(curve, x0, y0, last.intensity, y1);
    add(id, intensity, variant.reason, undefined, [
      { intensity: x0, lactate: y0 },
      { intensity: last.intensity, lactate: y1 },
    ]);
  }
  const points = curve
    ? Array.from({ length: 121 }, (_, i) => {
        const intensity =
          first.intensity + ((last.intensity - first.intensity) * i) / 120;
        return { intensity, lactate: predict(curve, intensity) };
      })
    : [];
  if (points.some((point) => point.lactate < 0)) warnings.push("negative_fit");
  const residuals = curve
    ? stages.map((row) => ({
        intensity: row.intensity,
        observed: row.lactate,
        fitted: predict(curve, row.intensity),
        residual: row.lactate - predict(curve, row.intensity),
      }))
    : [];
  const squaredError = residuals.reduce(
    (sum, row) => sum + row.residual ** 2,
    0,
  );
  const mean =
    stages.reduce((sum, row) => sum + row.lactate, 0) / stages.length;
  const totalVariance = stages.reduce(
    (sum, row) => sum + (row.lactate - mean) ** 2,
    0,
  );
  return selectLactatePair(
    {
      schemaVersion: 1,
      engineVersion: LACTATE_ENGINE_VERSION,
      referenceCommit: LACTATE_REFERENCE_COMMIT,
      sport: input.sport,
      stages: original,
      status: "unavailable",
      methods: output,
      warnings,
      selectedPair: null,
      zones: [],
      curve: points,
      fitQuality: curve
        ? {
            rmse: Math.sqrt(squaredError / stages.length),
            maxResidual: Math.max(
              ...residuals.map((row) => Math.abs(row.residual)),
            ),
            rSquared:
              totalVariance > 1e-12 ? 1 - squaredError / totalVariance : null,
            residuals,
          }
        : null,
    },
    input.selectedPair ?? DEFAULT_LACTATE_PAIR,
  );
}

export type { Curve };
