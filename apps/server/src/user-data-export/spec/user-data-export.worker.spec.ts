import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { UserDataExportWorker } from '../user-data-export.worker';

type ExportWorkerInternals = {
  logger: {
    warn: (...args: unknown[]) => void;
    log: (...args: unknown[]) => void;
  };
  drain(): Promise<unknown>;
  claim(batchSize: number): Promise<unknown>;
  failExhaustedJobs(): Promise<unknown>;
  process(job: Record<string, unknown>): Promise<unknown>;
};

type UpdateManyArgs = {
  data?: { status?: string };
  where?: unknown;
};

describe('UserDataExportWorker runtime resilience', () => {
  it('backs off and logs one warning when its migration is missing', async () => {
    const findMany = jest.fn<() => Promise<never>>().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'The export table does not exist.',
        {
          code: 'P2021',
          clientVersion: 'test',
          meta: { table: 'public.t_user_data_export_job' },
        },
      ),
    );
    const worker = new UserDataExportWorker(
      { userDataExportJob: { findMany } } as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    const warn = jest
      .spyOn((worker as unknown as ExportWorkerInternals).logger, 'warn')
      .mockImplementation(() => undefined);

    await (worker as unknown as ExportWorkerInternals).drain();
    await (worker as unknown as ExportWorkerInternals).drain();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('pnpm prisma:deploy');
  });

  it('claims only non-exhausted jobs using a UTC lease boundary', async () => {
    const queryRawUnsafe = jest
      .fn<(...args: unknown[]) => Promise<Array<{ id: string }>>>()
      .mockResolvedValue([]);
    const worker = new UserDataExportWorker(
      {
        $queryRawUnsafe: queryRawUnsafe,
        userDataExportJob: {
          findMany: jest
            .fn<() => Promise<Array<never>>>()
            .mockResolvedValue([]),
        },
      } as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    await (worker as unknown as ExportWorkerInternals).claim(1);

    const sql = String(queryRawUnsafe.mock.calls[0]?.[0]);
    expect(sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
    expect(sql).toContain('j.attempts < j.max_attempts');
    expect(sql).toContain('u.account_deletion_requested_at IS NULL');
  });

  it('marks stale jobs failed after their final allowed attempt', async () => {
    const executeRaw = jest
      .fn<(...args: unknown[]) => Promise<number>>()
      .mockResolvedValue(2);
    const worker = new UserDataExportWorker(
      { $executeRaw: executeRaw } as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    const warn = jest
      .spyOn((worker as unknown as ExportWorkerInternals).logger, 'warn')
      .mockImplementation(() => undefined);

    await (worker as unknown as ExportWorkerInternals).failExhaustedJobs();

    const sql = String(executeRaw.mock.calls[0]?.[0]);
    expect(sql).toContain('attempts >= max_attempts');
    expect(sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
    expect(warn).toHaveBeenCalledWith(
      'Marked exhausted export jobs as failed count=2',
    );
  });

  it('logs the lifecycle and guards final publication during account deletion', async () => {
    const workingDirectory = await fs.mkdtemp(
      path.join(tmpdir(), 'export-worker-test-'),
    );
    const archivePath = path.join(workingDirectory, 'export.zip');
    await fs.writeFile(archivePath, 'archive-content');
    const updateMany = jest
      .fn<(args: unknown) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 });
    const queryRaw = jest
      .fn<(...args: unknown[]) => Promise<Array<never>>>()
      .mockResolvedValue([]);
    const transaction = jest
      .fn<(work: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()
      .mockImplementation(async (work) =>
        work({ $queryRaw: queryRaw, userDataExportJob: { updateMany } }),
      );
    const cleanup = jest.fn<() => Promise<void>>().mockResolvedValue();
    const worker = new UserDataExportWorker(
      { $transaction: transaction, userDataExportJob: { updateMany } } as never,
      { get: jest.fn() } as never,
      {
        build: jest.fn().mockResolvedValue({
          archivePath,
          workingDirectory,
          fileName: 'trainingload-export.zip',
          warnings: [],
        } as never),
        cleanup,
      } as never,
      {
        uploadFileFromPath: jest.fn().mockResolvedValue({
          fileKey: 'private-artifact-key',
        } as never),
        deleteFile: jest.fn().mockResolvedValue(undefined as never),
      } as never,
    );
    const log = jest
      .spyOn((worker as unknown as ExportWorkerInternals).logger, 'log')
      .mockImplementation(() => undefined);
    const now = new Date('2026-08-11T12:00:00.000Z');

    try {
      await (worker as unknown as ExportWorkerInternals).process({
        id: 'export-id',
        userId: 'user-id',
        mode: 'AI_ANALYSIS',
        locationPrivacy: 'REMOVE_GPS',
        includeOriginalFiles: false,
        attempts: 1,
        maxAttempts: 3,
        dataCutoffAt: now,
        progressCurrent: 0,
        progressTotal: 0,
        lockToken: 'lease-token',
      });

      const readyUpdate = updateMany.mock.calls
        .map((call) => call[0] as UpdateManyArgs)
        .find((args) => args?.data?.status === 'READY');
      expect(readyUpdate).toBeDefined();
      expect(readyUpdate?.where).toMatchObject({
        id: 'export-id',
        lockToken: 'lease-token',
        user: { accountDeletionRequestedAt: null },
      });
      expect(String(queryRaw.mock.calls[0]?.[0])).toContain('FOR UPDATE');
      const messages = log.mock.calls.map((call) => String(call[0]));
      expect(
        messages.some((message) => message.includes('Export started')),
      ).toBe(true);
      expect(
        messages.some((message) => message.includes('Export archive built')),
      ).toBe(true);
      expect(
        messages.some((message) => message.includes('Export upload started')),
      ).toBe(true);
      expect(messages.some((message) => message.includes('Export ready'))).toBe(
        true,
      );
      expect(cleanup).toHaveBeenCalled();
    } finally {
      await fs.rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
