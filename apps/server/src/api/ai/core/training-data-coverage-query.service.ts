import { Injectable } from '@nestjs/common';
import { ImportBatchJobStatus, ImportSourceKind } from '@prisma/client';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { ImportingJobService } from '@/importing/importing-job.service';
import { ExternalProviderStatusQueryService } from '@/integrations/external-provider/external-provider-status-query.service';

const ACTIVE_IMPORT_BATCH_STATUSES: ImportBatchJobStatus[] = [
  ImportBatchJobStatus.QUEUED,
  ImportBatchJobStatus.RUNNING,
  ImportBatchJobStatus.POST_PROCESSING,
];

export type TrainingDataCoverageSnapshot = {
  kind: 'training_data_coverage';
  asOf: string;
  window: { days: number; since: string };
  availableActivityImportMethods: {
    fileUpload: {
      enabled: true;
      formats: ['FIT', 'TCX', 'GPX'];
    };
    providers: Array<{
      provider: string;
      enabled: boolean;
      connected: boolean;
      connectionState: string;
      activityImportState: string;
    }>;
  };
  activities: Awaited<ReturnType<ActivityReadService['dataCoverageSince']>>;
  imports: {
    activeBatchCount: number;
    recentBatches: Array<{
      id: string;
      sourceKind: ImportSourceKind;
      status: ImportBatchJobStatus;
      totalCount: number;
      successCount: number;
      failedCount: number;
      skippedCount: number;
      createdAt: string;
      completedAt: string | null;
    }>;
  };
  integrations: Awaited<
    ReturnType<ExternalProviderStatusQueryService['listForUser']>
  >;
  signals: {
    hasConnectedActivityImport: boolean;
    hasAutomaticActivityImport: boolean;
    hasRecentFileImport: boolean;
    syncInProgress: boolean;
    syncError: boolean;
    activityProcessingPending: boolean;
  };
};

export type ActivityEvidenceSnapshot = {
  kind: 'activity_evidence';
  asOf: string;
  window: { days: number; since: string };
  activities: Awaited<ReturnType<ActivityReadService['dataCoverageSince']>>;
};

/**
 * Keep the Agent-facing result focused on evidence used to diagnose missing
 * training data. Product capability matrices and provider settings belong to
 * integration.status and must not inflate every coverage result.
 */
export function toAgentTrainingDataCoverageSnapshot(
  snapshot: TrainingDataCoverageSnapshot,
) {
  return {
    kind: snapshot.kind,
    asOf: snapshot.asOf,
    window: snapshot.window,
    availableActivityImportMethods: snapshot.availableActivityImportMethods,
    activities: snapshot.activities,
    imports: {
      activeBatchCount: snapshot.imports.activeBatchCount,
      recentBatches: snapshot.imports.recentBatches.map((batch) => ({
        sourceKind: batch.sourceKind,
        status: batch.status,
        totalCount: batch.totalCount,
        successCount: batch.successCount,
        failedCount: batch.failedCount,
        skippedCount: batch.skippedCount,
        createdAt: batch.createdAt,
        completedAt: batch.completedAt,
      })),
    },
    integrations: snapshot.integrations.map((integration) => ({
      provider: integration.provider,
      enabled: integration.enabled,
      connected: integration.connected,
      connectionState: integration.connectionState,
      activityImportState:
        integration.operations.completedActivities.import.state,
    })),
    signals: snapshot.signals,
  };
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class TrainingDataCoverageQueryService {
  constructor(
    private readonly activities: ActivityReadService,
    private readonly importJobs: ImportingJobService,
    private readonly integrations: ExternalProviderStatusQueryService,
  ) {}

  /**
   * Lightweight evidence for the always-present coaching context. This query
   * deliberately does not inspect provider connections or import jobs.
   */
  async activityEvidence(input: {
    userId: string;
    windowDays?: number;
    now?: Date;
  }): Promise<ActivityEvidenceSnapshot> {
    const now = input.now ?? new Date();
    const windowDays = Math.min(
      90,
      Math.max(7, Math.trunc(input.windowDays ?? 30)),
    );
    const since = new Date(now.getTime() - windowDays * 86_400_000);
    const activities = await this.activities.dataCoverageSince(
      input.userId,
      since,
    );
    return {
      kind: 'activity_evidence',
      asOf: now.toISOString(),
      window: { days: windowDays, since: since.toISOString() },
      activities,
    };
  }

  async snapshot(input: {
    userId: string;
    windowDays?: number;
    now?: Date;
  }): Promise<TrainingDataCoverageSnapshot> {
    const now = input.now ?? new Date();
    const windowDays = Math.min(
      90,
      Math.max(7, Math.trunc(input.windowDays ?? 35)),
    );
    const since = new Date(now.getTime() - windowDays * 86_400_000);
    const [activities, recentBatches, integrations] = await Promise.all([
      this.activities.dataCoverageSince(input.userId, since),
      this.importJobs.batchJobs().findMany({
        where: { userId: input.userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          sourceKind: true,
          status: true,
          totalCount: true,
          successCount: true,
          failedCount: true,
          skippedCount: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      this.integrations.listForUser(input.userId),
    ]);

    const activityImports = integrations.filter(
      (status) =>
        status.operations.completedActivities.import.state !== 'UNSUPPORTED' &&
        status.operations.completedActivities.import.state !==
          'INTEGRATION_DISABLED',
    );
    const syncInProgress = activityImports.some((status) => {
      const startedAt = toDate(status.sync.startedAt);
      const completedAt = toDate(status.sync.completedAt);
      return Boolean(
        startedAt &&
        (!completedAt || startedAt.getTime() > completedAt.getTime()),
      );
    });

    return {
      kind: 'training_data_coverage',
      asOf: now.toISOString(),
      window: { days: windowDays, since: since.toISOString() },
      availableActivityImportMethods: {
        fileUpload: {
          enabled: true,
          formats: ['FIT', 'TCX', 'GPX'],
        },
        providers: activityImports.map((status) => ({
          provider: status.provider,
          enabled: status.enabled,
          connected: status.connected,
          connectionState: status.connectionState,
          activityImportState:
            status.operations.completedActivities.import.state,
        })),
      },
      activities,
      imports: {
        activeBatchCount: recentBatches.filter((batch) =>
          ACTIVE_IMPORT_BATCH_STATUSES.includes(batch.status),
        ).length,
        recentBatches: recentBatches.map((batch) => ({
          ...batch,
          sourceKind: batch.sourceKind,
          createdAt: batch.createdAt.toISOString(),
          completedAt: batch.completedAt?.toISOString() ?? null,
        })),
      },
      integrations,
      signals: {
        hasConnectedActivityImport: activityImports.some(
          (status) => status.connected,
        ),
        hasAutomaticActivityImport: activityImports.some(
          (status) =>
            status.operations.completedActivities.import.state ===
            'AUTOMATIC_ENABLED',
        ),
        hasRecentFileImport: recentBatches.some(
          (batch) =>
            batch.sourceKind === ImportSourceKind.FILE &&
            batch.createdAt.getTime() >= since.getTime(),
        ),
        syncInProgress,
        syncError: activityImports.some((status) =>
          Boolean(status.sync.lastError),
        ),
        activityProcessingPending: activities.processing.some(
          (row) => row.count > 0,
        ),
      },
    };
  }
}
