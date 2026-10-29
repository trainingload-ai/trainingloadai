import type { Prisma } from '@prisma/client';
import type { IntervalsIcuAuthType } from './intervals-icu-credential.service';
import type { IntervalsIcuAthleteProfile } from './intervals-icu.client';

/** connection.metadata.planSync：计划课双向开关与最近一次同步审计。 */
export type IntervalsIcuPlanSyncMetadata = {
  syncPlannedWorkouts?: boolean;
  exportPlannedWorkouts?: boolean;
  lastStartedAt?: string | null;
  lastCompletedAt?: string | null;
  lastWindow?: { oldest?: string; newest?: string } | null;
  lastResult?: unknown;
  lastError?: string | null;
};

/** OAuth 连接时写入 metadata.oauth 的运动员摘要。 */
export type IntervalsIcuOAuthAthleteMetadata = {
  id?: string | number;
  name?: string | null;
};

/** OAuth 授权信息（可与 API Key 连接互斥，换 key 时置 null）。 */
export type IntervalsIcuOAuthMetadata = {
  tokenType?: string;
  grantedScopes?: string[];
  /** 旧字段兼容：个别路径曾写 scope 字符串。 */
  scope?: string | string[];
  athlete?: IntervalsIcuOAuthAthleteMetadata | null;
  authorizedAt?: string;
};

/**
 * Intervals.icu 的 ExternalProviderConnection.metadata 形状。
 * Prisma Json 无结构，读写统一经 {@link asIntervalsIcuMetadata} 收窄。
 */
export type IntervalsIcuConnectionMetadata = {
  authType?: IntervalsIcuAuthType;
  athleteIdMode?: string;
  profile?: IntervalsIcuAthleteProfile;
  oauth?: IntervalsIcuOAuthMetadata | null;
  planSync?: IntervalsIcuPlanSyncMetadata;
  /** wellness 拉取窗口与最近一次结果审计。 */
  wellnessSync?: {
    lastStartedAt?: string | null;
    lastCompletedAt?: string | null;
    lastWindow?: { oldest?: string; newest?: string } | null;
    lastResult?: unknown;
  };
  lastExportedAt?: string;
  lastExportedCount?: number;
};

/** 只要能读 metadata 的 connection 引用。 */
export type IntervalsIcuConnectionMetadataSource = {
  metadata?: unknown;
} | null;

/** 未知 Json → 结构化 metadata；非法值回空对象。 */
export function asIntervalsIcuMetadata(
  value: unknown,
): IntervalsIcuConnectionMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as IntervalsIcuConnectionMetadata;
}

/** 从 connection 行读取 metadata。 */
export function intervalsIcuMetadataOf(
  connection: IntervalsIcuConnectionMetadataSource,
): IntervalsIcuConnectionMetadata {
  return asIntervalsIcuMetadata(connection?.metadata);
}

/** 读取 planSync 子对象（缺省 `{}`）。 */
export function intervalsIcuPlanSyncOf(
  connectionOrMetadata:
    | IntervalsIcuConnectionMetadataSource
    | IntervalsIcuConnectionMetadata
    | unknown,
): IntervalsIcuPlanSyncMetadata {
  if (
    connectionOrMetadata &&
    typeof connectionOrMetadata === 'object' &&
    'metadata' in (connectionOrMetadata as object)
  ) {
    const planSync = intervalsIcuMetadataOf(
      connectionOrMetadata as IntervalsIcuConnectionMetadataSource,
    ).planSync;
    return planSync && typeof planSync === 'object' ? planSync : {};
  }
  const metadata = asIntervalsIcuMetadata(connectionOrMetadata);
  return metadata.planSync && typeof metadata.planSync === 'object'
    ? metadata.planSync
    : {};
}

/** 写回 Prisma Json 字段时用（避免散落未校验断言）。 */
export function intervalsIcuMetadataJson(
  metadata: IntervalsIcuConnectionMetadata,
): Prisma.InputJsonValue {
  return metadata as Prisma.InputJsonValue;
}
