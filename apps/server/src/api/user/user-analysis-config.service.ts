import { Injectable } from '@nestjs/common';
import {
  $Enums,
  Prisma,
  UserFitnessMetricType,
  type UserAnalysisConfigVersion,
  type UserAutoUpdateConfigVersion,
} from '@prisma/client';
import { fitnessTimelineFingerprint } from '@/algorithm/fitness-timeline';
import { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';
import { parseLoadSourcesCsv, type LoadSource } from './composed-user-profile';
import { UserQueryService } from './user-query.service';

export type ResolvedAnalysisConfig = {
  versionId: string | null;
  version: number;
  effectiveAt: Date;
  fingerprint: string;
  loadSources: LoadSource[];
  altitudeOptimizationModel: $Enums.AltitudeOptimizationModel;
  altitudeThreshold: number | null;
  defaultVdotSource: $Enums.DefaultVdotSource;
  vo2maxCorrectionFactor: number | null;
  heartRateZoneModel: $Enums.HeartRateZoneModel;
  paceZoneModel: $Enums.PaceZoneModel;
  powerZoneModel: $Enums.PowerZoneModel;
};

const BASELINE_AT = new Date('1970-01-01T00:00:00.000Z');

function configPayload(row: {
  loadSources?: string | null;
  altitudeOptimizationModel?: $Enums.AltitudeOptimizationModel | null;
  altitudeThreshold?: number | null;
  defaultVdotSource?: $Enums.DefaultVdotSource | null;
  vo2maxCorrectionFactor?: number | null;
  heartRateZoneModel?: $Enums.HeartRateZoneModel | null;
  paceZoneModel?: $Enums.PaceZoneModel | null;
  powerZoneModel?: $Enums.PowerZoneModel | null;
}) {
  const loadSources = parseLoadSourcesCsv(row.loadSources);
  return {
    loadSources,
    altitudeOptimizationModel:
      row.altitudeOptimizationModel ??
      $Enums.AltitudeOptimizationModel.THRESHOLDMETHOD,
    altitudeThreshold: row.altitudeThreshold ?? null,
    defaultVdotSource: row.defaultVdotSource ?? $Enums.DefaultVdotSource.FACTOR,
    vo2maxCorrectionFactor: row.vo2maxCorrectionFactor ?? 1,
    heartRateZoneModel: row.heartRateZoneModel ?? $Enums.HeartRateZoneModel.MHR,
    paceZoneModel: row.paceZoneModel ?? $Enums.PaceZoneModel.DANIELS,
    powerZoneModel: row.powerZoneModel ?? $Enums.PowerZoneModel.FRIEL,
  };
}

export function autoUpdateEnabledAt(
  versions: readonly Pick<
    UserAutoUpdateConfigVersion,
    'metric' | 'enabled' | 'effectiveAt' | 'version'
  >[],
  metric: UserFitnessMetricType,
  at: Date,
) {
  const match = versions
    .filter((row) => row.metric === metric && row.effectiveAt <= at)
    .sort(
      (left, right) =>
        right.effectiveAt.getTime() - left.effectiveAt.getTime() ||
        right.version - left.version,
    )[0];
  return match?.enabled ?? true;
}

@Injectable()
export class UserAnalysisConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserQueryService,
  ) {}

  private client(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async resolveAt(
    userId: string,
    at: Date,
    tx?: PrismaTx,
  ): Promise<ResolvedAnalysisConfig> {
    const client = this.client(tx);
    const row = await client.userAnalysisConfigVersion.findFirst({
      where: { userId, effectiveAt: { lte: at } },
      orderBy: [{ effectiveAt: 'desc' }, { version: 'desc' }],
    });
    if (row) return this.toResolved(row);

    // Existing users receive an epoch baseline in the migration. A user born
    // after that migration can legitimately have no version before their
    // first setting change; in that case the historical value is the product
    // default, never today's mutable UserProfile row. Falling back to the
    // current profile here would silently rewrite old activity semantics.
    const payload = configPayload({});
    return {
      versionId: null,
      version: 0,
      effectiveAt: BASELINE_AT,
      fingerprint: fitnessTimelineFingerprint(payload),
      ...payload,
    };
  }

  listVersions(userId: string, effectiveTo: Date, tx?: PrismaTx) {
    return this.client(tx).userAnalysisConfigVersion.findMany({
      where: { userId, effectiveAt: { lte: effectiveTo } },
      orderBy: [{ effectiveAt: 'asc' }, { version: 'asc' }],
    });
  }

  resolveFromVersions(
    versions: readonly UserAnalysisConfigVersion[],
    at: Date,
  ): ResolvedAnalysisConfig | null {
    const row = [...versions]
      .reverse()
      .find((candidate) => candidate.effectiveAt <= at);
    return row ? this.toResolved(row) : null;
  }

  /**
   * Resolve from an already-prefetched version list without falling back to
   * today's mutable profile. This is used by bounded replay aggregation where
   * issuing one query per historical activity would be prohibitively costly.
   */
  resolveFromVersionsOrDefault(
    versions: readonly UserAnalysisConfigVersion[],
    at: Date,
  ): ResolvedAnalysisConfig {
    const resolved = this.resolveFromVersions(versions, at);
    if (resolved) return resolved;
    const payload = configPayload({});
    return {
      versionId: null,
      version: 0,
      effectiveAt: BASELINE_AT,
      fingerprint: fitnessTimelineFingerprint(payload),
      ...payload,
    };
  }

  async recordCurrentVersion(args: {
    userId: string;
    effectiveAt: Date;
    source: string;
    tx: Prisma.TransactionClient;
  }) {
    const profile = await this.users.profiles(args.tx).findUnique({
      where: { userId: args.userId },
    });
    const payload = configPayload(profile ?? {});
    const latest = await args.tx.userAnalysisConfigVersion.findFirst({
      where: { userId: args.userId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return args.tx.userAnalysisConfigVersion.create({
      data: {
        userId: args.userId,
        version: (latest?.version ?? 0) + 1,
        effectiveAt: args.effectiveAt,
        source: args.source,
        fingerprint: fitnessTimelineFingerprint(payload),
        loadSources: payload.loadSources.join(','),
        altitudeOptimizationModel: payload.altitudeOptimizationModel,
        altitudeThreshold: payload.altitudeThreshold,
        defaultVdotSource: payload.defaultVdotSource,
        vo2maxCorrectionFactor: payload.vo2maxCorrectionFactor,
        heartRateZoneModel: payload.heartRateZoneModel,
        paceZoneModel: payload.paceZoneModel,
        powerZoneModel: payload.powerZoneModel,
      },
    });
  }

  async listAutoUpdateVersions(
    userId: string,
    effectiveTo: Date,
    tx?: PrismaTx,
  ) {
    return this.client(tx).userAutoUpdateConfigVersion.findMany({
      where: { userId, effectiveAt: { lte: effectiveTo } },
      orderBy: [{ metric: 'asc' }, { effectiveAt: 'asc' }, { version: 'asc' }],
    });
  }

  async resolveAutoUpdateAt(
    userId: string,
    metric: UserFitnessMetricType,
    at: Date,
    tx?: PrismaTx,
  ) {
    const row = await this.client(tx).userAutoUpdateConfigVersion.findFirst({
      where: { userId, metric, effectiveAt: { lte: at } },
      orderBy: [{ effectiveAt: 'desc' }, { version: 'desc' }],
      select: { enabled: true },
    });
    if (row) return row.enabled;
    return true;
  }

  async recordAutoUpdateVersion(args: {
    userId: string;
    metric: UserFitnessMetricType;
    enabled: boolean;
    effectiveAt: Date;
    source: string;
    tx: Prisma.TransactionClient;
  }) {
    const latest = await args.tx.userAutoUpdateConfigVersion.findFirst({
      where: { userId: args.userId, metric: args.metric },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return args.tx.userAutoUpdateConfigVersion.create({
      data: {
        userId: args.userId,
        metric: args.metric,
        enabled: args.enabled,
        version: (latest?.version ?? 0) + 1,
        effectiveAt: args.effectiveAt,
        source: args.source,
        fingerprint: fitnessTimelineFingerprint({
          metric: args.metric,
          enabled: args.enabled,
        }),
      },
    });
  }

  private toResolved(row: UserAnalysisConfigVersion): ResolvedAnalysisConfig {
    return {
      versionId: row.id,
      version: row.version,
      effectiveAt: row.effectiveAt,
      fingerprint: row.fingerprint,
      ...configPayload(row),
    };
  }
}
