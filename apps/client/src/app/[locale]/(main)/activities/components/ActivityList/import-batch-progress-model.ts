import {
  ActivityProcessingStatus,
  isTerminalImportBatchStatus,
  isTerminalPostProcessStatus,
  type ImportBatchItem,
  type ImportBatchSummary,
  type ImportItemJobStatus,
} from "@/api/activities";

const ACTIVITY_PROCESSING_STATUSES = new Set<string>(
  Object.values(ActivityProcessingStatus),
);

/** Never render persisted worker diagnostics, including responses from old servers. */
export function hasImportItemFailure(item: ImportBatchItem): boolean {
  return item.status === "FAILED" || item.status === "DEAD";
}

export type ImportItemDisplayStatus =
  | { kind: "item"; status: ImportItemJobStatus }
  | { kind: "activity"; status: ActivityProcessingStatus };

export type ImportBatchActivityProgress = {
  ready: number;
  processing: number;
  failed: number;
  settled: number;
  total: number;
  hasActivityBreakdown: boolean;
};

export function resolveImportItemDisplayStatus(
  item: ImportBatchItem,
): ImportItemDisplayStatus {
  if (item.status !== "DONE") {
    return { kind: "item", status: item.status };
  }

  if (item.activity?.readyAt) {
    return { kind: "activity", status: ActivityProcessingStatus.READY };
  }

  const activityStatus = item.activity?.processingStatus?.toUpperCase();
  if (activityStatus && ACTIVITY_PROCESSING_STATUSES.has(activityStatus)) {
    return {
      kind: "activity",
      status: activityStatus as ActivityProcessingStatus,
    };
  }

  return { kind: "item", status: item.status };
}

export function getImportBatchActivityProgress(
  batch: ImportBatchSummary | undefined,
): ImportBatchActivityProgress {
  if (!batch) {
    return {
      ready: 0,
      processing: 0,
      failed: 0,
      settled: 0,
      total: 0,
      hasActivityBreakdown: false,
    };
  }

  const ready = batch.counts?.readyActivities;
  const processing = batch.counts?.processingActivities;
  const failed = batch.counts?.analysisFailedActivities;
  const hasActivityBreakdown =
    typeof ready === "number" &&
    typeof processing === "number" &&
    typeof failed === "number";

  if (!hasActivityBreakdown) {
    const settled = batch.successCount + batch.failedCount + batch.skippedCount;
    return {
      ready: batch.successCount,
      processing: Math.max(0, batch.totalCount - settled),
      failed: batch.failedCount,
      settled,
      total: batch.totalCount,
      hasActivityBreakdown: false,
    };
  }

  const analysisReady = Math.max(0, ready);
  const analysisProcessing = Math.max(0, processing);
  const analysisFailed = Math.max(0, failed);
  const totalFailed = batch.failedCount + analysisFailed;
  const settled = analysisReady + totalFailed + Math.max(0, batch.skippedCount);

  return {
    ready: analysisReady,
    processing: analysisProcessing,
    failed: totalFailed,
    settled: Math.min(batch.totalCount, settled),
    total: batch.totalCount,
    hasActivityBreakdown: true,
  };
}

export function isImportPipelineSettled(batch: ImportBatchSummary | undefined) {
  if (!batch || !isTerminalImportBatchStatus(batch.status)) return false;

  const needsPostProcess = batch.successCount > 0;
  if (
    needsPostProcess &&
    (!batch.postProcessJob ||
      !isTerminalPostProcessStatus(batch.postProcessJob.status))
  ) {
    return false;
  }

  const progress = getImportBatchActivityProgress(batch);
  return !progress.hasActivityBreakdown || progress.processing === 0;
}

export function isImportPipelineSuccessful(
  batch: ImportBatchSummary | undefined,
) {
  if (!batch || !isImportPipelineSettled(batch)) return false;

  const progress = getImportBatchActivityProgress(batch);
  return (
    batch.status === "COMPLETED" &&
    (!batch.postProcessJob || batch.postProcessJob.status === "COMPLETED") &&
    progress.failed === 0 &&
    progress.settled === progress.total
  );
}
