import type {
  ImportBatchJobStatus,
  ImportItemJobStatus,
  ImportPipelineStage,
  UserPostProcessJobStatus,
} from '@prisma/client';

export const TERMINAL_IMPORT_ITEM_STATUSES: ImportItemJobStatus[] = [
  'DONE',
  'SKIPPED',
  'FAILED',
  'DEAD',
];

export const TERMINAL_IMPORT_BATCH_STATUSES: ImportBatchJobStatus[] = [
  'COMPLETED',
  'PARTIAL_FAILED',
  'FAILED',
  'CANCELLED',
];

export const TERMINAL_POST_PROCESS_STATUSES: UserPostProcessJobStatus[] = [
  'COMPLETED',
  'FAILED',
  'DEAD',
];

export interface ImportBatchProgress {
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface ImportPipelineEventDraft {
  stage: ImportPipelineStage;
  message: string;
  data?: Record<string, unknown>;
}

export function isTerminalImportItemStatus(status: ImportItemJobStatus) {
  return TERMINAL_IMPORT_ITEM_STATUSES.includes(status);
}

export function isTerminalImportBatchStatus(status: ImportBatchJobStatus) {
  return TERMINAL_IMPORT_BATCH_STATUSES.includes(status);
}

export function isTerminalPostProcessStatus(status: UserPostProcessJobStatus) {
  return TERMINAL_POST_PROCESS_STATUSES.includes(status);
}
