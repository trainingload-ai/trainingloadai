import { describe, expect, it, jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImportBatchService } from '@/importing/import-batch.service';
import { HealthDataIngestService } from '@/health-data/health-data-ingest.service';
import { IntervalsIcuClient } from '@/integrations/intervals-icu/intervals-icu.client';
import { IntervalsIcuCredentialService } from '@/integrations/intervals-icu/intervals-icu-credential.service';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { IntervalsIcuPlanSyncService } from '../intervals-icu-plan-sync.service';
import {
  IntervalsIcuWebhookService,
  type IntervalsIcuWebhookPayload,
} from '../intervals-icu-webhook.service';

async function processEvents(
  service: IntervalsIcuWebhookService,
  payload: IntervalsIcuWebhookPayload,
) {
  for (const event of payload.events ?? []) {
    await service.processEvent(event);
  }
}

describe('IntervalsIcuWebhookService', () => {
  function createService(secret = 'test-secret') {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'intervalsIcu.webhook.secret') return secret;
        return undefined;
      }),
    } as unknown as ConfigService;
    const prisma = {
      externalProviderConnection: {
        findFirst: jest.fn(),
      },
      thirdPartyActivity: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;
    const importBatchService = {
      createIntervalsIcuImportBatch: jest.fn(),
    } as unknown as jest.Mocked<ImportBatchService>;
    const healthDataIngest = {
      ingestCandidates: jest.fn(),
      replaceProviderDailyCandidates: jest.fn(),
    } as unknown as jest.Mocked<HealthDataIngestService>;
    const intervalsIcuPlanSync = {
      handleCalendarWebhookEvent: jest.fn(),
      getPlanSyncFlags: jest.fn(),
    } as unknown as jest.Mocked<IntervalsIcuPlanSyncService>;
    const intervalsIcuClient = {
      getAthlete: jest.fn(),
    } as unknown as jest.Mocked<IntervalsIcuClient>;
    const intervalsIcuCredentials = {
      resolveConnectionCredential: jest.fn(),
    } as unknown as jest.Mocked<IntervalsIcuCredentialService>;
    const userService = {
      upsertImportedFitnessMetric: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    const inbox = {
      checksum: jest.fn(() => 'checksum'),
      enqueue: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const activitySourceLifecycle = {
      deactivateProviderData: jest.fn(async () => ({
        thirdPartyActivities: 1,
        mappings: 1,
        activities: 0,
        requeuedActivities: 1,
      })),
    };
    const service = new IntervalsIcuWebhookService(
      configService,
      prisma,
      importBatchService,
      healthDataIngest,
      intervalsIcuPlanSync,
      intervalsIcuClient,
      intervalsIcuCredentials,
      userService,
      inbox as never,
      { model: () => prisma.externalProviderConnection } as never,
      activitySourceLifecycle as never,
    );
    return {
      configService,
      healthDataIngest,
      importBatchService,
      inbox,
      intervalsIcuClient,
      intervalsIcuCredentials,
      intervalsIcuPlanSync,
      activitySourceLifecycle,
      prisma,
      service,
      userService,
    };
  }

  it('rejects invalid webhook secret', () => {
    const { service } = createService();
    expect(() =>
      service.verifyPayloadSecret({ secret: 'wrong', events: [] }),
    ).toThrow(UnauthorizedException);
  });

  it('accepts valid webhook secret', () => {
    const { service } = createService();
    expect(() =>
      service.verifyPayloadSecret({ secret: 'test-secret', events: [] }),
    ).not.toThrow();
  });

  it('reports newly queued and duplicate events separately', async () => {
    const { inbox, service } = createService();
    inbox.enqueue
      .mockResolvedValueOnce({
        accepted: true,
        enqueued: true,
        eventId: 'event-1',
      })
      .mockResolvedValueOnce({
        accepted: true,
        enqueued: false,
        eventId: 'event-1',
      });

    await expect(
      service.enqueue({
        secret: 'test-secret',
        events: [
          {
            type: 'ACTIVITY_UPLOADED',
            athlete_id: 'athlete-1',
            activity: { id: 'activity-1' },
          },
          {
            type: 'ACTIVITY_UPLOADED',
            athlete_id: 'athlete-1',
            activity: { id: 'activity-1' },
          },
        ],
      }),
    ).resolves.toEqual({
      accepted: true,
      receivedCount: 2,
      acceptedCount: 1,
      duplicateCount: 1,
    });
  });

  it('ingests WELLNESS_UPDATED records when syncWellness is enabled', async () => {
    const { healthDataIngest, prisma, service } = createService();
    prisma.externalProviderConnection.findFirst.mockResolvedValueOnce({
      id: 'connection-1',
      userId: 'user-1',
      externalAthleteId: 'i49291',
      syncWellness: true,
    } as never);
    healthDataIngest.replaceProviderDailyCandidates.mockResolvedValueOnce({
      sampleCount: 3,
      previousCount: 0,
      deletedCount: 0,
      rebuiltCount: 3,
    });

    await processEvents(service, {
      secret: 'test-secret',
      events: [
        {
          athlete_id: 'i49291',
          type: 'WELLNESS_UPDATED',
          records: [
            {
              id: '2026-07-05',
              weight: 70,
              hrv: 35,
              restingHR: 55,
            },
          ],
        },
      ],
    });

    expect(prisma.externalProviderConnection.findFirst).toHaveBeenCalledWith({
      where: {
        provider: 'intervals_icu',
        status: 'ACTIVE',
        externalAthleteId: { in: ['i49291', '49291'] },
      },
    });
    expect(
      healthDataIngest.replaceProviderDailyCandidates,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'INTERVALS_ICU',
        connectionId: 'connection-1',
        localDate: new Date('2026-07-05T00:00:00.000Z'),
        managedMetricTypes: [
          'BODY_MASS_KG',
          'RESTING_HEART_RATE_BPM',
          'HRV_SDNN_MS',
        ],
        candidates: expect.arrayContaining([
          expect.objectContaining({
            metricType: 'HRV_SDNN_MS',
            value: 35,
          }),
        ]),
      }),
    );
  });

  it('queues ACTIVITY_UPLOADED when automatic activity import is enabled', async () => {
    const { importBatchService, prisma, service } = createService();
    prisma.externalProviderConnection.findFirst.mockResolvedValueOnce({
      id: 'connection-1',
      userId: 'user-1',
      externalAthleteId: '49291',
      syncScheduledActivities: true,
    } as never);
    importBatchService.createIntervalsIcuImportBatch.mockResolvedValueOnce({
      batch: { id: 'batch-1' } as never,
      totalDiscovered: 1,
      queuedCount: 1,
      skippedCount: 0,
      directlyQueued: 1,
      routedToOrigin: 0,
      mirrorsCreated: 0,
      alreadyResolved: 0,
      duplicateOrRunning: 0,
    });

    await processEvents(service, {
      secret: 'test-secret',
      events: [
        {
          athlete_id: '49291',
          type: 'ACTIVITY_UPLOADED',
          activity: { id: 'activity-1', name: 'Ride' },
        },
      ],
    });

    expect(
      importBatchService.createIntervalsIcuImportBatch,
    ).toHaveBeenCalledWith({
      userId: 'user-1',
      connectionId: 'connection-1',
      activities: [{ id: 'activity-1', name: 'Ride' }],
      reason: 'webhook',
    });
  });

  it('soft deletes ACTIVITY_DELETED when automatic activity import is enabled', async () => {
    const { activitySourceLifecycle, prisma, service } = createService();
    prisma.externalProviderConnection.findFirst.mockResolvedValueOnce({
      id: 'connection-1',
      userId: 'user-1',
      externalAthleteId: '49291',
      syncScheduledActivities: true,
    } as never);
    prisma.thirdPartyActivity.findFirst.mockResolvedValueOnce({
      id: 42,
    } as never);
    await processEvents(service, {
      secret: 'test-secret',
      events: [
        {
          athlete_id: '49291',
          type: 'ACTIVITY_DELETED',
          activity: { id: 'activity-1' },
        },
      ],
    });

    expect(prisma.thirdPartyActivity.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        provider: 'intervals_icu',
        externalId: 'activity-1',
        state: 1,
      },
      select: { id: true },
    });
    expect(activitySourceLifecycle.deactivateProviderData).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        provider: 'intervals_icu',
        thirdPartyActivityIds: [42],
        externalIds: ['activity-1'],
      },
    );
  });

  it('writes FITNESS_UPDATED metrics when syncSportSettings is enabled', async () => {
    const { prisma, service, userService } = createService();
    prisma.externalProviderConnection.findFirst.mockResolvedValueOnce({
      id: 'connection-1',
      userId: 'user-1',
      externalAthleteId: '49291',
      syncSportSettings: true,
    } as never);
    userService.upsertImportedFitnessMetric.mockResolvedValue({
      id: 'metric-1',
    } as never);

    await processEvents(service, {
      secret: 'test-secret',
      events: [
        {
          athlete_id: '49291',
          type: 'FITNESS_UPDATED',
          records: [
            {
              id: '2026-07-05',
              vo2max: 51,
              sportInfo: [{ type: 'Ride', eftp: 240 }],
            },
          ],
        },
      ],
    });

    expect(userService.upsertImportedFitnessMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'intervals_icu',
        type: 'VO2_MAX',
        value: 51,
        sportType: 'UNKNOWN',
      }),
    );
    expect(userService.upsertImportedFitnessMetric).toHaveBeenCalledTimes(1);
  });

  it('syncs SPORT_SETTINGS_UPDATED from athlete API when enabled', async () => {
    const {
      intervalsIcuClient,
      intervalsIcuCredentials,
      prisma,
      service,
      userService,
    } = createService();
    prisma.externalProviderConnection.findFirst.mockResolvedValueOnce({
      id: 'connection-1',
      userId: 'user-1',
      externalAthleteId: '49291',
      syncSportSettings: true,
      credentialCiphertext: 'encrypted',
      metadata: { authType: 'oauth' },
    } as never);
    intervalsIcuCredentials.resolveConnectionCredential.mockReturnValueOnce({
      authType: 'oauth',
      token: 'access-token',
    });
    intervalsIcuClient.getAthlete.mockResolvedValueOnce({
      sportSettings: [{ types: ['Ride'], ftp: 255 }],
    });
    userService.upsertImportedFitnessMetric.mockResolvedValue({
      id: 'metric-1',
    } as never);

    await processEvents(service, {
      secret: 'test-secret',
      events: [
        {
          athlete_id: '49291',
          type: 'SPORT_SETTINGS_UPDATED',
        },
      ],
    });

    expect(
      intervalsIcuCredentials.resolveConnectionCredential,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialCiphertext: 'encrypted',
        metadata: { authType: 'oauth' },
      }),
    );
    expect(intervalsIcuClient.getAthlete).toHaveBeenCalledWith({
      authType: 'oauth',
      token: 'access-token',
    });
    expect(userService.upsertImportedFitnessMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FTP',
        value: 255,
      }),
    );
  });

  it('skips events when athlete connection is missing', async () => {
    const { healthDataIngest, importBatchService, prisma, service } =
      createService();
    prisma.externalProviderConnection.findFirst.mockResolvedValueOnce(null);

    await processEvents(service, {
      secret: 'test-secret',
      events: [
        {
          athlete_id: 'missing-athlete',
          type: 'WELLNESS_UPDATED',
          records: [{ id: '2026-07-05', weight: 70 }],
        },
      ],
    });

    expect(healthDataIngest.ingestCandidates).not.toHaveBeenCalled();
    expect(
      importBatchService.createIntervalsIcuImportBatch,
    ).not.toHaveBeenCalled();
  });
});
