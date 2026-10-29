/**
 * 区间模型枚举 → 教练/分析用的稳定英文名。
 * UI 文案走 i18n；这里给 AI 输入和跨模块说明，不随语言变。
 */
const HEART_RATE_ZONE_MODEL_LABELS = {
  MHR: 'Maximum heart rate (5 zones)',
  FRIEL: 'Joe Friel (LTHR)',
  KARVONEN: 'Karvonen (HRR)',
} as const;

const PACE_ZONE_MODEL_LABELS = {
  FRIEL: 'Joe Friel (TP)',
  DANIELS: 'Jack Daniels (VO2max)',
} as const;

const POWER_ZONE_MODEL_LABELS = {
  FRIEL: 'Joe Friel Bike (7 zones, FTP)',
  VANCE: 'Jim Vance Run (7 zones, FTP)',
  STRYD: 'Stryd Run (5 zones, FTP)',
} as const;

function zoneModelKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function labelFromMap(
  value: unknown,
  labels: Record<string, string>,
): string | undefined {
  const label = labels[zoneModelKey(value)];
  return label || undefined;
}

/**
 * 标签化心率区间模型。
 * @param model - 心率区间模型。
 * @returns 标签化心率区间模型。
 */
export function labelHeartRateZoneModel(
  model?: string | null,
): string | undefined {
  return labelFromMap(model, HEART_RATE_ZONE_MODEL_LABELS);
}

/**
 * 标签化配速区间模型。
 * @param model - 配速区间模型。
 * @returns 标签化配速区间模型。
 */
export function labelPaceZoneModel(model?: string | null): string | undefined {
  return labelFromMap(model, PACE_ZONE_MODEL_LABELS);
}

/**
 * 标签化功率区间模型。
 * @param model - 功率区间模型。
 * @returns 标签化功率区间模型。
 */
export function labelPowerZoneModel(model?: string | null): string | undefined {
  return labelFromMap(model, POWER_ZONE_MODEL_LABELS);
}
