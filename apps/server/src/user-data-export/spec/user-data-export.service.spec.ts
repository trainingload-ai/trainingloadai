import { describe, expect, it } from '@jest/globals';

import { UserDataExportService } from '../user-data-export.service';

describe('UserDataExportService privacy boundary', () => {
  const service = new UserDataExportService(
    {} as never,
    {} as never,
    {} as never,
  );

  it('rejects original source files in AI analysis exports', async () => {
    await expect(
      service.create({
        userId: 'user-id',
        idempotencyKey: 'request-key-123',
        mode: 'AI_ANALYSIS',
        locationPrivacy: 'REMOVE_GPS',
        includeOriginalFiles: true,
      }),
    ).rejects.toThrow('ORIGINAL_FILES_NOT_AVAILABLE_IN_AI_ANALYSIS');
  });

  it('requires exact-location mode when original files are requested', async () => {
    await expect(
      service.create({
        userId: 'user-id',
        idempotencyKey: 'request-key-456',
        mode: 'FULL_BACKUP',
        locationPrivacy: 'REDACT_FREQUENT_LOCATIONS',
        includeOriginalFiles: true,
      }),
    ).rejects.toThrow('ORIGINAL_FILES_REQUIRE_EXACT_LOCATION');
  });

  it('does not expose internal worker error details through the user API', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    const serviceWithFailedJob = new UserDataExportService(
      {
        userDataExportJob: {
          findFirst: async () => ({
            id: 'export-id',
            userId: 'user-id',
            idempotencyKey: 'scoped-key',
            mode: 'AI_ANALYSIS',
            locationPrivacy: 'REMOVE_GPS',
            includeOriginalFiles: false,
            status: 'FAILED',
            schemaVersion: 'trainingload-export/v1',
            dataCutoffAt: now,
            progressStage: 'failed',
            progressCurrent: 0,
            progressTotal: 0,
            artifactStorageKey: null,
            artifactFileName: null,
            artifactSizeBytes: null,
            artifactSha256: null,
            warnings: [],
            attempts: 3,
            maxAttempts: 3,
            availableAt: now,
            leaseExpiresAt: null,
            lockToken: null,
            lastErrorCode: 'EXPORT_GENERATION_FAILED',
            lastErrorDetail:
              'Error: private storage key at /internal/server/path',
            requestedAt: now,
            startedAt: now,
            completedAt: null,
            expiresAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      serviceWithFailedJob.get('user-id', 'export-id'),
    ).resolves.toMatchObject({
      lastError: {
        code: 'EXPORT_GENERATION_FAILED',
        detail: null,
      },
    });
  });
});
