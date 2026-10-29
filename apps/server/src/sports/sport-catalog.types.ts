export type SportFamily = 'RUN' | 'CYCLING' | 'SWIM' | 'STRETCHING' | 'UNKNOWN';
export type SportMappingDirection = 'IMPORT' | 'EXPORT' | 'BOTH';
export type WorkoutStructureKind = 'ENDURANCE' | 'STRENGTH' | 'FREEFORM';

export const DEFAULT_SPORT_DEFINITION_BY_FAMILY: Record<SportFamily, string> = {
  RUN: 'ROAD_RUNNING',
  CYCLING: 'ROAD_CYCLING',
  SWIM: 'POOL_SWIMMING',
  STRETCHING: 'STRETCHING',
  UNKNOWN: 'OTHER',
};

export function defaultSportDefinitionCode(family: SportFamily) {
  return DEFAULT_SPORT_DEFINITION_BY_FAMILY[family] ?? 'OTHER';
}

/**
 * 将计划写入中的运动小类规范成目录 code。
 *
 * 历史调用方和 AI 偶尔会把 family（例如 RUN）误填进
 * sportDefinitionCode。family 不是 t_sport_definition 的主键，直接写入会触发
 * 外键错误；这种无损、含义明确的输入在边界统一转换成该 family 的默认小类。
 */
export function normalizeSportDefinitionCode(
  family: SportFamily,
  code?: string | null,
) {
  const normalized = code
    ?.trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
  if (!normalized || normalized === family) {
    return defaultSportDefinitionCode(family);
  }
  return normalized;
}

/**
 * API 使用 subSportType，数据库模型仍使用 sportDefinitionCode。
 * 所有需要精确运动语义的同步/导出路径都通过这里统一取值。
 */
export function exactSportCode(value?: {
  subSportType?: string | null;
  sportDefinitionCode?: string | null;
} | null) {
  const code = value?.subSportType ?? value?.sportDefinitionCode;
  return typeof code === 'string' && code.trim() ? code.trim() : undefined;
}

export type SportDefinitionRecord = {
  code: string;
  family: SportFamily;
  displayName: string;
  description?: string | null;
  zoneFamily?: SportFamily | null;
  paceBasisMeters?: number | null;
  cadenceUnit?: 'SPM' | 'RPM' | null;
  fitSport?: string | null;
  fitSubSport?: string | null;
  isDefaultForFamily: boolean;
  supportsPlanning: boolean;
  supportsStructuredWorkout: boolean;
  defaultWorkoutStructureKind?: WorkoutStructureKind | null;
  supportsDistance: boolean;
  supportsPace: boolean;
  supportsSpeed: boolean;
  supportsPower: boolean;
  supportsCadence: boolean;
  sortOrder: number;
  active: boolean;
  metadata?: unknown;
};

export type ProviderSportResolution = {
  sport: SportDefinitionRecord;
  externalCode: string;
  externalSubCode: string;
  exact: boolean;
  metadata?: unknown;
};
