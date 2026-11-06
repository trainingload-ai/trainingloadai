import { describe, expect, it } from "vitest";
import {
  ActivityProcessingStatus,
  type ImportBatchItem,
  type ImportBatchSummary,
} from "@/api/activities";
import {
  getImportBatchActivityProgress,
  hasImportItemFailure,
  isImportPipelineSettled,
  isImportPipelineSuccessful,
  resolveImportItemDisplayStatus,
} from "./import-batch-progress-model";

function batch(
  overrides: Partial<ImportBatchSummary> = {},
): ImportBatchSummary {
  return {
    id: "batch-1",
    sourceKind: "FILE",
    status: "COMPLETED",
    totalCount: 73,
    successCount: 73,
    failedCount: 0,
    skippedCount: 0,
    isFirstActivityImport: true,
    createdAt: "2026-11-05T09:00:00.000Z",
    updatedAt: "2026-11-05T09:00:00.000Z",
    postProcessJob: {
      id: "post-1",
      status: "RUNNING",
      createdAt: "2026-11-05T09:00:00.000Z",
      updatedAt: "2026-11-05T09:00:00.000Z",
    },
    counts: {
      items: 73,
      createdActivities: 73,
      readyActivities: 50,
      processingActivities: 23,
      analysisFailedActivities: 0,
      eventLogs: 0,
    },
    ...overrides,
  };
}

function item(overrides: Partial<ImportBatchItem> = {}): ImportBatchItem {
  return {
    id: "item-1",
    position: 0,
    status: "DONE",
    sourceKind: "FILE",
    sourceUid: "file-1",
    attempts: 0,
    createdAt: "2026-11-05T09:00:00.000Z",
    updatedAt: "2026-11-05T09:00:00.000Z",
    ...overrides,
  };
}

describe("import batch progress model", () => {
  it("shows a safe failure message based on status, never worker diagnostic text", () => {
    expect(
      hasImportItemFailure(
        item({
          status: "DEAD",
          lastError: "Prisma at /Users/private/server.ts",
        }),
      ),
    ).toBe(true);
    expect(hasImportItemFailure(item({ status: "FAILED" }))).toBe(true);
    expect(
      hasImportItemFailure(
        item({ status: "SKIPPED", lastError: "Spawned child jobs" }),
      ),
    ).toBe(false);
  });
  it("does not treat file-level DONE as full pipeline completion", () => {
    const current = batch();

    expect(getImportBatchActivityProgress(current)).toMatchObject({
      ready: 50,
      processing: 23,
      settled: 50,
    });
    expect(isImportPipelineSettled(current)).toBe(false);
    expect(isImportPipelineSuccessful(current)).toBe(false);
  });

  it("settles only after every activity has finished analysis", () => {
    const current = batch({
      postProcessJob: {
        id: "post-1",
        status: "COMPLETED",
        createdAt: "2026-11-05T09:00:00.000Z",
        updatedAt: "2026-11-05T09:00:06.000Z",
      },
      counts: {
        items: 73,
        createdActivities: 73,
        readyActivities: 73,
        processingActivities: 0,
        analysisFailedActivities: 0,
        eventLogs: 0,
      },
    });

    expect(isImportPipelineSettled(current)).toBe(true);
    expect(isImportPipelineSuccessful(current)).toBe(true);
  });

  it("shows the activity analysis phase after the file item is done", () => {
    const current = item({
      activity: {
        id: 1,
        hashId: "activity-1",
        processingStatus: ActivityProcessingStatus.ANALYZING,
      },
    });

    expect(resolveImportItemDisplayStatus(current)).toEqual({
      kind: "activity",
      status: ActivityProcessingStatus.ANALYZING,
    });
  });

  it("uses READY when the activity has a ready timestamp", () => {
    const current = item({
      activity: {
        id: 1,
        hashId: "activity-1",
        processingStatus: ActivityProcessingStatus.ANALYZING,
        readyAt: "2026-11-05T09:00:06.000Z",
      },
    });

    expect(resolveImportItemDisplayStatus(current)).toEqual({
      kind: "activity",
      status: ActivityProcessingStatus.READY,
    });
  });
});
