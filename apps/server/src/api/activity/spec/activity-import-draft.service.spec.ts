import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { ActivityImportDraftService } from '../activity-import-draft.service';

const userId = 'user_watch_sync';
const idempotencyKey = 'watch-workout:session-123:1';
const fileBuffer = Buffer.from('stable watch workout payload');

function draftRow() {
  return {
    id: 'draft_existing',
    userId,
    sourceObjectId: 'source_existing',
    sourceKind: 'FILE',
    sourceUid: 'file:existing',
    fileName: 'watch.fit',
    fileKey: 'watch.fit',
    rawStorageKey: 'watch.fit',
    status: 'READY',
    payload: { summary: {}, records: [], laps: [] },
    summary: {},
    sessionRpe: null,
    committedActivityId: null,
    committedAt: null,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
  };
}

function createService(queryResults: unknown[], executeResults: number[] = []) {
  const queryRaw = jest.fn<() => Promise<unknown>>();
  for (const result of queryResults) {
    queryRaw.mockResolvedValueOnce(result);
  }
  const executeRaw = jest.fn<() => Promise<number>>();
  for (const result of executeResults) {
    executeRaw.mockResolvedValueOnce(result);
  }
  const uploadFile = jest.fn();
  const batchCreate = jest.fn<() => Promise<{ id: string }>>();
  const itemCreate = jest.fn<() => Promise<{ id: string }>>();
  const activityFindFirst = jest.fn();
  const activityUpdate = jest.fn();
  const draftUpdate = jest.fn();
  const recomputeCreate = jest.fn();
  const tx = {
    activity: { findFirst: activityFindFirst, update: activityUpdate },
    activityImportDraft: { update: draftUpdate },
    activityRecomputeJob: { create: recomputeCreate },
  };
  const transaction = jest.fn(async (callback: unknown) => {
    if (typeof callback === 'function') {
      return (callback as (value: typeof tx) => Promise<unknown>)(tx);
    }
    return Promise.all(callback as Promise<unknown>[]);
  });
  const findHashIdById = jest.fn();
  const service = new ActivityImportDraftService(
    {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      $transaction: transaction,
    } as never,
    { uploadFile } as never,
    {} as never,
    {} as never,
    {} as never,
    { findHashIdById } as never,
    { refreshBatchProgress: jest.fn() } as never,
    { t: jest.fn((key: string) => key) } as never,
    {
      batchJobs: () => ({ create: batchCreate }),
      itemJobs: () => ({ create: itemCreate, update: jest.fn() }),
    } as never,
  );
  return {
    activityFindFirst,
    activityUpdate,
    batchCreate,
    draftUpdate,
    executeRaw,
    findHashIdById,
    itemCreate,
    recomputeCreate,
    service,
    transaction,
    uploadFile,
  };
}

function watchFile() {
  return {
    buffer: fileBuffer,
    originalname: 'watch.fit',
    mimetype: 'application/octet-stream',
    size: fileBuffer.length,
  } as Express.Multer.File;
}

describe('ActivityImportDraftService idempotency', () => {
  it('returns the existing draft without uploading the same workout again', async () => {
    const hash = createHash('sha256').update(fileBuffer).digest('hex');
    const { service, uploadFile } = createService([
      [{ id: 'draft_existing', idempotencyHash: hash }],
      [draftRow()],
    ]);

    const preview = await service.createFromFile({
      file: watchFile(),
      idempotencyKey,
      userId,
    });

    expect(preview.id).toBe('draft_existing');
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('rejects reuse of a key with different activity bytes', async () => {
    const { service, uploadFile } = createService([
      [{ id: 'draft_existing', idempotencyHash: 'different-hash' }],
    ]);

    await expect(
      service.createFromFile({
        file: watchFile(),
        idempotencyKey,
        userId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('allows only one caller to claim a READY draft for commit', async () => {
    const { batchCreate, service } = createService([[draftRow()]], [0]);

    await expect(
      service.commitDraft({
        draftId: 'draft_existing',
        sessionRpe: null,
        userId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(batchCreate).not.toHaveBeenCalled();
  });

  it('releases the COMMITTING claim if batch creation fails', async () => {
    const { batchCreate, executeRaw, service } = createService(
      [[draftRow()]],
      [1, 1],
    );
    batchCreate.mockRejectedValueOnce(new Error('batch unavailable'));

    await expect(
      service.commitDraft({
        draftId: 'draft_existing',
        sessionRpe: null,
        userId,
      }),
    ).rejects.toThrow('batch unavailable');
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('leases an inline MATERIALIZING item so the background worker cannot claim it', async () => {
    const { batchCreate, itemCreate, service } = createService(
      [[draftRow()]],
      [1, 1],
    );
    batchCreate.mockResolvedValueOnce({ id: 'batch-inline' });
    itemCreate.mockResolvedValueOnce({ id: 'item-inline' });

    await expect(
      service.commitDraft({
        draftId: 'draft_existing',
        sessionRpe: 3,
        userId,
      }),
    ).rejects.toThrow();

    expect(itemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'MATERIALIZING',
        lockToken: expect.stringMatching(/^draft-inline:/),
        leaseExpiresAt: expect.any(Date),
      }),
    });
  });

  it('persists a replay job when a committed draft changes RPE', async () => {
    const committed = {
      ...draftRow(),
      status: 'COMMITTED',
      committedActivityId: 42,
      sessionRpe: 2,
    };
    const updated = { ...committed, sessionRpe: 6 };
    const {
      activityFindFirst,
      activityUpdate,
      draftUpdate,
      findHashIdById,
      recomputeCreate,
      service,
    } = createService([[committed], [updated]]);
    activityFindFirst.mockResolvedValue({
      id: 42,
      startTime: new Date('2026-08-19T10:00:00.000Z'),
    });
    activityUpdate.mockResolvedValue({ id: 42 });
    draftUpdate.mockResolvedValue({ id: committed.id });
    recomputeCreate.mockResolvedValue({ id: 'replay-rpe' });
    findHashIdById.mockResolvedValue('activity-hash');

    const result = await service.commitDraft({
      draftId: committed.id,
      sessionRpe: 6,
      userId,
    });

    expect(activityUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: expect.objectContaining({
        sessionRpe: 6,
        processingStatus: 'ANALYZING',
        readyAt: null,
      }),
    });
    expect(recomputeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        reason: 'ACTIVITY_INPUT_CHANGED',
        triggerSource: 'activity_import_draft_rpe_changed',
        affectedPipelines: ['TRAINING_LOAD', 'PMC'],
      }),
    });
    expect(result.activityHashId).toBe('activity-hash');
  });
});
