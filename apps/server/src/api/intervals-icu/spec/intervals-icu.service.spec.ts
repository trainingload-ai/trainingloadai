import { Logger } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { THIRD_PARTY_ERRORS } from '@/integrations/external-provider/external-provider-errors';
import { IntervalsIcuApiError } from '@/integrations/intervals-icu/intervals-icu.client';
import { IntervalsIcuService } from '../intervals-icu.service';

describe('IntervalsIcuService', () => {
  function createService() {
    const prisma = {
      externalProviderConnection: {
        findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
    };
    const intervalsIcuClient = {
      listActivities: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      listWellness: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      getProfile: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      exchangeOAuthCode: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const intervalsIcuCredentials = {
      decrypt: jest.fn((value: string) => `plain:${value}`),
      encrypt: jest.fn((value: string) => `cipher:${value}`),
      fingerprint: jest.fn((value: string) => `fingerprint:${value}`),
      last4: jest.fn((value: string) => value.slice(-4)),
      resolveConnectionCredential: jest.fn(function (connection: {
        credentialCiphertext: string;
      }) {
        return intervalsIcuCredentials.decrypt(connection.credentialCiphertext);
      }),
    };
    const importBatchService = {
      createIntervalsIcuImportBatch:
        jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const notificationDomain = {
      ensureNotification: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const intervalsIcuPlanSync = {
      getPlanSyncFlags: jest.fn(() => ({
        syncPlannedWorkouts: false,
        exportPlannedWorkouts: false,
      })),
      syncConnectionWeek: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const oauthStateRows = new Map<
      string,
      { userId: string; payload: unknown }
    >();
    const oauthStates = {
      issue: jest.fn(async (args: { userId: string; payload: unknown }) => {
        const state = `state-${oauthStateRows.size + 1}`;
        oauthStateRows.set(state, {
          userId: args.userId,
          payload: args.payload,
        });
        return state;
      }),
      consume: jest.fn(async (_provider: string, state: string) => {
        const row = oauthStateRows.get(state);
        if (!row) throw new Error('Invalid OAuth state');
        oauthStateRows.delete(state);
        return row;
      }),
    };
    const healthDataIngest = {
      ingestCandidates: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      replaceProviderDailyCandidates:
        jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const i18n = {
      resolveLanguage: jest.fn(() => 'en'),
      t: jest.fn((key: string) => {
        const messages: Record<string, string> = {
          'common.notification.intervalsIcu.titleSyncCompleted':
            'Intervals.icu sync completed',
          'common.notification.intervalsIcu.bodyNoNewActivitiesRecent60Days':
            'No new Intervals.icu activities to sync in the last 60 days.',
          'common.notification.intervalsIcu.bodyNoNewActivitiesYesterday':
            'No new Intervals.icu activities to sync for yesterday.',
        };
        return messages[key] ?? key;
      }),
    };
    const userService = {
      getPreferredLocale: jest.fn(async () => 'en'),
    };
    const configValues: Record<string, string> = {
      'intervalsIcu.oauth.clientID': '539',
      'intervalsIcu.oauth.clientSecret': 'test-client-secret',
      'intervalsIcu.oauth.redirectUri':
        'http://localhost:3001/intervals-icu/oauth/callback',
      'intervalsIcu.oauth.authorizeUrl':
        'https://intervals.icu/oauth/authorize',
      EXTERNAL_PROVIDER_CREDENTIAL_SECRET: 'test-state-secret',
    };
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    };

    return {
      configService,
      configValues,
      importBatchService,
      intervalsIcuClient,
      intervalsIcuCredentials,
      intervalsIcuPlanSync,
      oauthStates,
      healthDataIngest,
      i18n,
      userService,
      notificationDomain,
      prisma,
      service: new IntervalsIcuService(
        prisma as never,
        intervalsIcuClient as never,
        intervalsIcuCredentials as never,
        importBatchService as never,
        notificationDomain as never,
        intervalsIcuPlanSync as never,
        oauthStates as never,
        { model: () => prisma.externalProviderConnection } as never,
        configService as never,
        healthDataIngest as never,
        i18n as never,
        userService as never,
      ),
    };
  }

  function connection(overrides?: Record<string, unknown>) {
    return {
      id: 'connection-1',
      userId: 'user-1',
      provider: 'intervals_icu',
      status: 'ACTIVE',
      credentialCiphertext: 'cipher-key',
      syncScheduledActivities: true,
      ...overrides,
    };
  }

  it('rejects syncLatest when Intervals.icu is not connected or missing credentials', async () => {
    const disconnected = createService();
    disconnected.prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(
      null,
    );

    await expect(disconnected.service.syncLatest('user-1')).rejects.toThrow(
      THIRD_PARTY_ERRORS.INTERVALS_ICU.NOT_CONNECTED.key,
    );
    expect(
      disconnected.intervalsIcuClient.listActivities,
    ).not.toHaveBeenCalled();

    const missingCredential = createService();
    missingCredential.prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(
      connection({ credentialCiphertext: '' }),
    );
    await expect(
      missingCredential.service.syncLatest('user-1'),
    ).rejects.toThrow(THIRD_PARTY_ERRORS.INTERVALS_ICU.CREDENTIAL_MISSING.key);
    expect(
      missingCredential.intervalsIcuClient.listActivities,
    ).not.toHaveBeenCalled();
  });

  it('starts OAuth authorization with full integration scopes and one-time state', async () => {
    const { oauthStates, service } = createService();

    const result = await service.startOAuth('user-1', {
      syncActivities: true,
      exportPlannedWorkouts: true,
      returnUrl: 'http://localhost:3002/zh/account?tab=connections',
    });

    const url = new URL(result.authorizationUrl);
    expect(url.origin + url.pathname).toBe(
      'https://intervals.icu/oauth/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('539');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/intervals-icu/oauth/callback',
    );
    expect(url.searchParams.get('scope')).toBe(
      [
        'ACTIVITY:WRITE',
        'CALENDAR:WRITE',
        'WELLNESS:WRITE',
        'SETTINGS:WRITE',
      ].join(','),
    );
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(oauthStates.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'intervals_icu',
        payload: expect.objectContaining({
          returnUrl: 'http://localhost:3002/zh/account?tab=connections',
        }),
      }),
    );
    expect(result.scopes).toEqual([
      'ACTIVITY:WRITE',
      'CALENDAR:WRITE',
      'WELLNESS:WRITE',
      'SETTINGS:WRITE',
    ]);
  });

  it('exchanges OAuth callback code and stores an OAuth connection', async () => {
    const {
      intervalsIcuClient,
      intervalsIcuCredentials,
      intervalsIcuPlanSync,
      prisma,
      service,
    } = createService();
    const start = await service.startOAuth('user-1', {
      syncActivities: false,
      syncScheduledActivities: false,
      returnUrl: 'http://localhost:3002/zh/account',
    });
    const state = new URL(start.authorizationUrl).searchParams.get('state');
    if (!state) throw new Error('Missing OAuth state in test setup');

    intervalsIcuClient.exchangeOAuthCode.mockResolvedValueOnce({
      access_token: 'oauth-access-token',
      token_type: 'Bearer',
      scope: 'ACTIVITY:READ',
      athlete: { id: 'athlete-42', name: 'Victor' },
    });
    prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(null);
    prisma.externalProviderConnection.upsert.mockResolvedValueOnce(
      connection({
        externalAthleteId: 'athlete-42',
        credentialCiphertext: 'cipher:oauth-access-token',
        credentialLast4: 'oken',
        metadata: {
          authType: 'oauth',
        },
      }),
    );

    await expect(
      service.completeOAuthCallback({
        code: 'code-123',
        state,
      }),
    ).resolves.toBe(
      'http://localhost:3002/zh/account?intervals_icu_oauth=connected',
    );

    expect(intervalsIcuClient.exchangeOAuthCode).toHaveBeenCalledWith({
      clientId: '539',
      clientSecret: 'test-client-secret',
      code: 'code-123',
    });
    expect(intervalsIcuCredentials.encrypt).toHaveBeenCalledWith(
      'oauth-access-token',
    );
    expect(prisma.externalProviderConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'user-1',
          provider: 'intervals_icu',
          externalAthleteId: 'athlete-42',
          credentialCiphertext: 'cipher:oauth-access-token',
          credentialLast4: 'oken',
          credentialFingerprint: 'fingerprint:oauth-access-token',
          status: 'ACTIVE',
          syncActivities: false,
          syncScheduledActivities: false,
          metadata: expect.objectContaining({
            authType: 'oauth',
            oauth: expect.objectContaining({
              tokenType: 'Bearer',
              grantedScopes: ['ACTIVITY:READ'],
              athlete: { id: 'athlete-42', name: 'Victor' },
            }),
          }),
        }),
      }),
    );
    expect(intervalsIcuClient.listActivities).not.toHaveBeenCalled();
    expect(intervalsIcuPlanSync.syncConnectionWeek).not.toHaveBeenCalled();
  });

  it('rejects OAuth binding immediately when the Intervals.icu account belongs to another user', async () => {
    const { intervalsIcuClient, prisma, service } = createService();
    const start = await service.startOAuth('user-1', {
      syncActivities: false,
      returnUrl: 'http://localhost:3002/zh/account',
    });
    const state = new URL(start.authorizationUrl).searchParams.get('state');
    if (!state) throw new Error('Missing OAuth state in test setup');

    intervalsIcuClient.exchangeOAuthCode.mockResolvedValueOnce({
      access_token: 'oauth-access-token',
      athlete: { id: 'athlete-42', name: 'Victor' },
    });
    prisma.externalProviderConnection.findFirst.mockResolvedValueOnce(
      connection({ userId: 'user-2', externalAthleteId: 'athlete-42' }),
    );

    const result = await service.completeOAuthCallback({
      code: 'code-123',
      state,
    });

    const callbackUrl = new URL(result);
    expect(callbackUrl.searchParams.get('intervals_icu_oauth')).toBe('error');
    expect(callbackUrl.searchParams.get('reason')).toBe(
      'account_already_connected',
    );
    expect(prisma.externalProviderConnection.findFirst).toHaveBeenCalledWith({
      where: {
        provider: 'intervals_icu',
        externalAthleteId: 'athlete-42',
        status: 'ACTIVE',
        userId: { not: 'user-1' },
      },
      select: { userId: true },
    });
    expect(prisma.externalProviderConnection.upsert).not.toHaveBeenCalled();
  });

  it('rejects API key binding when the Intervals.icu account belongs to another user', async () => {
    const { intervalsIcuClient, prisma, service } = createService();
    prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(null);
    intervalsIcuClient.getProfile.mockResolvedValueOnce({
      athlete: { id: 'athlete-42' },
    });
    prisma.externalProviderConnection.findFirst.mockResolvedValueOnce(
      connection({ userId: 'user-2', externalAthleteId: 'athlete-42' }),
    );

    await expect(
      service.connect('user-1', {
        apiKey: 'new-api-key',
        syncActivities: false,
      }),
    ).rejects.toThrow(
      THIRD_PARTY_ERRORS.INTERVALS_ICU.ACCOUNT_ALREADY_CONNECTED.key,
    );
    expect(prisma.externalProviderConnection.upsert).not.toHaveBeenCalled();
  });

  it('replaces an OAuth connection with API key credentials when confirmed', async () => {
    const { intervalsIcuClient, prisma, service } = createService();
    const existingOAuthConnection = connection({
      credentialCiphertext: 'cipher:oauth-access-token',
      credentialFingerprint: 'fingerprint:oauth-access-token',
      metadata: {
        authType: 'oauth',
        oauth: {
          tokenType: 'Bearer',
          grantedScopes: ['ACTIVITY:READ'],
        },
      },
    });
    const apiKeyConnection = connection({
      credentialCiphertext: 'cipher:new-api-key',
      credentialFingerprint: 'fingerprint:new-api-key',
      credentialLast4: '-key',
      metadata: {
        authType: 'api_key',
        oauth: null,
      },
    });
    prisma.externalProviderConnection.findUnique
      .mockResolvedValueOnce(existingOAuthConnection)
      .mockResolvedValueOnce(apiKeyConnection);
    prisma.externalProviderConnection.upsert.mockResolvedValueOnce(
      apiKeyConnection,
    );
    intervalsIcuClient.getProfile.mockResolvedValueOnce({
      athlete: { id: 'athlete-99' },
    });

    await expect(
      service.connect('user-1', {
        apiKey: 'new-api-key',
        replaceCredentialConfirmed: true,
        syncActivities: false,
      }),
    ).resolves.toMatchObject({
      connected: true,
      authType: 'api_key',
      credentialLast4: '-key',
    });

    expect(prisma.externalProviderConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          credentialCiphertext: 'cipher:new-api-key',
          credentialLast4: '-key',
          credentialFingerprint: 'fingerprint:new-api-key',
          metadata: expect.objectContaining({
            authType: 'api_key',
            oauth: null,
          }),
        }),
      }),
    );
  });

  it('updates saved settings without replacing Intervals.icu credentials', async () => {
    const { intervalsIcuClient, prisma, service } = createService();
    const existingConnection = connection({
      credentialLast4: 'oken',
      syncWellness: false,
      exportActivities: false,
      exportWellness: false,
      syncSportSettings: false,
      metadata: {
        authType: 'oauth',
        oauth: {
          tokenType: 'Bearer',
          grantedScopes: ['ACTIVITY:WRITE'],
        },
        planSync: {
          syncPlannedWorkouts: true,
          exportPlannedWorkouts: false,
          lastCompletedAt: '2026-07-01T00:00:00.000Z',
        },
      },
    });
    const updatedConnection = {
      ...existingConnection,
      syncScheduledActivities: false,
      exportActivities: true,
      metadata: {
        ...((
          existingConnection as { metadata?: Record<string, unknown> }
        ).metadata ?? {}),
        planSync: {
          syncPlannedWorkouts: false,
          exportPlannedWorkouts: true,
          lastCompletedAt: '2026-07-01T00:00:00.000Z',
        },
      },
    };
    prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(
      existingConnection,
    );
    prisma.externalProviderConnection.update.mockResolvedValueOnce(
      updatedConnection,
    );

    await expect(
      service.updateSettings('user-1', {
        syncScheduledActivities: false,
        syncPlannedWorkouts: false,
        exportActivities: true,
        exportPlannedWorkouts: true,
      }),
    ).resolves.toMatchObject({
      connected: true,
      authType: 'oauth',
      syncScheduledActivities: false,
      exportActivities: true,
      syncPlannedWorkouts: false,
      exportPlannedWorkouts: true,
    });

    expect(prisma.externalProviderConnection.update).toHaveBeenCalledWith({
      where: { id: 'connection-1' },
      data: {
        syncScheduledActivities: false,
        syncWellness: false,
        exportActivities: true,
        exportWellness: false,
        syncSportSettings: false,
        exportSportSettings: false,
        metadata: expect.objectContaining({
          authType: 'oauth',
          planSync: {
            syncPlannedWorkouts: false,
            exportPlannedWorkouts: true,
            lastCompletedAt: '2026-07-01T00:00:00.000Z',
          },
        }),
      },
    });
    expect(intervalsIcuClient.getProfile).not.toHaveBeenCalled();
    expect(intervalsIcuClient.exchangeOAuthCode).not.toHaveBeenCalled();
    expect(prisma.externalProviderConnection.upsert).not.toHaveBeenCalled();
  });

  it('syncs recent activities, queues an import batch, and updates sync timestamps', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-06T10:30:00.000Z'));
    const {
      importBatchService,
      intervalsIcuClient,
      intervalsIcuCredentials,
      prisma,
      service,
    } = createService();
    const row = connection();
    const activities = [
      { id: 'activity-1', name: 'Run' },
      { id: 'activity-2', name: 'Ride' },
    ];
    prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(row);
    prisma.externalProviderConnection.update.mockResolvedValue({});
    intervalsIcuClient.listActivities.mockResolvedValueOnce(activities);
    importBatchService.createIntervalsIcuImportBatch.mockResolvedValueOnce({
      batch: { id: 'batch-1' },
      totalDiscovered: 2,
      queuedCount: 2,
      skippedCount: 0,
      directlyQueued: 2,
      routedToOrigin: 0,
      mirrorsCreated: 0,
      alreadyResolved: 0,
      duplicateOrRunning: 0,
    });

    try {
      await expect(
        service.syncLatest('user-1', { newest: '2026-07-06' }),
      ).resolves.toEqual({
        window: {
          oldest: '2026-05-07',
          newest: '2026-07-06',
        },
        totalFetched: 2,
        batch: { id: 'batch-1' },
        totalDiscovered: 2,
        queuedCount: 2,
        skippedCount: 0,
        directlyQueued: 2,
        routedToOrigin: 0,
        mirrorsCreated: 0,
        alreadyResolved: 0,
        duplicateOrRunning: 0,
        plannedWorkouts: null,
      });

      expect(prisma.externalProviderConnection.findUnique).toHaveBeenCalledWith(
        {
          where: {
            userId_provider: {
              userId: 'user-1',
              provider: 'intervals_icu',
            },
          },
        },
      );
      expect(prisma.externalProviderConnection.update).toHaveBeenNthCalledWith(
        1,
        {
          where: { id: 'connection-1' },
          data: {
            lastSyncStartedAt: new Date('2026-07-06T10:30:00.000Z'),
            lastError: null,
          },
        },
      );
      expect(intervalsIcuCredentials.decrypt).toHaveBeenCalledWith(
        'cipher-key',
      );
      expect(intervalsIcuClient.listActivities).toHaveBeenCalledWith(
        'plain:cipher-key',
        {
          oldest: '2026-05-07',
          newest: '2026-07-06',
        },
      );
      expect(
        importBatchService.createIntervalsIcuImportBatch,
      ).toHaveBeenCalledWith({
        userId: 'user-1',
        connectionId: 'connection-1',
        activities,
        reason: 'manual',
        discoveryWindow: {
          start: new Date('2026-05-06T00:00:00.000Z'),
          end: new Date('2026-07-08T00:00:00.000Z'),
        },
      });
      expect(prisma.externalProviderConnection.update).toHaveBeenNthCalledWith(
        2,
        {
          where: { id: 'connection-1' },
          data: {
            lastSyncCompletedAt: new Date('2026-07-06T10:30:00.000Z'),
            lastSyncedActivityAt: new Date('2026-07-06T00:00:00.000Z'),
            lastError: null,
          },
        },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('syncs wellness into provider-neutral health metrics when enabled', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-06T10:30:00.000Z'));
    const {
      healthDataIngest,
      importBatchService,
      intervalsIcuClient,
      prisma,
      service,
    } = createService();
    const row = connection({
      externalAthleteId: 'athlete-1',
      syncActivities: false,
      syncWellness: true,
      metadata: {},
    });
    prisma.externalProviderConnection.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ metadata: {} });
    prisma.externalProviderConnection.update.mockResolvedValue({});
    intervalsIcuClient.listActivities.mockResolvedValueOnce([]);
    importBatchService.createIntervalsIcuImportBatch.mockResolvedValueOnce({
      batch: null,
      totalDiscovered: 0,
      queuedCount: 0,
      skippedCount: 0,
      directlyQueued: 0,
      routedToOrigin: 0,
      mirrorsCreated: 0,
      alreadyResolved: 0,
      duplicateOrRunning: 0,
    });
    intervalsIcuClient.listWellness.mockResolvedValueOnce([
      {
        id: '2026-07-06',
        weight: 70,
        restingHR: 48,
        hrvSDNN: 52,
        sleepSecs: 28800,
        sleepScore: 81,
        avgSleepingHR: 55,
        steps: 10000,
      },
    ]);
    healthDataIngest.replaceProviderDailyCandidates.mockResolvedValueOnce({
      sampleCount: 7,
      projectedCount: 7,
      metricTypes: [
        'BODY_MASS_KG',
        'HRV_SDNN_MS',
        'RESTING_HEART_RATE_BPM',
        'SLEEP_ASLEEP_SECONDS',
        'SLEEP_AVG_HEART_RATE_BPM',
        'SLEEP_SCORE',
        'STEP_COUNT',
      ],
      dates: ['2026-07-06'],
    });

    try {
      await expect(
        service.syncLatest('user-1', { newest: '2026-07-06' }),
      ).resolves.toMatchObject({
        window: {
          oldest: '2026-05-07',
          newest: '2026-07-06',
        },
        totalFetched: 0,
        queuedCount: 0,
        wellness: {
          enabled: true,
          window: {
            oldest: '2026-05-07',
            newest: '2026-07-06',
          },
          totalFetched: 1,
          totalSamples: 7,
          projectedCount: 7,
        },
      });

      expect(intervalsIcuClient.listActivities).toHaveBeenCalled();
      expect(
        importBatchService.createIntervalsIcuImportBatch,
      ).toHaveBeenCalled();
      expect(intervalsIcuClient.listWellness).toHaveBeenCalledWith(
        'plain:cipher-key',
        expect.objectContaining({
          oldest: '2026-05-07',
          newest: '2026-07-06',
        }),
      );
      expect(
        healthDataIngest.replaceProviderDailyCandidates,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          provider: 'INTERVALS_ICU',
          connectionId: 'connection-1',
          localDate: new Date('2026-07-06T00:00:00.000Z'),
          candidates: expect.arrayContaining([
            expect.objectContaining({
              provider: 'INTERVALS_ICU',
              connectionId: 'connection-1',
              metricType: 'BODY_MASS_KG',
            }),
            expect.objectContaining({
              metricType: 'SLEEP_SCORE',
            }),
          ]),
        }),
      );
      expect(prisma.externalProviderConnection.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'connection-1' },
          data: expect.objectContaining({
            lastSyncCompletedAt: new Date('2026-07-06T10:30:00.000Z'),
            lastError: null,
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('notifies when sync completes with no new Intervals.icu activities', async () => {
    const {
      importBatchService,
      intervalsIcuClient,
      notificationDomain,
      prisma,
      service,
    } = createService();
    const row = connection();
    prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(row);
    prisma.externalProviderConnection.update.mockResolvedValue({});
    intervalsIcuClient.listActivities.mockResolvedValueOnce([
      { id: 'activity-1' },
    ]);
    importBatchService.createIntervalsIcuImportBatch.mockResolvedValueOnce({
      batch: null,
      totalDiscovered: 1,
      queuedCount: 0,
      skippedCount: 1,
      directlyQueued: 0,
      routedToOrigin: 0,
      mirrorsCreated: 0,
      alreadyResolved: 0,
      duplicateOrRunning: 1,
    });

    await expect(
      service.syncLatest('user-1', { newest: '2026-07-06' }),
    ).resolves.toMatchObject({
      batch: null,
      totalFetched: 1,
      queuedCount: 0,
      skippedCount: 1,
    });

    expect(notificationDomain.ensureNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      kind: 'IMPORT_BATCH_COMPLETED',
      dedupeKey:
        'intervals-icu-sync:connection-1:manual:2026-05-07:2026-07-06:no-new-activities',
      title: 'Intervals.icu sync completed',
      bodyMarkdown:
        'No new Intervals.icu activities to sync in the last 60 days.',
      data: {
        connectionId: 'connection-1',
        window: {
          oldest: '2026-05-07',
          newest: '2026-07-06',
        },
        totalFetched: 1,
        totalDiscovered: 1,
        queuedCount: 0,
        skippedCount: 1,
      },
      digestId: undefined,
    });
  });

  it('does not call a routed origin activity "no new activities"', async () => {
    const {
      importBatchService,
      intervalsIcuClient,
      notificationDomain,
      prisma,
      service,
    } = createService();
    prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(
      connection(),
    );
    prisma.externalProviderConnection.update.mockResolvedValue({});
    intervalsIcuClient.listActivities.mockResolvedValueOnce([
      { id: 'activity-1', source: 'STRAVA' },
    ]);
    importBatchService.createIntervalsIcuImportBatch.mockResolvedValueOnce({
      batch: null,
      totalDiscovered: 1,
      queuedCount: 0,
      skippedCount: 1,
      directlyQueued: 0,
      routedToOrigin: 1,
      mirrorsCreated: 0,
      alreadyResolved: 0,
      duplicateOrRunning: 0,
    });

    await service.syncLatest('user-1', { newest: '2026-07-06' });

    expect(notificationDomain.ensureNotification).not.toHaveBeenCalled();
  });

  it('marks the connection invalid when Intervals.icu rejects credentials', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { intervalsIcuClient, prisma, service } = createService();
    const row = connection();
    prisma.externalProviderConnection.findUnique.mockResolvedValueOnce(row);
    prisma.externalProviderConnection.update.mockResolvedValue({});
    intervalsIcuClient.listActivities.mockRejectedValueOnce(
      new IntervalsIcuApiError(401, 'unauthorized'),
    );

    try {
      await expect(service.syncLatest('user-1')).rejects.toThrow(
        'unauthorized',
      );

      expect(prisma.externalProviderConnection.update).toHaveBeenLastCalledWith(
        {
          where: { id: 'connection-1' },
          data: {
            status: 'INVALID',
            lastError: 'unauthorized',
          },
        },
      );
      expect(errorSpy).toHaveBeenCalledWith(
        '[Intervals.icu] 同步失败：unauthorized',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('does not couple scheduled activity sync to planned workout sync', async () => {
    const { intervalsIcuPlanSync, prisma, service } = createService();
    const row = connection({ syncScheduledActivities: false });
    intervalsIcuPlanSync.getPlanSyncFlags.mockReturnValueOnce({
      syncPlannedWorkouts: true,
      exportPlannedWorkouts: false,
    });
    prisma.externalProviderConnection.update.mockResolvedValue({});

    await expect(
      service.syncConnectionLatest({
        connection: row,
        reason: 'scheduled',
        timezone: 'Asia/Shanghai',
      }),
    ).resolves.toMatchObject({ plannedWorkouts: null });

    expect(intervalsIcuPlanSync.syncConnectionWeek).not.toHaveBeenCalled();
  });
});
