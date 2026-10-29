/**
 * calculatedPower v2 的跨端纯函数契约。
 *
 * v2 的 grade 参数统一使用百分比（5 表示 5%），并保持设备事实 power
 * 与模型 calculatedPower 分轨。
 */
export const CALCULATED_POWER_MODEL_VERSION = 2;
export const RUNNING_CALCULATED_POWER_MODEL = "SKIBA_GOVSS";
export const CYCLING_CALCULATED_POWER_MODEL = "GRIBBLE";
export const CALCULATED_POWER_GRADE_LIMIT_PERCENT = 40;
export const CYCLING_COASTING_CADENCE_RPM = 30;

export const DEFAULT_RUNNING_HEIGHT_M = 1.75;
export const DEFAULT_CYCLING_POWER_PARAMETERS = Object.freeze({
  airDensityKgM3: 1.225,
  rollingResistanceCoefficient: 0.005,
  dragAreaM2: 0.32,
  bikeMassKg: 9,
  drivetrainLoss: 0.02,
  headwindMetersPerSecond: 0,
  gradeMode: "record" as const,
});

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function normalizeCalculatedPowerHeightMeters(value: unknown): number {
  const height = positive(value);
  if (!height) return DEFAULT_RUNNING_HEIGHT_M;
  return height > 3 ? height / 100 : height;
}

/** Canonical grade uses percent: 5 means 5%, not 0.05. */
export function normalizeCalculatedPowerGradePercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(
    -CALCULATED_POWER_GRADE_LIMIT_PERCENT,
    Math.min(CALCULATED_POWER_GRADE_LIMIT_PERCENT, value),
  );
}

/** Skiba/GOVSS 跑步稳态功率；坡度输入为百分比。 */
export function calculateGradeAdjustedRunningPower(args: {
  gradePercent?: number | null;
  height?: number | null;
  speedMetersPerSecond?: number | null;
  weightKg?: number | null;
}): number | null {
  const weight = positive(args.weightKg);
  const speed = positive(args.speedMetersPerSecond);
  if (!weight || !speed) return null;
  const height = normalizeCalculatedPowerHeightMeters(args.height);
  const gradeRatio = normalizeCalculatedPowerGradePercent(args.gradePercent) / 100;
  const frontalArea =
    0.2025 * Math.pow(height, 0.725) * Math.pow(weight, 0.425) * 0.266;
  const aerodynamicCost =
    (0.5 * 1.2 * 0.9 * frontalArea * Math.pow(speed, 2)) / weight;
  const slopeMetabolicCost =
    155.4 * Math.pow(gradeRatio, 5) -
    30.4 * Math.pow(gradeRatio, 4) -
    43.3 * Math.pow(gradeRatio, 3) +
    46.3 * Math.pow(gradeRatio, 2) +
    19.5 * gradeRatio +
    3.6;
  const efficiency = (0.25 + 0.054 * speed) * (1 - (0.5 * speed) / 8.33);
  return Math.max(
    0,
    (aerodynamicCost + slopeMetabolicCost * efficiency) * speed * weight,
  );
}

/** Skiba/GOVSS 跑步力学模型的平地稳态功率。 */
export function calculateFlatRunningPower(args: {
  height?: number | null;
  speedMetersPerSecond?: number | null;
  weightKg?: number | null;
}): number | null {
  return calculateGradeAdjustedRunningPower({ ...args, gradePercent: 0 });
}

/** Gribble 稳态骑行模型；坡度输入为百分比。 */
export function calculateGradeAdjustedCyclingPower(args: {
  gradePercent?: number | null;
  speedMetersPerSecond?: number | null;
  weightKg?: number | null;
}): number | null {
  const weight = positive(args.weightKg);
  const speed = positive(args.speedMetersPerSecond);
  if (!weight || !speed) return null;
  const {
    airDensityKgM3,
    rollingResistanceCoefficient,
    dragAreaM2,
    bikeMassKg,
    drivetrainLoss,
    headwindMetersPerSecond,
  } = DEFAULT_CYCLING_POWER_PARAMETERS;
  const totalMassKg = weight + bikeMassKg;
  const gradeRatio = normalizeCalculatedPowerGradePercent(args.gradePercent) / 100;
  const angle = Math.atan(gradeRatio);
  const gravityPower = 9.81 * totalMassKg * Math.sin(angle) * speed;
  const rollingPower =
    9.81 * totalMassKg * rollingResistanceCoefficient * Math.cos(angle) * speed;
  const airSpeed = Math.max(0, speed + headwindMetersPerSecond);
  const dragPower =
    0.5 * dragAreaM2 * airDensityKgM3 * Math.pow(airSpeed, 2) * speed;
  return Math.max(
    0,
    (gravityPower + rollingPower + dragPower) / (1 - drivetrainLoss),
  );
}

/** Gribble 稳态骑行模型的平地、无风腿部功率。 */
export function calculateFlatCyclingPower(args: {
  speedMetersPerSecond?: number | null;
  weightKg?: number | null;
}): number | null {
  return calculateGradeAdjustedCyclingPower({ ...args, gradePercent: 0 });
}

export function calculateFlatPower(args: {
  height?: number | null;
  speedMetersPerSecond?: number | null;
  sportType?: string | null;
  weightKg?: number | null;
}): number | null {
  if (args.sportType === "RUN") return calculateFlatRunningPower(args);
  if (args.sportType === "CYCLING") return calculateFlatCyclingPower(args);
  return null;
}
