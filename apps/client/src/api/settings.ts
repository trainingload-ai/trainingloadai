import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiFetch } from "@/lib/api";
import type { Locale } from "@/i18n/routing";
import { SportType } from "./activities";

export interface UserSettings {
  UNIT_SYSTEM?: string;
  POWER_UNIT?: string;
  THEME?: string;
  CHART_XAXIS?: string;
  TIME_FORMAT?: string;
  FITNESS_STATUS_LAYOUT?: string;
  AI_REVIEW_MODE?: string;
}

export const PUBLIC_DEMO_USER_SETTINGS: Readonly<UserSettings> = {
  UNIT_SYSTEM: "metric",
  POWER_UNIT: "watts",
  THEME: "system",
  CHART_XAXIS: "distance",
  TIME_FORMAT: "24h",
};

export interface EnumItem {
  id: string;
  category: string;
  value: string;
  label: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface EnumsResponse {
  enums: EnumItem[];
}

export enum HeartRateZoneModel {
  MHR = "MHR",
  FRIEL = "FRIEL",
  KARVONEN = "KARVONEN",
}

export enum PaceZoneModel {
  FRIEL = "FRIEL",
  DANIELS = "DANIELS",
}

export enum PowerZoneModel {
  FRIEL = "FRIEL",
  VANCE = "VANCE",
  STRYD = "STRYD",
}

export const DefaultVdotSource = {
  HEARTRATE: "HEARTRATE",
  FACTOR: "FACTOR",
  STANDARD: "STANDARD",
} as const;

export type DefaultVdotSource =
  (typeof DefaultVdotSource)[keyof typeof DefaultVdotSource];

/**
 * Get user settings
 */
export async function getUserSettings() {
  return await apiFetch<UserSettings>("/users/settings");
}

/**
 * Update user setting
 */
export async function updateUserSetting(
  category: string,
  value: string,
): Promise<void> {
  await apiFetch(`/users/settings/${category}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

/**
 * Sync user's preferred locale to server (for async workers: notifications/emails).
 */
export async function updatePreferredLocale(locale: Locale): Promise<void> {
  await apiFetch(`/users/preferences/locale`, {
    method: "PUT",
    body: JSON.stringify({ locale }),
  });
}

/**
 * Get enum values
 */
export async function getEnums(category: string) {
  return await apiFetch<EnumsResponse>(`/users/enums/${category}`);
}

export interface UserProfile {
  // type 运动类型，如果没有则为空
  type?: "RUN" | "CYCLING" | "SWIM";
  // 用户偏好的运动类型
  preferredSports?: ("RUN" | "CYCLING" | "SWIM" | "STRENGTH")[];
  // 体重
  weight?: number;
  // 身高
  height?: number;
  // 年龄
  age?: number;
  // 性别
  gender?: string;
  // 生日
  birthDate?: string;
  // 时区
  timezone?: string;
  // 最大心率
  maxHeartRate?: number;
  // 静息心率
  restingHeartRate?: number;
  //  乳酸心率
  lthr?: number;

  ftp?: number;
  // 临界功率
  cp?: number;
  // wPrime
  wPrime?: number;
  Pmax?: number;
  // 临界速度
  cs?: number;
  dPrime?: number;
  // 阈值速度
  tp?: number;
  // 有氧运动阈值pace
  aerobicThresholdPaceSec?: number;
  // 装备重量
  equipmentWeight?: number;
  // 自行车重量
  bikeWeight?: number;
  // PMC 负荷来源优先级（POWER、HEART_RATE、PACE, SESSIONRPE）
  loadSources?: ("POWER" | "HEART_RATE" | "PACE" | "SESSIONRPE")[];
  // 海拔优化模型
  altitudeOptimizationModel?: string;
  // 海拔阈值
  altitudeThreshold?: number;
  // 默认VDOT来源
  defaultVdotSource?: DefaultVdotSource | string;
  // VO2Max 校正因子
  vo2maxCorrectionFactor?: number;
  // 心率区间模型
  heartRateZoneModel?: HeartRateZoneModel | string;
  // 配速区间模型
  paceZoneModel?: PaceZoneModel | string;
  // 功率区间模型
  powerZoneModel?: PowerZoneModel;
  vVo2max?: number;
  new?: boolean;
}

// 枚举
export const BodyMetricTypes = {
  WEIGHT: "WEIGHT",
  HEIGHT: "HEIGHT",
  BIRTHDAY: "BIRTHDAY",
  GENDER: "GENDER",
  TIMEZONE: "TIMEZONE",
} as const;

export type BodyMetricType =
  (typeof BodyMetricTypes)[keyof typeof BodyMetricTypes];

export type UserBodyMetricRow = {
  id: string;
  effectiveDate: string;
  value: string;
  sourceInfo: TrainingSettingSourceInfo | null;
};

export type TrainingSettingSourceInfo = {
  changeSource?: "USER_MANUAL" | "SYSTEM_CALCULATED" | "SYSTEM_IMPORTED" | null;
  originProvider?: string | null;
  originExternalId?: string | null;
  originSyncedAt?: string | null;
};

/**
 * Get user profile
 */
export async function getUserProfile(sport?: SportType) {
  const params = new URLSearchParams();
  if (sport) params.append("sport", sport);
  return await apiFetch<UserProfile>(`/users/profile?${params.toString()}`);
}

/**
 * Update user profile
 */
export async function updateUserProfile(profile: Partial<UserProfile>) {
  return await apiFetch<UserProfile>("/users/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export async function getUserBodyMetrics(type: BodyMetricType) {
  const params = new URLSearchParams();
  params.append("type", type);
  return await apiFetch<UserBodyMetricRow[]>(
    `/users/body-metrics?${params.toString()}`,
  );
}

export async function replaceUserBodyMetrics(
  type: BodyMetricType,
  metrics: Array<{ effectiveDate: string; value: string }>,
) {
  const params = new URLSearchParams();
  params.append("type", type);
  return await apiFetch<boolean>(`/users/body-metrics?${params.toString()}`, {
    method: "PUT",
    body: JSON.stringify({ metrics }),
  });
}

/**
 * Calibrate VO2Max from activity
 */
export async function calibrateVo2max(
  activityId: string,
): Promise<number | undefined> {
  return await apiFetch("/users/profile/calibrate-vo2max", {
    method: "POST",
    body: JSON.stringify({ activityId }),
  });
}

export interface ZoneSetting {
  min: number;
  max: number;
  name: string;
  color?: string;
}

export enum BenchmarkType {
  FTP = "FTP",
  CP = "CP",
  CUSTOM = "CUSTOM",
  MHR = "MHR",
  HRR = "HRR",
  LTHR = "LTHR",
  CS = "CS",
  TP = "TP",
}

export type ZoneBenchmark = BenchmarkType;

export interface UserZoneSetting {
  sportType: string;
  zoneType: string;
  benchmark: ZoneBenchmark;
  benchmarkSource?: "PROFILE" | "ESTIMATED_MAX_HR" | "CUSTOM" | "UNKNOWN";
  zones: ZoneSetting[]; // Support both for migration
  changeSource?: TrainingSettingSourceInfo["changeSource"];
  originProvider?: string | null;
  originExternalId?: string | null;
  originSyncedAt?: string | null;
}

/**
 * Get all user zone settings
 */
export async function getAllUserZones() {
  return await apiFetch<UserZoneSetting[]>(`/users/zones`);
}

/**
 * Update user zone setting
 */
export async function updateUserZone(
  sportType: string,
  zoneType: string,
  benchmark: ZoneBenchmark,
  configuration: ZoneSetting[],
) {
  return await apiFetch<UserZoneSetting>("/users/zones", {
    method: "POST", // Using POST based on the controller implementation usually, but check if it's PUT or POST
    body: JSON.stringify({
      sportType,
      zoneType,
      benchmark,
      zones: configuration,
    }),
  });
}

// Auto-update configs
export type AutoUpdateConfig = {
  metric: "FTP" | "CP" | "W_PRIME" | "P_MAX" | "CS" | "TP" | "LTHR" | "MAX_HR";
  enabled: boolean;
};

export async function getAutoUpdateConfigs() {
  return await apiFetch<AutoUpdateConfig[]>("/users/auto-update-config");
}

export async function updateAutoUpdateConfig(
  metric: AutoUpdateConfig["metric"],
  enabled: boolean,
) {
  return await apiFetch<AutoUpdateConfig>("/users/auto-update-config", {
    method: "PUT",
    body: JSON.stringify({ metric, enabled }),
  });
}

export type MetricSource = "AUTO" | "ESTIMATED" | "MANUAL";

export type UserFitnessMetricType =
  | "FTP"
  | "CP"
  | "W_PRIME"
  | "P_MAX"
  | "MAX_HR"
  | "RESTING_HR"
  | "LTHR"
  | "AET_HR"
  | "CS"
  | "TP"
  | "AET_PACE"
  | "VO2_MAX";

export type UserFitnessMetricPairsResponse = {
  /**
   * 系统估算值（ESTIMATED）
   * CS/TP 后端已将 speed 转换为 paceSeconds，前端可直接展示
   */
  estimated: Partial<Record<UserFitnessMetricType, number | null>>;
  /**
   * 用户手动设置值（MANUAL）
   * CS/TP 后端已将 speed 转换为 paceSeconds，前端可直接展示
   */
  manual: Partial<Record<UserFitnessMetricType, number | null>>;
  /** 自动更新已采纳的值（AUTO），与系统估算值（ESTIMATED）是不同轨道 */
  automatic?: Partial<Record<UserFitnessMetricType, number | null>>;
  /** 按生效时间从 AUTO/MANUAL 中选出的当前值 */
  effective?: Partial<Record<UserFitnessMetricType, number | null>>;
  /** 当前生效值及其来源、日期；区间和负荷计算应以此为准 */
  effectiveDetails?: Partial<
    Record<
      UserFitnessMetricType,
      {
        value: number | null;
        source: "AUTO" | "MANUAL";
        recordedAt: string;
      } | null
    >
  >;
};

/**
 * 聚合获取当前用户的 FitnessMetric 配置（估算/手动）
 * 返回 ESTIMATED / MANUAL / AUTO 三条轨道以及实际生效值
 */
export function useUserFitnessMetricPairs(sportType: SportType) {
  return useQuery<UserFitnessMetricPairsResponse | null>({
    queryKey: queryKeys.user.fitnessMetricPairs(sportType),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("sportType", sportType);
      const res = await apiFetch<UserFitnessMetricPairsResponse>(
        `/users/fitness-metric-pairs?${params.toString()}`,
      );
      return res ?? null;
    },
  });
}

export type FitnessStatusUserMetricKey =
  | "ftp"
  | "cp"
  | "pMax"
  | "tp"
  | "cs"
  | "maxHr"
  | "restingHr"
  | "lthr";

export type FitnessStatusMetricPair = {
  estimated: Record<FitnessStatusUserMetricKey, number | null>;
  manual: Record<FitnessStatusUserMetricKey, number | null>;
};

/**
 * FitnessStatus 专用：返回已映射好的用户配置类指标（估算/手动）
 * 组件只需要直接消费 ftp/cp/pMax/tp/cs/maxHr/restingHr/lthr 这些字段即可
 */
export function useFitnessStatusMetricPair(sportType: SportType) {
  return useQuery<FitnessStatusMetricPair>({
    queryKey: queryKeys.user.fitnessStatusMetricPair(sportType),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("sportType", sportType);
      const res = (await apiFetch<UserFitnessMetricPairsResponse>(
        `/users/fitness-metric-pairs?${params.toString()}`,
      )) ?? { estimated: {}, manual: {} };

      const map = (type: UserFitnessMetricType) =>
        (res.estimated?.[type] ?? null) as number | null;
      const mapManual = (type: UserFitnessMetricType) =>
        (res.manual?.[type] ?? null) as number | null;

      return {
        estimated: {
          ftp: map("FTP"),
          cp: map("CP"),
          pMax: map("P_MAX"),
          tp: map("TP"),
          cs: map("CS"),
          maxHr: map("MAX_HR"),
          restingHr: map("RESTING_HR"),
          lthr: map("LTHR"),
        },
        manual: {
          ftp: mapManual("FTP"),
          cp: mapManual("CP"),
          pMax: mapManual("P_MAX"),
          tp: mapManual("TP"),
          cs: mapManual("CS"),
          maxHr: mapManual("MAX_HR"),
          restingHr: mapManual("RESTING_HR"),
          lthr: mapManual("LTHR"),
        },
      };
    },
  });
}

export type UserFitnessMetricDialogRow = {
  value: number;
  recordedAt: string;
  source: MetricSource;
  sport: SportType;
};

export type UserFitnessMetricDialogResponse = number | string | null;

function isPaceFitnessMetric(type: UserFitnessMetricType) {
  return type === "CS" || type === "TP";
}

function paceDistanceMeters(sportType?: SportType) {
  return sportType === "SWIM" ? 100 : 1000;
}

function normalizeFitnessMetricSportType(
  type: UserFitnessMetricType,
  sportType: SportType,
) {
  if (type === "VO2_MAX") return SportType.UNKNOWN;
  return sportType;
}

/**
 * 获取估算值
 * @param type
 * @param sportType
 * @returns
 */
export async function getUserEstimatedFitnessMetric(
  type: UserFitnessMetricType,
  sportType: SportType,
) {
  const normalizedSportType = normalizeFitnessMetricSportType(type, sportType);
  const params = new URLSearchParams();
  params.append("type", type);
  params.append("sportType", normalizedSportType);
  const raw = await apiFetch<UserFitnessMetricDialogResponse>(
    `/users/estimate-fitness-metric?${params.toString()}`,
  );
  if (raw === undefined) return null;
  if (!isPaceFitnessMetric(type)) return raw;

  const speed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(speed) || speed <= 0) return null;
  const distanceMeters = paceDistanceMeters(normalizedSportType);
  return Math.round(distanceMeters / speed);
}

export async function setUserFitnessMetric(payload: {
  type: UserFitnessMetricType;
  value: number;
  sportType?: SportType;
}) {
  return await apiFetch<boolean>("/users/fitness-metric", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type UserFitnessMetricHistoryRow = {
  id: string;
  recordedAt: string;
  effectiveDate: string;
  value: number;
  value2: number | null;
  source: MetricSource;
  editable: boolean;
  sourceInfo: TrainingSettingSourceInfo | null;
};

export async function getUserFitnessMetricEffectiveHistory(
  type: UserFitnessMetricType,
  sportType: SportType,
) {
  const normalizedSportType = normalizeFitnessMetricSportType(type, sportType);
  const params = new URLSearchParams();
  params.append("type", type);
  params.append("sportType", normalizedSportType);
  const res = await apiFetch<
    Array<{
      id?: string;
      recordedAt?: string;
      effectiveDate?: string;
      time?: string;
      value: number | string;
      value2?: number | string | null;
      source?: MetricSource;
      editable?: boolean;
      sourceInfo?: TrainingSettingSourceInfo | null;
    }>
  >(`/users/fitness-metrics?${params.toString()}`);
  if (res === undefined) return [];
  const rows = res
    .map((row, i) => {
      const recordedAt = row.recordedAt ?? row.time ?? "";
      const value = Number(row.value);
      const value2 =
        row.value2 === undefined || row.value2 === null
          ? null
          : (() => {
              const n = Number(row.value2);
              return Number.isFinite(n) ? n : null;
            })();
      if (!recordedAt || !Number.isFinite(value)) return null;
      return {
        id: row.id ?? `${recordedAt}-${i}`,
        recordedAt,
        effectiveDate: row.effectiveDate ?? recordedAt.slice(0, 10),
        value,
        value2,
        source: row.source ?? "MANUAL",
        editable: row.editable ?? row.source === "MANUAL",
        sourceInfo: row.sourceInfo ?? null,
      };
    })
    .filter((row): row is UserFitnessMetricHistoryRow => row !== null);
  if (!isPaceFitnessMetric(type)) return rows;

  const distanceMeters = paceDistanceMeters(normalizedSportType);
  return rows
    .map((row) => {
      const speed = row.value;
      if (!Number.isFinite(speed) || speed <= 0) return null;
      const paceSeconds = Math.round(distanceMeters / speed);
      if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) return null;
      return { ...row, value: paceSeconds };
    })
    .filter((row): row is UserFitnessMetricHistoryRow => row !== null);
}

export type UserFitnessMetricAutoRow = {
  id: string;
  recordedAt: string;
  value: number;
};

export async function getUserFitnessMetricAutoHistory(
  type: UserFitnessMetricType,
  sportType: SportType,
  range?: { startDate?: string; endDate?: string },
) {
  const normalizedSportType = normalizeFitnessMetricSportType(type, sportType);
  const params = new URLSearchParams();
  params.append("type", type);
  params.append("sportType", normalizedSportType);
  if (range?.startDate) params.append("startDate", range.startDate);
  if (range?.endDate) params.append("endDate", range.endDate);

  const res = await apiFetch<
    Array<{
      id?: string;
      recordedAt?: string;
      time?: string;
      value: number | string;
    }>
  >(`/users/fitness-metrics-auto?${params.toString()}`);
  if (res === undefined) return [];

  const rows: UserFitnessMetricAutoRow[] = res
    .map((row, i) => {
      const recordedAt = row.recordedAt ?? row.time ?? "";
      const value = Number(row.value);
      if (!recordedAt || !Number.isFinite(value)) return null;
      return {
        id: row.id ?? `${recordedAt}-${i}`,
        recordedAt,
        value,
      };
    })
    .filter((row): row is UserFitnessMetricAutoRow => row !== null);

  if (!isPaceFitnessMetric(type)) return rows;

  const distanceMeters = paceDistanceMeters(normalizedSportType);
  return rows
    .map((row) => {
      const speed = row.value;
      if (!Number.isFinite(speed) || speed <= 0) return null;
      const paceSeconds = Math.round(distanceMeters / speed);
      if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) return null;
      return { ...row, value: paceSeconds };
    })
    .filter((row): row is UserFitnessMetricAutoRow => row !== null);
}

export async function replaceUserFitnessMetricManualHistory(
  type: UserFitnessMetricType,
  metrics: Array<{ effectiveDate: string; value: string; value2?: string }>,
  sportType: SportType,
) {
  const normalizedSportType = normalizeFitnessMetricSportType(type, sportType);
  const params = new URLSearchParams();
  params.append("type", type);
  params.append("sportType", normalizedSportType);
  const nextMetrics = (() => {
    if (!isPaceFitnessMetric(type)) return metrics;
    const distanceMeters = paceDistanceMeters(normalizedSportType);
    return metrics.map((m) => {
      const paceSeconds = Number(m.value);
      const speed = distanceMeters / paceSeconds;
      return {
        ...m,
        value: String(Number(speed.toFixed(3))),
      };
    });
  })();
  return await apiFetch<boolean>(
    `/users/fitness-metrics?${params.toString()}`,
    {
      method: "PUT",
      body: JSON.stringify({ metrics: nextMetrics }),
    },
  );
}
/**
 * Reset user zone setting
 */
export async function resetUserZone(
  sportType: string,
  zoneType: string,
): Promise<void> {
  await apiFetch("/users/zones/reset", {
    method: "POST",
    body: JSON.stringify({ sportType, zoneType }),
  });
}

export type CriticalPowerHistory = {
  time: string;
  cp: number;
  ftp: number;
  status: number;
};

export async function getUserCriticalPowerHistory(
  sportType?: SportType,
  metric: "cp" | "ftp" = "cp",
) {
  const params = new URLSearchParams();
  if (sportType) {
    params.append("sportType", sportType);
  }
  params.append("metric", metric);
  return await apiFetch<CriticalPowerHistory[]>(
    `/users/cp?${params.toString()}`,
  );
}
