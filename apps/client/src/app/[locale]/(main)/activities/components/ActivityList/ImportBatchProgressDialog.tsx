"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock3,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import { cn } from "@/lib/utils";
import {
  ActivityProcessingStatus,
  fetchImportBatch,
  fetchImportBatchItems,
  isTerminalImportBatchStatus,
  isTerminalPostProcessStatus,
  type ImportBatchJobStatus,
  type ImportBatchSummary,
  type ImportItemJobStatus,
  type UserPostProcessJobStatus,
} from "@/api/activities";
import { queryKeys } from "@/lib/query-keys";
import { invalidateAfterActivityPipelineComplete } from "@/lib/query-invalidation";
import { trackCompletedImportBatch } from "@deployment/managed-ui";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

const RECENT_IMPORT_BATCH_STORAGE_KEY = "recent-import-batch-ids";
const RECENT_IMPORT_BATCHES_UPDATED_EVENT = "recent-import-batches-updated";
const MAX_RECENT_IMPORT_BATCHES = 5;

const BATCH_STATUS_LABEL_KEYS: Record<ImportBatchJobStatus, string> = {
  QUEUED: "importProgress.status.batchQueued",
  RUNNING: "importProgress.status.batchRunning",
  COMPLETED: "importProgress.status.batchCompleted",
  PARTIAL_FAILED: "importProgress.status.batchPartialFailed",
  FAILED: "importProgress.status.batchFailed",
  CANCELLED: "importProgress.status.batchCancelled",
};

const ITEM_STATUS_LABEL_KEYS: Record<ImportItemJobStatus, string> = {
  QUEUED: "importProgress.status.itemQueued",
  NORMALIZING: "importProgress.status.itemNormalizing",
  MATERIALIZING: "importProgress.status.itemMaterializing",
  PARQUET_BUILDING: "importProgress.status.itemParquetBuilding",
  DONE: "importProgress.status.itemDone",
  SKIPPED: "importProgress.status.itemSkipped",
  FAILED: "importProgress.status.itemFailed",
  DEAD: "importProgress.status.itemDead",
};

const POST_PROCESS_STATUS_LABEL_KEYS: Record<UserPostProcessJobStatus, string> =
  {
    PENDING: "importProgress.status.postPending",
    RUNNING: "importProgress.status.postRunning",
    COMPLETED: "importProgress.status.postCompleted",
    FAILED: "importProgress.status.postFailed",
    DEAD: "importProgress.status.postDead",
  };

const ACTIVITY_PROCESSING_STATUS_LABEL_KEYS: Record<
  ActivityProcessingStatus,
  string
> = {
  RECEIVED: "importProgress.activityProcessingStatus.received",
  NORMALIZED: "importProgress.activityProcessingStatus.normalized",
  DEDUPED: "importProgress.activityProcessingStatus.deduped",
  MATERIALIZED: "importProgress.activityProcessingStatus.materialized",
  PARQUET_READY: "importProgress.activityProcessingStatus.parquetReady",
  ANALYZING: "importProgress.activityProcessingStatus.analyzing",
  READY: "importProgress.activityProcessingStatus.ready",
  PARTIAL_FAILED: "importProgress.activityProcessingStatus.partialFailed",
  FAILED: "importProgress.activityProcessingStatus.failed",
};

