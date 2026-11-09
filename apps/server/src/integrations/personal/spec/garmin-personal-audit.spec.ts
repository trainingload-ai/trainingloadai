import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { GarminPersonalClient } from '../../garmin-personal/garmin-personal.client';
import { PersonalConnectionService } from '../personal-connection.service';
import { defaultPersonalSettings } from '../personal-connection.service';
import { PersonalSyncService } from '../personal-sync.service';
import { garminHealthProjection } from '../personal-health.mapper';
import { PersonalProviderError } from '../personal-errors';
import { garminPersonalActivity } from '@/importing/source-adapters/garmin-personal-activity';

const day = '2026-11-01';
const args = {
  day,
  timezone: 'Asia/Shanghai',
  accountId: '123',
  connectionId: 'c',
  sourceObjectId: 'source',
};
// Synthetic samples following official Personal OpenAPI 1.0.0, not private
// Connect endpoint payloads. No credentials or real athlete data are used.
const snapshot = {
  summary: {
    data: [
      {
        calendarDate: day,
        movement: { steps: { value: 1200, distanceInMeters: 930 } },
        heartRate: { restingValue: 52 },
        calories: { burnedActive: 100 },
        bodyBattery: { chargedValue: 65 },
      },
    ],
  },
  sleep: {
    calendarDate: day,
    sleepTimeSeconds: 26000,
    sleepScores: { overall: { value: 80 } },
  },
  hrv: { hrvSummary: { calendarDate: day, lastNightAvg: 45 } },
  bodyBattery: [{ date: day, charged: 64, drained: 32 }],
  spo2: { calendarDate: day, averageSpO2: 97, lowestSpO2: 92 },
  weight: [{ calendarDate: day, weight: 72.5, timestampGMT: `${day}T08:00:00.000Z` }],
};
const connection = {
  id: 'c',
  userId: 'owner',
  provider: 'garmin',
  externalAthleteId: '123',
  credentialFingerprint: 'v1',
  syncActivities: true,
  syncWellness: true,
  metadata: {
    connectionMode: 'personal_api',
    region: 'cn',
    settings: { timezone: 'Asia/Shanghai' },
  },
};
function harness() {
  const jobs = {
    findMany: jest.fn<any>().mockResolvedValue([]),
    findUnique: jest.fn<any>().mockResolvedValue(null),
    create: jest.fn<any>().mockImplementation(async (a: any) => ({
      id: a.data.requestId,
      status: 'QUEUED',
      ...a.data,
    })),
    update: jest.fn<any>().mockResolvedValue({}),
    updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    upsert: jest.fn<any>().mockResolvedValue({ id: 'sync', status: 'QUEUED' }),
  };
  const db = {
    personalProviderJob: jobs,
    importSourceObject: {
      upsert: jest.fn<any>().mockResolvedValue({ id: 'source' }),
    },
    externalProviderConnection: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  };
  const connections = {
    require: jest.fn<any>().mockResolvedValue(connection),
    resolveAccountTimezone: jest.fn<any>().mockResolvedValue(args.timezone),
    authorized: jest
      .fn<any>()
      .mockImplementation(async (_: string, fn: any) =>
        fn(connection, 'fixture-token'),
      ),
  };
  const garmin = {
    activities: jest.fn<any>().mockResolvedValue([]),
    get: jest.fn<any>().mockResolvedValue({ activityId: 1, summaryDTO: {} }),
    download: jest.fn<any>(),
  };
  const imports = {
    createExternalProviderImportBatch: jest
      .fn<any>()
      .mockResolvedValue({ batch: { id: 'batch' } }),
  };
  const health = {
    replaceProviderDailyCandidates: jest
      .fn<any>()
      .mockResolvedValue({ sampleCount: 1 }),
  };
  const lifecycle = {
    deactivateProviderData: jest.fn<any>().mockResolvedValue({}),
  };
  const service = new PersonalSyncService(
    db as never,
    connections as never,
    garmin as never,
    imports as never,
    {} as never,
    health as never,
    {} as never,
    lifecycle as never,
    { upsertImportedZoneSetting: jest.fn<any>().mockResolvedValue({}) } as never,
  );
  const parent = {
    id: 'sync',
    kind: 'SYNC',
    leaseUntil: new Date(Date.now() + 60000),
    payload: {
      startDate: day,
      endDate: day,
      credentialVersion: 'v1',
      settings: { timezone: args.timezone },
    },
    result: {
      cursor: day,
      activityDone: false,
      healthDone: true,
      childIds: [],
    },
  };
  const wellness = {
    id: 'health',
    kind: 'HEALTH',
    leaseUntil: parent.leaseUntil,
    payload: { day, timezone: args.timezone, credentialVersion: 'v1' },
    result: {},
  };
  const readSnapshot = () =>
    garmin.get.mockImplementation(async (_r: any, _t: any, path: string) => {
      if (path.includes('dailysummaries')) return snapshot.summary;
      if (path.includes('/sleep/')) return snapshot.sleep;
      if (path.includes('/hrv/')) return snapshot.hrv;
      if (path.includes('/bodyBattery/')) return snapshot.bodyBattery;
      if (path.includes('/spo2')) return snapshot.spo2;
      if (path.includes('/weight/all/')) return snapshot.weight;
      throw new Error('Unexpected request');
    });
  return {
    jobs,
    db,
    connections,
    garmin,
    imports,
    health,
    lifecycle,
    service,
    parent,
    wellness,
    readSnapshot,
  };
}
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Garmin official response contracts', () => {
  it('projects nested V2 summary, direct sleep, and kg with durable provenance', () => {
    const mapped = garminHealthProjection({ ...args, ...snapshot });
    const values = Object.fromEntries(
      mapped.candidates.map((v) => [v.metricType, v.value]),
    );
    expect(values).toMatchObject({
      STEP_COUNT: 1200,
      RESTING_HEART_RATE_BPM: 52,
      SLEEP_ASLEEP_SECONDS: 26000,
      SLEEP_SCORE: 80,
      HRV_RMSSD_MS: 45,
      BODY_MASS_KG: 72.5,
      BODY_BATTERY_CHARGED: 64,
    });
    expect(
      mapped.candidates.every(
        (v) =>
          v.sourceObjectId === 'source' &&
          v.startTime.toISOString() === '2026-10-31T16:00:00.000Z',
      ),
    ).toBe(true);
    expect(values).not.toHaveProperty('TRAINING_READINESS');
  });
  it('separates unavailable resources from authoritative empty data', () => {
    expect(garminHealthProjection(args).managedMetricTypes).toEqual([]);
    const empty = garminHealthProjection({ ...args, sleep: null, hrv: null });
    expect(empty.candidates).toEqual([]);
    expect(empty.managedMetricTypes).toEqual(
      expect.arrayContaining(['SLEEP_ASLEEP_SECONDS', 'HRV_RMSSD_MS']),
    );
    expect(empty.managedMetricTypes).not.toContain('STEP_COUNT');
  });
  it('rejects unrecognized legacy grams and wrapped sleep instead of silently writing wrong values', () => {
    expect(() =>
      garminHealthProjection({
        ...args,
        weight: { dateWeightList: [{ weight: 72000 }] },
      }),
    ).toThrow('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    expect(() =>
      garminHealthProjection({
        ...args,
        sleep: { dailySleepDTO: snapshot.sleep },
      }),
    ).toThrow('PROVIDER_HEALTH_DATE_MISSING');
    expect(() =>
      garminHealthProjection({
        ...args,
        summary: { data: [{ calendarDate: day, totalSteps: 100 }] },
      }),
    ).toThrow('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
  });
  it.each(['sleep', 'spo2'] as const)(
    'rejects the wrong local day in %s',
    (key) => {
      expect(() =>
        garminHealthProjection({
          ...args,
          [key]: { ...snapshot[key], calendarDate: '2026-10-31' },
        }),
      ).toThrow('PROVIDER_HEALTH_DATE_MISMATCH');
    },
  );
  it('rejects duplicate daily rows and string-valued metrics', () => {
    expect(() =>
      garminHealthProjection({
        ...args,
        summary: { data: [snapshot.summary.data[0], snapshot.summary.data[0]] },
      }),
    ).toThrow('PROVIDER_HEALTH_CONFLICT');
    expect(() =>
      garminHealthProjection({
        ...args,
        sleep: { calendarDate: day, sleepTimeSeconds: '26000' },
      }),
    ).toThrow('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
  });
  it('does not treat unknown nested groups or malformed measurements as an empty day', () => {
    expect(() =>
      garminHealthProjection({
        ...args,
        summary: { data: [{ calendarDate: day, movement: { steps: 123 } }] },
      }),
    ).toThrow('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    expect(() =>
      garminHealthProjection({
        ...args,
        bodyBattery: [{ date: day, newLayout: 50 }],
      }),
    ).toThrow('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    expect(() =>
      garminHealthProjection({
        ...args,
        weight: {
          dailyWeightSummaries: [{ summaryDate: day, numOfWeightEntries: 2 }],
        },
      }),
    ).toThrow('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
  });
  it('does not substitute adjacent weight context for a missing daily weight', () => {
    const result = garminHealthProjection({
      ...args,
      weight: { dailyWeightSummaries: [], previousDateWeight: { weight: 73 } },
    });
    expect(result).toEqual({
      candidates: [],
      managedMetricTypes: ['BODY_MASS_KG'],
    });
  });
  it('applies vendor edits using UTC without a container-timezone assumption', () => {
    const result = garminPersonalActivity(
      { totalDistance: 1000 } as never,
      {
        activityName: 'Edited name',
        timeZoneUnitDTO: { timeZone: 'Asia/Shanghai' },
        summaryDTO: {
          distance: 1200,
          elapsedDuration: 600,
          startTimeGMT: '2026-10-31T16:05:00.000',
        },
      },
      true,
    );
    expect(result).toMatchObject({
      activityName: 'Edited name',
      totalDistance: 1200,
      timezone: 'Asia/Shanghai',
      startTime: new Date('2026-10-31T16:05:00Z'),
      endTime: new Date('2026-10-31T16:15:00Z'),
    });
    expect(
      garminPersonalActivity(
        { totalDistance: 500 } as never,
        { summaryDTO: { distance: 1200 } },
        false,
      ).totalDistance,
    ).toBe(500);
  });
});

describe('Garmin transport and connection lifecycle', () => {
  it.each(['https://evil.example/x', '//evil.example/x', '/\\evil.example/x'])(
    'rejects a credential destination %s before fetch',
    async (path) => {
      const fetch = jest.spyOn(globalThis, 'fetch');
      await expect(
        new GarminPersonalClient().get('cn', 'fixture-token', path),
      ).rejects.toMatchObject({ code: 'PROVIDER_RESOURCE_UNKNOWN' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('uses documented authenticated identity instead of assuming settings contains an ID', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          displayName: 'Fixture owner',
          timeZone: 'Asia/Shanghai',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ userProfileId: 123, calendarDate: day }),
      );
    expect(
      (
        await new GarminPersonalClient().profile(
          'cn',
          'fixture-token',
          'Asia/Shanghai',
        )
      ).accountId,
    ).toBe('123');
    expect(String(fetch.mock.calls[1][0])).toContain(
      '/usersummary-service/usersummary/daily?calendarDate=',
    );
  });
  it.each([
    [403, 'PROVIDER_FORBIDDEN'],
    [404, 'PROVIDER_NOT_FOUND'],
  ] as const)(
    'does not classify %s as an expired token',
    async (status, code) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('upstream private data', { status }));
      await expect(
        new GarminPersonalClient().get(
          'cn',
          'fixture-token',
          '/sleep-service/sleep/dailySleep',
        ),
      ).rejects.toMatchObject({ code });
    },
  );
  it('reuses a token already renewed by another worker after a stale 401', async () => {
    const row = {
      ...connection,
      status: 'ACTIVE',
      credentialCiphertext: 'sealed',
    };
    const exchange = jest.fn<any>();
    const tx = {
      $queryRaw: async () => [{ locked: true }],
      externalProviderConnection: { findUnique: async () => row },
    };
    const service = new PersonalConnectionService(
      { $transaction: async (fn: any) => fn(tx) } as never,
      {
        decrypt: () =>
          JSON.stringify({
            apiKey: 'fixture-key',
            token: 'new-token',
            expiresAt: Date.now() + 3600000,
          }),
      } as never,
      {} as never,
      { exchange } as never,
      {} as never,
    );
    expect((await service.credential('c', true, 'old-token')).token).toBe(
      'new-token',
    );
    expect(exchange).not.toHaveBeenCalled();
  });
  it('can disconnect Garmin even with an undecryptable old secret', async () => {
    const remove = jest.fn<any>().mockResolvedValue({ count: 1 });
    const decrypt = jest.fn<any>().mockImplementation(() => {
      throw new Error('damaged cipher');
    });
    const service = new PersonalConnectionService(
      {
        externalProviderConnection: {
          findUnique: async () => connection,
        },
        $transaction: async (fn: any) =>
          fn({
            $executeRaw: async () => 1,
            externalProviderConnection: { updateMany: remove },
            personalProviderJob: { updateMany: async () => ({ count: 1 }) },
          }),
      } as never,
      { decrypt } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.disconnect('owner', 'garmin')).resolves.toEqual({
      disconnected: true,
      revoked: true,
    });
    expect(decrypt).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c', credentialFingerprint: 'v1' },
        data: expect.objectContaining({
          status: 'DISCONNECTED',
          credentialCiphertext: '',
          credentialLast4: null,
        }),
      }),
    );
  });
  it('does not delete a concurrently replaced connection', async () => {
    const service = new PersonalConnectionService(
      {
        externalProviderConnection: {
          findUnique: async () => connection,
        },
        $transaction: async (fn: any) =>
          fn({
            $executeRaw: async () => 1,
            externalProviderConnection: {
              updateMany: async () => ({ count: 0 }),
            },
          }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.disconnect('owner', 'garmin')).rejects.toThrow(
      'PROVIDER_CONNECTION_CHANGED',
    );
  });
});

