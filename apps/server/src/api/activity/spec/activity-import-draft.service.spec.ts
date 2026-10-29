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
  const service = new ActivityImportDraftService(
    { $queryRaw: queryRaw, $executeRaw: executeRaw } as never,
    { uploadFile } as never,
    {} as never,
    {} as never,
    {} as never,
    { findHashIdById: jest.fn() } as never,
    { refreshBatchProgress: jest.fn() } as never,
    { t: jest.fn((key: string) => key) } as never,
    {
      batchJobs: () => ({ create: batchCreate }),
      itemJobs: () => ({ create: itemCreate, update: jest.fn() }),
    } as never,
  );
  return { batchCreate, executeRaw, itemCreate, service, uploadFile };
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
});