function readRecentImportBatchIds(): string[] {
  // 仅保留最近几个批次 id，用于用户离开上传弹窗后仍能回到进度视图。
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(RECENT_IMPORT_BATCH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentImportBatchIds(batchIds: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    RECENT_IMPORT_BATCH_STORAGE_KEY,
    JSON.stringify(batchIds.slice(0, MAX_RECENT_IMPORT_BATCHES)),
  );
  window.dispatchEvent(new Event(RECENT_IMPORT_BATCHES_UPDATED_EVENT));
}

export function rememberRecentImportBatchId(batchId: string) {
  const current = readRecentImportBatchIds().filter(
    (value) => value !== batchId,
  );
  writeRecentImportBatchIds([batchId, ...current]);
}

export function getLatestRecentImportBatchId() {
  return readRecentImportBatchIds()[0] ?? null;
}

export function ImportBatchProgressDialog({
  open,
  onOpenChange,
  batchId,
  onOverallDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string | null;
  onOverallDone?: (batchId: string) => void;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations("activities");
  const tActivityTitle = useTranslations("ActivityTitle");
  const settledBatchIdRef = useRef<string | null>(null);
  const analyticsBatchIdRef = useRef<string | null>(null);
  const batchQuery = useQuery({
    queryKey: queryKeys.import.batch(batchId),
    queryFn: () => fetchImportBatch(batchId!),
    // 即使进度弹窗关闭，也要继续轮询到“批次 + 用户后处理”都结束，
    // 否则首页/PMC 等依赖数据不会在真正完成时刷新。
    enabled: !!batchId,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      // 批次完成后仍可能有用户级后处理（PMC/体能指标/通知），两段都结束才停止轮询。
      const batch = query.state.data as ImportBatchSummary | undefined;
      if (!batchId) return false;
      if (!batch) return 2000;

      const batchDone = isTerminalImportBatchStatus(batch.status);
      const needsPostProcess = batch.successCount > 0;
      const postDone =
        !needsPostProcess ||
        (batch.postProcessJob != null &&
          isTerminalPostProcessStatus(batch.postProcessJob.status));

      return batchDone && postDone ? false : 2000;
    },
  });

  const batch = batchQuery.data;
  const completedCount =
    (batch?.successCount ?? 0) +
    (batch?.failedCount ?? 0) +
    (batch?.skippedCount ?? 0);
  const progressPercent = batch?.totalCount
    ? Math.min(100, Math.round((completedCount / batch.totalCount) * 100))
    : 0;
  const batchDone = batch ? isTerminalImportBatchStatus(batch.status) : false;
  const needsPostProcess = (batch?.successCount ?? 0) > 0;
  const postProcessDone =
    !needsPostProcess ||
    (batch?.postProcessJob != null &&
      isTerminalPostProcessStatus(batch.postProcessJob.status));
  const overallDone = batchDone && postProcessDone;

  const itemsQuery = useQuery({
    queryKey: queryKeys.import.batchItems(batchId),
    queryFn: () => fetchImportBatchItems(batchId!),
    enabled: !!batchId && open,
    refetchOnWindowFocus: false,
    refetchInterval: batchId && open && !overallDone ? 3000 : false,
  });

  useEffect(() => {
    // 首次观察到整体完成时刷新依赖导入结果的页面数据，避免列表仍显示旧活动状态。
    if (!batchId || !overallDone) return;
    if (settledBatchIdRef.current === batchId) return;

    settledBatchIdRef.current = batchId;

    void invalidateAfterActivityPipelineComplete(queryClient, { batchId });
    onOverallDone?.(batchId);
  }, [batchId, onOverallDone, overallDone, queryClient]);

  const visibleItems = useMemo(
    () => itemsQuery.data?.items ?? [],
    [itemsQuery.data?.items],
  );

  useEffect(() => {
    if (!batchId || !batch || !overallDone || batch.successCount <= 0) return;
    if (open && itemsQuery.isLoading) return;
    if (analyticsBatchIdRef.current === batchId) return;

    analyticsBatchIdRef.current = batchId;
    trackCompletedImportBatch(batch, visibleItems);
  }, [batch, batchId, itemsQuery.isLoading, open, overallDone, visibleItems]);

  const getBatchStatusLabel = (status?: ImportBatchSummary["status"]) => {
    if (!status) return "-";
    return t(
      BATCH_STATUS_LABEL_KEYS[status] ?? "importProgress.status.batchQueued",
    );
  };

  const getItemStatusLabel = (status?: ImportItemJobStatus) => {
    if (!status) return "-";
    return t(
      ITEM_STATUS_LABEL_KEYS[status] ?? "importProgress.status.itemQueued",
    );
  };

  const getPostProcessStatusLabel = (
    status?: NonNullable<ImportBatchSummary["postProcessJob"]>["status"],
  ) => {
    if (!status) return t("importProgress.status.postWaiting");
    return t(
      POST_PROCESS_STATUS_LABEL_KEYS[status] ??
        "importProgress.status.postWaiting",
    );
  };

  const getActivityProcessingStatusLabel = (status?: string) => {
    if (!status) return t("importProgress.activityProcessingStatus.unknown");
    const key =
      ACTIVITY_PROCESSING_STATUS_LABEL_KEYS[status as ActivityProcessingStatus];
    return key ? t(key) : t("importProgress.activityProcessingStatus.unknown");
  };

  const getStatusTone = (status?: string) => {
    if (!status) return "bg-muted text-muted-foreground";
    if (
      status === "FAILED" ||
      status === "DEAD" ||
      status === "PARTIAL_FAILED" ||
      status === "CANCELLED"
    ) {
      return "bg-[hsl(var(--red-100))] text-[hsl(var(--red-700))] dark:bg-[hsl(var(--red-950)/0.4)] dark:text-[hsl(var(--red-300))]";
    }
    if (status === "DONE" || status === "COMPLETED") {
      return "bg-[hsl(var(--emerald-100))] text-[hsl(var(--emerald-700))] dark:bg-[hsl(var(--emerald-950)/0.4)] dark:text-[hsl(var(--emerald-300))]";
    }
    if (status === "SKIPPED") {
      return "bg-[hsl(var(--yellow-100))] text-[hsl(var(--yellow-700))] dark:bg-[hsl(var(--yellow-950)/0.4)] dark:text-[hsl(var(--yellow-300))]";
    }
    return "bg-[hsl(var(--blue-100))] text-[hsl(var(--blue-700))] dark:bg-[hsl(var(--blue-950)/0.4)] dark:text-[hsl(var(--blue-300))]";
  };

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        className="flex max-h-[96dvh] flex-col overflow-hidden"
        desktopClassName="sm:max-w-[640px]"
      >
        <AdaptiveDialogHeader className="shrink-0">
          <AdaptiveDialogTitle>
            {overallDone
              ? t("importProgress.completedTitle")
              : t("importProgress.title")}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            {overallDone
              ? t("importProgress.completedDescription")
              : t("importProgress.description")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
          <div className="rounded-md border bg-neutral-100 dark:bg-muted/45 p-4">
            <div className="flex items-start gap-3">
              {overallDone ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-[hsl(var(--emerald-600))]" />
              ) : (
                <BellRing className="mt-0.5 h-5 w-5 text-[hsl(var(--blue-600))]" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {overallDone
                    ? t("importProgress.doneHint")
                    : t("importProgress.laterHint")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("importProgress.notificationHint")}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {t("importProgress.progressLabel")}
              </span>
              <span className="text-muted-foreground">
                {completedCount}/{batch?.totalCount ?? 0} ({progressPercent}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[hsl(var(--emerald-500))] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border p-3">
              <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                {t("importProgress.total")}
              </div>
              <div className="mt-1 text-lg font-semibold">
                {batch?.totalCount ?? 0}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                {t("importProgress.success")}
              </div>
              <div className="mt-1 text-lg font-semibold text-[hsl(var(--emerald-600))]">
                {batch?.successCount ?? 0}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                {t("importProgress.failed")}
              </div>
              <div className="mt-1 text-lg font-semibold text-[hsl(var(--red-600))]">
                {batch?.failedCount ?? 0}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                {t("importProgress.skipped")}
              </div>
              <div className="mt-1 text-lg font-semibold text-[hsl(var(--yellow-600))]">
                {batch?.skippedCount ?? 0}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                {t("importProgress.batchStatus")}
              </div>
              <div className="mt-2">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-1 text-mobile-caption pc:text-xs font-medium",
                    getStatusTone(batch?.status),
                  )}
                >
                  {getBatchStatusLabel(batch?.status)}
                </span>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                {t("importProgress.postProcessStatus")}
              </div>
              <div className="mt-2">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-1 text-mobile-caption pc:text-xs font-medium",
                    getStatusTone(batch?.postProcessJob?.status),
                  )}
                >
                  {getPostProcessStatusLabel(batch?.postProcessJob?.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                {t("importProgress.itemListTitle")}
              </h4>
              {(batchQuery.isFetching || itemsQuery.isFetching) && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {itemsQuery.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-950/50 dark:bg-red-950/20 dark:text-red-300">
                {t("importProgress.itemsLoadFailed")}
              </div>
            ) : visibleItems.length > 0 ? (
              <div className="space-y-2">
                {visibleItems.map((item) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div
                          className="max-w-full truncate font-medium"
                          title={
                            item.sourceObject?.fileName ??
                            (item.activity
                              ? getLocalizedActivityTitle(
                                  item.activity,
                                  tActivityTitle,
                                )
                              : null) ??
                            `${t("importProgress.item")} ${item.position + 1}`
                          }
                        >
                          {item.sourceObject?.fileName ??
                            (item.activity
                              ? getLocalizedActivityTitle(
                                  item.activity,
                                  tActivityTitle,
                                )
                              : null) ??
                            `${t("importProgress.item")} ${item.position + 1}`}
                        </div>
                        <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
                          {item.lastError
                            ? item.lastError
                            : item.activity?.processingStatus
                              ? t("importProgress.activityStatus", {
                                  status: getActivityProcessingStatusLabel(
                                    item.activity.processingStatus,
                                  ),
                                })
                              : item.activity?.readyAt
                                ? t("importProgress.ready")
                                : t("importProgress.waiting")}
                        </div>
                      </div>
                      {(() => {
                        const displayStatus: ImportItemJobStatus =
                          item.status === "QUEUED" && item.activity?.readyAt
                            ? "DONE"
                            : item.status;
                        return (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-1 text-mobile-caption pc:text-xs font-medium",
                              getStatusTone(displayStatus),
                            )}
                          >
                            {getItemStatusLabel(displayStatus)}
                          </span>
                        );
                      })()}
                    </div>
                    {item.lastError && (
                      <div className="mt-2 flex items-start gap-2 text-mobile-caption pc:text-xs text-red-600 dark:text-red-300">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="break-words">{item.lastError}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                {t("importProgress.waitingForItems")}
              </div>
            )}
          </div>
        </div>

        <AdaptiveDialogFooter
          className={cn(adaptiveDialogFooterActionsClassName, "shrink-0")}
        >
          <Button
            type="button"
            variant="outline"
            size="dialog-action"
            className={cn(
              adaptiveDialogFooterActionButtonClassName,
              "w-full flex-none sm:w-full",
            )}
            onClick={() => onOpenChange(false)}
          >
            {overallDone
              ? t("importProgress.close")
              : t("importProgress.continueLater")}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

export function RecentImportBatchButton() {
  const t = useTranslations("activities");
  const [latestBatchId, setLatestBatchId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setLatestBatchId(getLatestRecentImportBatchId());
    update();
    window.addEventListener(RECENT_IMPORT_BATCHES_UPDATED_EVENT, update);
    return () =>
      window.removeEventListener(RECENT_IMPORT_BATCHES_UPDATED_EVENT, update);
  }, []);

  if (!latestBatchId) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Clock3 className="h-4 w-4 lg:mr-2" />
        <span className="hidden lg:block">{t("importProgress.openEntry")}</span>
      </Button>
      <ImportBatchProgressDialog
        open={open}
        onOpenChange={setOpen}
        batchId={latestBatchId}
      />
    </>
  );
}