describe('Garmin discovery and authoritative absence', () => {
  it('returns a completed request status without showing a new queue or moving the sync clock', async () => {
    const h = harness();
    h.jobs.upsert.mockResolvedValue({
      id: 'sync',
      status: 'SUCCEEDED',
      payload: {
        startDate: day,
        endDate: day,
        trigger: 'manual',
        credentialVersion: 'v1',
        settings: { ...defaultPersonalSettings, timezone: args.timezone },
      },
    });
    expect(
      await h.service.enqueue('owner', 'garmin', {
        startDate: day,
        endDate: day,
      }),
    ).toEqual({ status: 'SUCCEEDED', jobId: 'sync' });
    expect(h.db.externalProviderConnection.updateMany).not.toHaveBeenCalled();
  });
  it('rejects a reused request ID for a different range before changing connection state', async () => {
    const h = harness();
    h.jobs.upsert.mockResolvedValue({
      id: 'sync',
      status: 'QUEUED',
      payload: {
        startDate: '2026-10-01',
        endDate: day,
        credentialVersion: 'v1',
      },
    });
    await expect(
      h.service.enqueue('owner', 'garmin', { startDate: day, endDate: day }),
    ).rejects.toThrow('PROVIDER_REQUEST_CONFLICT');
    expect(h.db.externalProviderConnection.updateMany).not.toHaveBeenCalled();
  });
  it('waits for the last page before evaluating absence', async () => {
    const h = harness();
    const page = Array.from({ length: 99 }, (_, i) => ({ id: String(i) }));
    h.garmin.activities.mockResolvedValue(page);
    await h.service.run(h.parent as never, connection as never);
    expect(h.jobs.findMany).not.toHaveBeenCalled();
    const progress = h.jobs.updateMany.mock.calls.at(-1)![0].data.result;
    expect(progress).toMatchObject({
      offset: 99,
      dayIds: page.map((v) => v.id),
      activityDone: false,
    });
    h.garmin.activities.mockResolvedValue([{ id: '99' }]);
    h.jobs.findMany.mockResolvedValue([
      { id: 'existing', payload: { id: '0', day }, result: {} },
    ]);
    await h.service.run(
      { ...h.parent, result: progress } as never,
      connection as never,
    );
    expect(h.lifecycle.deactivateProviderData).not.toHaveBeenCalled();
    expect(h.jobs.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'existing' }),
      }),
    );
  });
  it('discovers a multi-day Garmin range with one full-window query, not per-day calls', async () => {
    const h = harness();
    h.parent.payload = {
      ...h.parent.payload,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    };
    h.parent.result = {
      ...h.parent.result,
      cursor: '2026-01-01',
    };
    h.garmin.activities.mockResolvedValue([
      { id: '7', title: 'A', day: '2026-01-10' },
    ]);
    await h.service.run(h.parent as never, connection as never);
    expect(h.garmin.activities).toHaveBeenCalledTimes(1);
    expect(h.garmin.activities.mock.calls[0].slice(2)).toEqual([
      '2026-01-01',
      '2026-01-31',
      0,
    ]);
    const progress = h.jobs.updateMany.mock.calls.at(-1)![0].data.result;
    expect(progress).toMatchObject({
      activityDone: true,
      discovered: 1,
      offset: 0,
      dayIds: [],
    });
    expect(h.jobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({ id: '7', day: '2026-01-10' }),
        }),
      }),
    );
  });
  it('fails overlapping/repeated pagination and never infers deletion', async () => {
    const h = harness();
    h.garmin.activities.mockResolvedValue([{ id: '1' }]);
    await expect(
      h.service.run(
        {
          ...h.parent,
          result: { ...h.parent.result, offset: 99, dayIds: ['1'] },
        } as never,
        connection as never,
      ),
    ).rejects.toThrow('PROVIDER_WINDOW_INCOMPLETE');
    expect(h.lifecycle.deactivateProviderData).not.toHaveBeenCalled();
  });
  it('bounds a day rather than looping forever on an ignoring server', async () => {
    const h = harness();
    await expect(
      h.service.run(
        { ...h.parent, result: { ...h.parent.result, offset: 9900 } } as never,
        connection as never,
      ),
    ).rejects.toThrow('PROVIDER_WINDOW_INCOMPLETE');
    expect(h.garmin.activities).not.toHaveBeenCalled();
  });
  it('keeps twice-missing Garmin sources reversible without activity detail lookups', async () => {
    const h = harness();
    h.jobs.findMany.mockResolvedValue([
      {
        id: 'old',
        status: 'SUCCEEDED',
        payload: { id: '42', day },
        result: {
          missingSince: new Date(Date.now() - 3600000).toISOString(),
        },
      },
    ]);
    await h.service.run(h.parent as never, connection as never);
    expect(h.garmin.get).not.toHaveBeenCalled();
    expect(h.lifecycle.deactivateProviderData).not.toHaveBeenCalled();
  });
  it('skips already-imported SUCCEEDED sources instead of re-pulling FIT', async () => {
    const h = harness();
    h.garmin.activities.mockResolvedValue([{ id: '1', title: 'Renamed' }]);
    h.jobs.findUnique.mockResolvedValue({
      id: 'activity',
      status: 'SUCCEEDED',
      result: { imported: 1 },
    });
    await h.service.run(h.parent as never, connection as never);
    expect(h.jobs.update).not.toHaveBeenCalled();
    const progress = h.jobs.updateMany.mock.calls.at(-1)![0].data.result;
    expect(progress.childIds).toEqual(['activity']);
    expect(progress.discovered).toBe(1);
  });
  it('clears the old batch/file cache on revalidation without activity detail', async () => {
    const h = harness();
    await h.service.run(
      {
        id: 'activity',
        kind: 'ACTIVITY',
        leaseUntil: h.parent.leaseUntil,
        payload: { id: '1' },
        result: {
          imported: 1,
          batchId: 'old',
          fileKey: 'old',
          validateRemote: true,
        },
      } as never,
      connection as never,
    );
    const result = h.jobs.updateMany.mock.calls.at(-1)![0].data.result;
    expect(h.garmin.get).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      validateRemote: false,
      detailChanged: true,
      remoteDetail: null,
    });
    expect(result.batchId).toBeUndefined();
    expect(result.fileKey).toBeUndefined();
  });
});

describe('Garmin durable health and execution settings', () => {
  it('does not run a task after its lease expires', async () => {
    const h = harness();
    await expect(
      h.service.run(
        { ...h.wellness, leaseUntil: new Date(Date.now() - 1) } as never,
        connection as never,
      ),
    ).rejects.toThrow('PROVIDER_LEASE_LOST');
    expect(h.garmin.get).not.toHaveBeenCalled();
    expect(h.db.importSourceObject.upsert).not.toHaveBeenCalled();
  });
  it('does not write fetched health data when its lease expires during the read', async () => {
    jest.useFakeTimers();
    const h = harness();
    h.readSnapshot();
    const work = h.garmin.get.getMockImplementation()!;
    h.garmin.get.mockImplementation(async (...a: any[]) => {
      jest.setSystemTime(new Date(h.wellness.leaseUntil.getTime() + 1));
      return work(...a);
    });
    await expect(
      h.service.run(h.wellness as never, connection as never),
    ).rejects.toThrow('PROVIDER_LEASE_LOST');
    expect(h.db.importSourceObject.upsert).not.toHaveBeenCalled();
    expect(h.health.replaceProviderDailyCandidates).not.toHaveBeenCalled();
  });
  it('stops the resource loop on rate limiting and retains the retry delay', async () => {
    const h = harness();
    h.garmin.get.mockRejectedValue(
      new PersonalProviderError('PROVIDER_RATE_LIMITED', 120000),
    );
    await expect(
      h.service.run(h.wellness as never, connection as never),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      retryAfterMs: 120000,
    });
    expect(h.garmin.get).toHaveBeenCalledTimes(1);
    expect(
      h.health.replaceProviderDailyCandidates.mock.calls[0][0]
        .managedMetricTypes,
    ).toEqual([]);
    expect(h.jobs.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });
  it('stores versioned raw evidence outside jobs and scopes authoritative projection to this account/day', async () => {
    const h = harness();
    h.readSnapshot();
    await h.service.run(h.wellness as never, connection as never);
    expect(h.db.importSourceObject.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceKind: 'GARMIN_PERSONAL_API',
          objectType: 'HEALTH',
          sourceUid: expect.stringMatching(
            /^garmin:cn:123:health:2026-11-01:[a-f0-9]{64}$/,
          ),
          rawPayload: expect.objectContaining({ snapshot }),
        }),
      }),
    );
    expect(h.health.replaceProviderDailyCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'GARMIN',
        externalIdPrefix: 'cn:123:2026-11-01:',
        connectionId: 'c',
        candidates: expect.arrayContaining([
          expect.objectContaining({
            metricType: 'BODY_MASS_KG',
            value: 72.5,
            sourceObjectId: 'source',
          }),
        ]),
      }),
    );
    expect(h.jobs.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });
  it('imports available data but preserves old HRV on a forbidden resource and reports partial failure', async () => {
    const h = harness();
    h.readSnapshot();
    const work = h.garmin.get.getMockImplementation()!;
    h.garmin.get.mockImplementation(async (...a: any[]) => {
      if (a[2].includes('/hrv/'))
        throw new PersonalProviderError('PROVIDER_FORBIDDEN');
      return work(...a);
    });
    await expect(
      h.service.run(h.wellness as never, connection as never),
    ).rejects.toThrow('PROVIDER_FORBIDDEN');
    const mapped = h.health.replaceProviderDailyCandidates.mock.calls[0][0];
    expect(mapped.managedMetricTypes).not.toContain('HRV_RMSSD_MS');
    expect(mapped.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metricType: 'STEP_COUNT', value: 1200 }),
      ]),
    );
    expect(h.jobs.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });
  it('preserves wrong-date raw data but does not project it or erase existing sleep', async () => {
    const h = harness();
    h.readSnapshot();
    const work = h.garmin.get.getMockImplementation()!;
    h.garmin.get.mockImplementation(async (...a: any[]) =>
      a[2].includes('/sleep/')
        ? { ...snapshot.sleep, calendarDate: '2026-10-31' }
        : work(...a),
    );
    await expect(
      h.service.run(h.wellness as never, connection as never),
    ).rejects.toThrow('PROVIDER_HEALTH_DATE_MISMATCH');
    expect(h.db.importSourceObject.upsert).toHaveBeenCalled();
    expect(
      h.health.replaceProviderDailyCandidates.mock.calls[0][0]
        .managedMetricTypes,
    ).not.toContain('SLEEP_ASLEEP_SECONDS');
  });
  it.each(['ACTIVITY', 'HEALTH'])(
    'cancels a queued %s after its direction is disabled',
    async (kind) => {
      const h = harness();
      await h.service.run(
        { ...h.wellness, kind } as never,
        { ...connection, syncActivities: false, syncWellness: false } as never,
      );
      expect(h.garmin.get).not.toHaveBeenCalled();
      expect(
        h.imports.createExternalProviderImportBatch,
      ).not.toHaveBeenCalled();
      expect(h.jobs.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    },
  );
  it('refuses an old timezone task after account settings change', async () => {
    const h = harness();
    await expect(
      h.service.run(
        {
          ...h.wellness,
          payload: { ...h.wellness.payload, timezone: 'UTC' },
        } as never,
        connection as never,
      ),
    ).rejects.toThrow('PROVIDER_CONNECTION_CHANGED');
    expect(h.garmin.get).not.toHaveBeenCalled();
  });
  it('does not persist a fetched snapshot into a concurrently replaced connection', async () => {
    const h = harness();
    h.readSnapshot();
    h.connections.require.mockResolvedValue({
      ...connection,
      credentialFingerprint: 'v2',
    });
    await expect(
      h.service.run(h.wellness as never, connection as never),
    ).rejects.toThrow('PROVIDER_CONNECTION_CHANGED');
    expect(h.db.importSourceObject.upsert).not.toHaveBeenCalled();
    expect(h.health.replaceProviderDailyCandidates).not.toHaveBeenCalled();
  });
});
