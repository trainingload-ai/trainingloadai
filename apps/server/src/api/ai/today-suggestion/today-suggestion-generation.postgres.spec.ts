import { createAiFallbackI18n } from '../spec/ai-fallback-i18n.test-util';
import {
  ExternalProviderWebhookInboxService,
  webhookContentChecksum,
} from '@/integrations/external-provider/external-provider-webhook-inbox.service';
import { CoachRunStore } from '../coach-run-store.service';
import {
  TodaySuggestionGuidanceService,
  TodaySuggestionGuidanceLifecycle,
} from './today-suggestion-guidance.service';
import { HealthDataIngestService } from '@/health-data/health-data-ingest.service';
import { HealthDataRepository } from '@/health-data/persistence/health-data.repository';
import { HealthDataQueryService } from '@/health-data/health-data-query.service';
import { PrismaAthleteMemoryStore } from '@/athlete-memory/infrastructure/persistence/prisma-athlete-memory.store';
import { AmbientMemoryContextService } from '@/athlete-memory/application/ambient-memory-context.service';
import { AthleteMemoryQueryService } from '@/athlete-memory/application/athlete-memory-query.service';
import { CoachFactContextService } from '../core/coach-fact-context.service';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { TodaySuggestionGenerationService } from './today-suggestion-generation.service';
import { TodaySuggestionOrchestratorService } from './today-suggestion-orchestrator.service';
import { TodaySuggestionDeliveryPolicy } from './today-suggestion-delivery-policy';

const url = process.env.COACH_FACT_TEST_DATABASE_URL;
const scenarios = url ? describe : describe.skip;
scenarios('Today advice generation across instances on PostgreSQL', () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? 'postgresql://invalid/unused',
  });
  const other = new PrismaClient({
    datasourceUrl: url ?? 'postgresql://invalid/unused',
  });
  const owner = new TodaySuggestionGenerationService(db as never);
  const peer = new TodaySuggestionGenerationService(other as never);
  const users: string[] = [];
  async function scope() {
    const userId = `today-fact-${randomUUID()}`;
    users.push(userId);
    await db.t_user.create({
      data: {
        id: userId,
        name: 'Fixture',
        email: `${userId}@fixtures.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return { userId, locale: 'zh', date: '2026-11-18', inputHash: 'facts-v1' };
  }
  beforeAll(() => {
    const target = new URL(url!);
    if (
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      !target.pathname.startsWith('/coach_fact_test')
    )
      throw new Error('Dedicated local test database required');
  });
  afterAll(async () => {
    await db.t_user.deleteMany({ where: { id: { in: users } } });
    await Promise.all([db.$disconnect(), other.$disconnect()]);
  });

  it('keeps temporary references independent across device timezones and resolves each against the current local day', async () => {
    const input = await scope();
    const eastReferences = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? owner : peer).contextToken(input.userId, 'Asia/Shanghai'),
      ),
    );
    expect(new Set(eastReferences).size).toBe(1);
    const east = eastReferences[0];
    const west = await peer.contextToken(input.userId, 'America/Los_Angeles');
    expect(east).not.toBe(west);
    expect(await peer.contextToken(input.userId, 'Asia/Shanghai')).toBe(east);
    let at = new Date('2026-11-17T20:00:00Z');
    const projector = {
      project: async (args: any) => {
        const timezone = args.timezone ?? 'UTC';
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(at);
        return {
          ...input,
          date,
          timezone,
          factHash: `${timezone}:${date}`,
          constraintHash: 'constraints',
          allowAi: true,
          featureAllowed: true,
          lightContext: {
            sharedFacts: {
              revision: `${timezone}:${date}`,
              status: 'AVAILABLE',
            },
          },
          todayWorkouts: [],
          tomorrowWorkouts: [],
        };
      },
    };
    const resolver = new TodaySuggestionGuidanceService(
      other as never,
      projector as never,
      new TodaySuggestionGuidanceLifecycle(new CoachRunStore(other as never)),
    );
    expect(
      (await resolver.resolve(input.userId, east)).context?.currentFacts.date,
    ).toBe('2026-11-18');
    expect(
      (await resolver.resolve(input.userId, west)).context?.currentFacts.date,
    ).toBe('2026-11-17');
    expect((await resolver.resolve(input.userId, east)).scope?.timezone).toBe(
      'Asia/Shanghai',
    );
    await expect(resolver.resolve('another-user', east)).rejects.toThrow(
      'TODAY_GUIDANCE_NOT_FOUND',
    );
    at = new Date('2026-11-18T20:00:00Z');
    expect(
      (await resolver.resolve(input.userId, east)).context?.currentFacts.date,
    ).toBe('2026-11-19');
    const lease = await owner.claim(input);
    const legacy = await db.todaySuggestionGeneration.findUniqueOrThrow({
      where: { userId: input.userId },
    });
    expect(
      (await resolver.resolve(input.userId, legacy.contextToken)).scope
        ?.timezone,
    ).toBe('UTC');
    if (lease.kind === 'ACQUIRED') await owner.release(lease.lease);
  });
  it('retains distinct same-time webhook revisions while deduplicating exact retries across instances', async () => {
    const input = await scope();
    const inbox = new ExternalProviderWebhookInboxService(db as never);
    const second = new ExternalProviderWebhookInboxService(other as never);
    const firstPayload = {
      id: '42',
      type: 'ACTIVITY_ANALYZED',
      event_time: 100,
      updates: { title: 'first' },
    };
    const key = (payload: unknown) =>
      `${input.userId}:authorization-v1:${webhookContentChecksum(payload)}`;
    const enqueue = (
      service: ExternalProviderWebhookInboxService,
      payload: typeof firstPayload,
    ) =>
      service.enqueue({
        provider: 'intervals_icu',
        eventType: 'ACTIVITY_ANALYZED',
        externalUserId: input.userId,
        dedupeKey: key(payload),
        payload,
      });
    try {
      const retries = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          enqueue(i % 2 ? inbox : second, firstPayload),
        ),
      );
      expect(retries.filter((result) => result.enqueued)).toHaveLength(1);
      expect(new Set(retries.map((result) => result.eventId)).size).toBe(1);
      await enqueue(second, {
        ...firstPayload,
        updates: { title: 'corrected' },
      });
      expect(
        await db.externalProviderWebhookEvent.count({
          where: { externalUserId: input.userId },
        }),
      ).toBe(2);
      const claims = (
        await Promise.all([
          inbox.claim('intervals_icu'),
          second.claim('intervals_icu'),
        ])
      )
        .flat()
        .filter((row) => row.external_user_id === input.userId);
      expect(claims).toHaveLength(2);
      expect(new Set(claims.map((row) => row.id)).size).toBe(2);
    } finally {
      await db.externalProviderWebhookEvent.deleteMany({
        where: { externalUserId: input.userId },
      });
    }
  });
  it('reads completed daily health projections through audit-only writes and withholds a source correction until reprojection', async () => {
    const input = await scope();
    const repository = new HealthDataRepository(db as never);
    const ingestion = new HealthDataIngestService(db as never, repository, {
      requestUpdate: async () => ({}),
    } as never);
    const query = new HealthDataQueryService(
      {} as never,
      repository,
      {} as never,
    );
    const candidate = {
      provider: 'INTERVALS_ICU' as const,
      metricType: 'SLEEP_ASLEEP_SECONDS',
      externalId: 'sleep-fixture',
      localDate: new Date('2026-11-18'),
      startTime: new Date('2026-11-17T23:00Z'),
      endTime: new Date('2026-11-18T02:00Z'),
      value: 10800,
      unit: 's',
    };
    await ingestion.ingestCandidate({ userId: input.userId, candidate });
    const first = await query.getCoachingFacts(input.userId, '2026-11-18');
    expect(first.observations[0].value).toBe(10800);
    expect(first.pending).toEqual([]);
    expect(first.observations[0].readiness.permitsCompleteNightClaim).toBe(
      false,
    );
    await db.externalHealthSample.updateMany({
      where: { userId: input.userId },
      data: { value: 25200 },
    });
    const interim = await query.getCoachingFacts(input.userId, '2026-11-18');
    expect(interim.observations).toEqual([]);
    expect(interim.pending).toHaveLength(1);
    await ingestion.ingestCandidate({
      userId: input.userId,
      candidate: { ...candidate, value: 25200 },
    });
    expect(
      (await query.getCoachingFacts(input.userId, '2026-11-18')).observations[0]
        .value,
    ).toBe(25200);
    await ingestion.upsertExternalSample({
      userId: input.userId,
      candidate: { ...candidate, externalId: 'late-new-source', value: 18000 },
    });
    const unbound = await query.getCoachingFacts(input.userId, '2026-11-18');
    expect(unbound.observations).toEqual([]);
    expect(
      unbound.pending.some(
        (item) => item.reason === 'DAILY_PROJECTION_PENDING',
      ),
    ).toBe(true);
  });
  it('preserves the daily fact identity across replay, correction, withdrawal and restoration', async () => {
    const { userId, date } = await scope();
    const repo = new HealthDataRepository(db as never);
    const ingest = new HealthDataIngestService(db as never, repo, {
      requestUpdate: async () => {},
    } as never);
    const query = new HealthDataQueryService({} as never, repo, {} as never);
    const localDate = new Date(date);
    const metricType = 'SLEEP_ASLEEP_SECONDS';
    const externalId = 'intervals:fact-versions:sleep';
    const write = (hour: number, value?: number) => {
      const sourceRevision = new Date(Date.UTC(2026, 10, 18, hour));
      return ingest.replaceProviderDailyCandidates({
        userId,
        provider: 'INTERVALS_ICU',
        localDate,
        managedMetricTypes: [metricType],
        sourceRevision,
        withdrawals: value === undefined ? [{ metricType, externalId }] : [],
        candidates:
          value === undefined
            ? []
            : [
                {
                  provider: 'INTERVALS_ICU',
                  metricType,
                  externalId,
                  localDate,
                  startTime: localDate,
                  endTime: new Date(localDate.getTime() + 86_400_000),
                  sourceUpdatedAt: sourceRevision,
                  value,
                  unit: 's',
                },
              ],
      });
    };
    const read = () => query.getCoachingFacts(userId, date);

    await write(8, 10_800);
    const first = (await read()).observations[0];
    const firstProjection = await repo.dailyMetrics().findUnique({
      where: { id: first.key },
      select: { computedAt: true },
    });
    expect(first).toMatchObject({ value: 10_800, factVersion: 1 });
    await write(9, 10_800);
    expect((await read()).observations[0]).toEqual(first);
    expect(
      await repo.dailyMetrics().findUnique({
        where: { id: first.key },
        select: { computedAt: true },
      }),
    ).toEqual(firstProjection);
    await write(10, 25_200);
    expect((await read()).observations[0]).toMatchObject({
      key: first.key,
      value: 25_200,
      factVersion: 2,
    });

    await write(11);
    await write(12);
    const withdrawn = await read();
    expect(withdrawn.observations).toEqual([]);
    expect(withdrawn.withdrawn).toEqual([
      { key: first.key, date, metric: metricType, factVersion: 3 },
    ]);
    await write(13, 25_200);
    const restored = await read();
    expect(restored.withdrawn).toEqual([]);
    expect(restored.observations[0]).toMatchObject({
      key: first.key,
      value: 25_200,
      factVersion: 4,
    });
    expect(await query.listDailyFactPublications(userId, first.key, 1)).toEqual(
      [
        {
          key: first.key,
          date,
          metric: metricType,
          previousVersion: 1,
          version: 2,
          status: 'AVAILABLE',
        },
        {
          key: first.key,
          date,
          metric: metricType,
          previousVersion: 2,
          version: 3,
          status: 'WITHDRAWN',
        },
        {
          key: first.key,
          date,
          metric: metricType,
          previousVersion: 3,
          version: 4,
          status: 'AVAILABLE',
        },
      ],
    );
    expect(
      await query.listDailyFactPublications('another-athlete', first.key),
    ).toEqual([]);
    expect(
      await db.healthDailyFactRevision.findMany({
        where: { dailyMetricId: first.key },
        orderBy: { version: 'asc' },
        select: { version: true, status: true, value: true },
      }),
    ).toEqual([
      { version: 1, status: 'AVAILABLE', value: 10_800 },
      { version: 2, status: 'AVAILABLE', value: 25_200 },
      { version: 3, status: 'WITHDRAWN', value: null },
      { version: 4, status: 'AVAILABLE', value: 25_200 },
    ]);
  });

  it('keeps the most recent decision while a health snapshot is being rewritten', async () => {
    const { userId, date } = await scope();
    const repo = new HealthDataRepository(db as never);
    const ingest = new HealthDataIngestService(db as never, repo, {
      requestUpdate: async () => {},
    } as never);
    const query = new HealthDataQueryService({} as never, repo, {} as never);
    const localDate = new Date(date);
    const evidence = {
      userId,
      sourceKind: 'FILE' as const,
      sourceUid: 'snapshot-fixture',
    };
    const source = await db.importSourceObject.create({ data: evidence });
    const batch = await db.importBatchJob.create({
      data: { userId, sourceKind: evidence.sourceKind },
    });
    const item = await db.importItemJob.create({
      data: { ...evidence, batchJobId: batch.id, sourceObjectId: source.id },
    });
    const snapshot = await repo.snapshots().create({
      data: {
        userId,
        sourceObjectId: source.id,
        itemJobId: item.id,
        parserVersion: 'fixture',
        primaryKind: 'health',
        detectedKinds: ['health'],
        manifest: { status: 'READY' },
        canonicalChecksum: 'fixture',
      },
    });
    const candidate = {
      provider: 'GARMIN' as const,
      metricType: 'HRV_RMSSD_MS',
      externalId: 'health-fit:hrv',
      snapshotId: snapshot.id,
      localDate,
      startTime: localDate,
      endTime: localDate,
      unit: 'ms',
    };
    await ingest.ingestCandidate({
      userId,
      candidate: { ...candidate, value: 42 },
    });
    const initial = (await query.getCoachingFacts(userId, date))
      .observations[0];
    expect(initial).toMatchObject({ value: 42, factVersion: 1 });
    await repo.runDailyPublicationTransaction(userId, (tx) =>
      repo.snapshots(tx).update({
        where: { id: snapshot.id },
        data: { manifest: { status: 'WRITING' } },
      }),
    );
    await ingest.ingestCandidate({
      userId,
      candidate: { ...candidate, value: 55 },
    });
    const during = await query.getCoachingFacts(userId, date);
    expect(during.observations).toEqual([]);
    expect(during.pending).toEqual([
      expect.objectContaining({ key: initial.key }),
    ]);
    expect(
      await query.listDailyFactPublications(userId, initial.key, 1),
    ).toEqual([]);

    await repo.runDailyPublicationTransaction(userId, async (tx) => {
      await repo.snapshots(tx).update({
        where: { id: snapshot.id },
        data: { manifest: { status: 'READY' } },
      });
      await ingest.rebuildDailyMetric(
        { userId, localDate, metricType: candidate.metricType },
        tx,
      );
    });
    const ready = await query.getCoachingFacts(userId, date);
    expect(ready.pending).toEqual([]);
    expect(ready.observations[0]).toMatchObject({
      key: initial.key,
      value: 55,
      factVersion: 2,
    });
  });

  it('keeps source-only reports and old short measurements out of the daily fact', async () => {
    const { userId, date } = await scope();
    const repo = new HealthDataRepository(db as never);
    const state = { requestUpdate: jest.fn() };
    const ingest = new HealthDataIngestService(
      db as never,
      repo,
      state as never,
    );
    const query = new HealthDataQueryService({} as never, repo, {} as never);
    const start = new Date(date);
    const daily = {
      provider: 'GARMIN' as const,
      metricType: 'HRV_RMSSD_MS',
      externalId: 'garmin:connect_developer:account:hrv:night:HRV_RMSSD_MS',
      localDate: start,
      startTime: start,
      endTime: new Date(start.getTime() + 8 * 3_600_000),
      value: 52,
      unit: 'ms',
      sourcePriority: 10,
    };
    await ingest.ingestCandidate({ userId, candidate: daily });
    const before = await query.getCoachingFacts(userId, date);
    state.requestUpdate.mockClear();
    await ingest.upsertExternalSample({
      userId,
      candidate: {
        ...daily,
        externalId:
          'garmin:connect_developer:account:healthSnapshot:short:HRV_RMSSD_MS',
        value: 95,
        sourcePriority: 100,
      },
    });
    await ingest.ingestCandidate({
      userId,
      candidate: {
        ...daily,
        provider: 'COROS',
        externalId: 'coros:mirror',
        value: 90,
        sourcePriority: 100,
      },
    });
    const after = await query.getCoachingFacts(userId, date);
    expect(after).toEqual(before);
    expect(after.observations[0]).toMatchObject({
      provider: 'GARMIN',
      value: 52,
    });
    expect(state.requestUpdate).not.toHaveBeenCalled();
    expect(
      await repo.samples().count({ where: { userId, dailyMetricId: null } }),
    ).toBe(2);
    await repo.dailyMetrics().updateMany({
      where: { userId },
      data: { selectedProvider: 'COROS', value: 90 },
    });
    const stale = await query.getCoachingFacts(userId, date);
    expect(stale.observations).toEqual([]);
    expect(stale.pending).toEqual([
      expect.objectContaining({
        key: before.observations[0].key,
        metric: 'HRV_RMSSD_MS',
      }),
    ]);
  });

  it('does not let an older Intervals field update or an unversioned replay undo a withdrawal', async () => {
    const { userId, date } = await scope();
    const repo = new HealthDataRepository(db as never);
    const ingest = new HealthDataIngestService(db as never, repo, {
      requestUpdate: async () => {},
    } as never);
    const query = new HealthDataQueryService({} as never, repo, {} as never);
    const localDate = new Date(date);
    const replace = (revision: Date | null, value?: number) =>
      ingest.replaceProviderDailyCandidates({
        userId,
        provider: 'INTERVALS_ICU',
        localDate,
        managedMetricTypes: ['BODY_MASS_KG'],
        sourceRevision: revision,
        withdrawals:
          value === undefined
            ? [{ metricType: 'BODY_MASS_KG', externalId: 'intervals:weight' }]
            : undefined,
        candidates:
          value === undefined
            ? []
            : [
                {
                  provider: 'INTERVALS_ICU',
                  metricType: 'BODY_MASS_KG',
                  externalId: 'intervals:weight',
                  localDate,
                  startTime: localDate,
                  endTime: localDate,
                  sourceUpdatedAt: revision,
                  value,
                  unit: 'kg',
                },
              ],
      });
    const original = new Date('2026-11-18T09:00:00Z');
    const corrected = new Date('2026-11-18T10:00:00Z');
    const withdrawn = new Date('2026-11-18T11:00:00Z');
    await replace(original);
    await replace(new Date('2026-11-18T08:00:00Z'), 74);
    expect((await query.getCoachingFacts(userId, date)).observations).toEqual(
      [],
    );
    await replace(new Date('2026-11-18T09:30:00Z'), 72);
    await replace(corrected, 71);
    await replace(original, 72);
    expect(
      (await query.getCoachingFacts(userId, date)).observations[0].value,
    ).toBe(71);
    await replace(withdrawn);
    await replace(corrected, 71);
    await replace(null, 70);
    expect((await query.getCoachingFacts(userId, date)).observations).toEqual(
      [],
    );
    expect(await repo.samples().findFirst({ where: { userId } })).toMatchObject(
      {
        sourceUpdatedAt: withdrawn,
        deletedAt: expect.any(Date),
      },
    );
  });

  it('does not lose an old unresolved injury behind newer episodic memories', async () => {
    const input = await scope();
    const now = new Date();
    const common: any = {
      userId: input.userId,
      category: 'context',
      claim: 'fixture',
      status: 'ACTIVE',
      epistemicStatus: 'USER_ASSERTED',
      confidence: 1,
      timezone: 'UTC',
      timePrecision: 'DAY',
      decayProfile: 'EPISODIC',
      relevanceAnchorAt: now,
    };
    await db.athleteMemoryFact.createMany({
      data: Array.from({ length: 205 }, () => ({ ...common, kind: 'EVENT' })),
    });
    const injury = await db.athleteMemoryFact.create({
      data: {
        ...common,
        kind: 'CONSTRAINT',
        category: 'pain',
        claim: '脚踝恢复前不能跑步',
        decayProfile: 'UNTIL_RESOLVED',
        relevanceAnchorAt: new Date(now.getTime() - 10 * 86_400_000),
      },
    });
    const store = new PrismaAthleteMemoryStore(db as never, {} as never);
    const prefs: any = { isEnabled: async () => true };
    const ambient = new AmbientMemoryContextService(store, prefs);
    const snapshot = await ambient.build({
      userId: input.userId,
      asOf: now,
      timezone: 'UTC',
    });
    expect(snapshot.items.map((item) => item.id)).toContain(injury.id);
  });
  it('invalidates hidden revisions and returns a limited result when current constraints exceed the context budget', async () => {
    const input = await scope();
    const now = new Date();
    const common: any = {
      userId: input.userId,
      category: 'preferences',
      claim: 'fixture',
      status: 'ACTIVE',
      epistemicStatus: 'USER_ASSERTED',
      confidence: 1,
      timezone: 'UTC',
      timePrecision: 'DAY',
      decayProfile: 'STABLE',
      relevanceAnchorAt: now,
    };
    await db.athleteMemoryFact.createMany({
      data: Array.from({ length: 201 }, () => ({
        ...common,
        kind: 'PREFERENCE',
      })),
    });
    const injury = await db.athleteMemoryFact.create({
      data: {
        ...common,
        kind: 'CONSTRAINT',
        category: 'pain',
        claim: '脚踝恢复前不能跑步',
        decayProfile: 'UNTIL_RESOLVED',
        relevanceAnchorAt: new Date(now.getTime() - 10 * 86_400_000),
      },
    });
    const store = new PrismaAthleteMemoryStore(db as never, {} as never);
    const prefs: any = { isEnabled: async () => true };
    const memory = new AthleteMemoryQueryService(
      store,
      new AmbientMemoryContextService(store, prefs),
      prefs,
    );
    const facts = new CoachFactContextService(
      {
        getCoachingFacts: async () => ({ observations: [], sleepSessions: [] }),
      } as never,
      memory,
      { isGranted: async () => true } as never,
      { users: () => db.t_user } as never,
    );
    const before = await facts.build({
      ...input,
      timezone: 'UTC',
      allowAi: true,
    });
    expect(before.status).toBe('LIMITED');
    expect(before.memory?.omittedSafetyConstraints).toBe(true);
    await db.athleteMemoryFact.update({
      where: { id: injury.id },
      data: { claim: '医生确认恢复', version: { increment: 1 } },
    });
    const after = await facts.build({
      ...input,
      timezone: 'UTC',
      allowAi: true,
    });
    expect(after.revision).not.toBe(before.revision);
    expect(after.memory?.items.map((item) => item.id)).toEqual(
      before.memory?.items.map((item) => item.id),
    );
  });

  it('merges concurrent claims across instances, locales and dates for one user', async () => {
    const input = await scope();
    const claims = await Promise.all([
      owner.claim(input),
      peer.claim({ ...input, locale: 'en', date: '2026-11-19' }),
    ]);
    expect(claims.filter((claim) => claim.kind === 'ACQUIRED')).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === 'BUSY')).toHaveLength(1);
    const anotherUser = await scope();
    expect((await peer.claim(anotherUser)).kind).toBe('ACQUIRED');
  });
  it('fences expired results and cannot release a replacement lease', async () => {
    const input = await scope();
    const first = await owner.claim(input);
    if (first.kind !== 'ACQUIRED') throw new Error('fixture');
    await db.todaySuggestionGeneration.update({
      where: { userId: input.userId },
      data: { leaseExpiresAt: new Date(0) },
    });
    const next = await peer.claim({ ...input, inputHash: 'facts-v2' });
    if (next.kind !== 'ACQUIRED') throw new Error('fixture');
    expect(next.lease.fence).toBeGreaterThan(first.lease.fence);
    const write = jest.fn(async () => 'published');
    await expect(owner.publish(first.lease, write)).rejects.toThrow(
      'TODAY_GENERATION_LEASE_LOST',
    );
    expect(write).not.toHaveBeenCalled();
    await owner.release(first.lease);
    expect(
      (
        await db.todaySuggestionGeneration.findUniqueOrThrow({
          where: { userId: input.userId },
        })
      ).token,
    ).toBe(next.lease.token);
    await expect(
      peer.publish(next.lease, async () => 'published'),
    ).resolves.toBe('published');
  });
  it('requires a lease to bind the new slot before publishing across midnight', async () => {
    const input = await scope();
    const claim = await owner.claim(input);
    if (claim.kind !== 'ACQUIRED') throw new Error('fixture');
    const oldSlot = { ...claim.lease };
    await owner.bind(claim.lease, {
      ...input,
      date: '2026-11-19',
      inputHash: 'next-day-facts',
    });
    await expect(owner.publish(oldSlot, async () => 'old')).rejects.toThrow(
      'TODAY_GENERATION_LEASE_LOST',
    );
    await expect(
      owner.publish(claim.lease, async () => 'next-day'),
    ).resolves.toBe('next-day');
  });
  it('persists fault cooldown across instances and does not bypass it with new facts or locale', async () => {
    const input = await scope();
    const first = await owner.claim(input);
    if (first.kind !== 'ACQUIRED') throw new Error('fixture');
    first.lease.failure = 'UPSTREAM_ERROR';
    await owner.release(first.lease);
    const result = await peer.claim({
      ...input,
      inputHash: 'new-facts',
      locale: 'en',
    });
    expect(result.kind).toBe('COOLDOWN');
    const row = await db.todaySuggestionGeneration.findUniqueOrThrow({
      where: { userId: input.userId },
    });
    expect(row.failures).toBe(1);
    expect(row.retryAfter!.getTime() - Date.now()).toBeGreaterThan(50_000);
    await db.todaySuggestionGeneration.update({
      where: { userId: input.userId },
      data: { retryAfter: new Date(0), failures: 4 },
    });
    const retry = await peer.claim(input);
    if (retry.kind !== 'ACQUIRED') throw new Error('fixture');
    retry.lease.failure = 'UPSTREAM_TIMEOUT';
    await peer.release(retry.lease);
    expect(
      (
        await db.todaySuggestionGeneration.findUniqueOrThrow({
          where: { userId: input.userId },
        })
      ).retryAfter!.getTime() - Date.now(),
    ).toBeGreaterThan(14 * 60_000);
  });

  function services(
    input: Awaited<ReturnType<typeof scope>>,
    agent: unknown,
    revision = () => 'facts-v1',
  ) {
    const project = async () => ({
      ...input,
      factHash: revision(),
      constraintHash: 'constraints',
      continuityHash: 'continuity',
      timezone: 'UTC',
      edition: 'self-host',
      allowAi: true,
      featureAllowed: true,
      aiState: 'configured',
      validUntil: new Date(Date.now() + 3_600_000),
      constraints: [],
      requiredToolNames: [],
      lightContext: {},
      activePlan: null,
      todayWorkouts: [],
      tomorrowWorkouts: [],
      latestActivityId: null,
      latestActivityAt: null,
      activityEvidence: { activities: { readyCount: 0 } },
      coachState: { athleteState: null, decisions: [] },
      pendingInquiry: null,
      activeDecisionId: null,
      highConcern: false,
      weatherImpact: { status: 'unavailable' },
      weatherAttribution: null,
    });
    const create = (
      client: PrismaClient,
      generation: TodaySuggestionGenerationService,
    ) =>
      new TodaySuggestionOrchestratorService(
        client as never,
        { project } as never,
        agent as never,
        {} as never,
        new TodaySuggestionDeliveryPolicy(createAiFallbackI18n()),
        { rollover: async () => undefined } as never,
        generation,
      );
    return [create(db, owner), create(other, peer)];
  }
  const run = () => ({
    draft: {
      headline: '今天以恢复为主',
      summary: '按当前记录保持低负担活动。',
      recommendation: { kind: 'RECOVER' },
      confidence: 'MEDIUM',
      evidenceCodes: [],
      preferredIntent: null,
      secondaryIntents: [],
      tags: [],
    },
    runId: randomUUID(),
    provider: 'fixture',
    model: 'fixture',
  });

  it('resolves the durable context of a busy response on another instance without a saved suggestion', async () => {
    const input = await scope();
    const claim = await owner.claim(input);
    if (claim.kind !== 'ACQUIRED') throw new Error('fixture');
    const [first] = services(input, { run: jest.fn() });
    const response = await first.get({ ...input, allowAi: true });
    expect(response.delivery.reasonCode).toBe('GENERATION_IN_PROGRESS');
    expect(
      await db.aiTodaySuggestion.count({ where: { userId: input.userId } }),
    ).toBe(0);
    const projector = {
      project: async () => ({
        ...input,
        timezone: 'UTC',
        factHash: 'current',
        constraintHash: 'current',
        allowAi: true,
        featureAllowed: true,
        lightContext: {
          sharedFacts: { revision: 'shared-current', status: 'AVAILABLE' },
        },
        todayWorkouts: [],
        tomorrowWorkouts: [],
        userFeedback: null,
      }),
    };
    const lifecycle = new TodaySuggestionGuidanceLifecycle(
      new CoachRunStore(other as never),
    );
    const resolver = new TodaySuggestionGuidanceService(
      other as never,
      projector as never,
      lifecycle,
    );
    const resolved = await resolver.resolve(
      input.userId,
      response.suggestionId,
      'zh',
    );
    expect(resolved.status).toBe('UPDATED');
    expect(resolved.sessionId).toBeTruthy();
    expect(
      (await resolver.resolve(input.userId, response.suggestionId)).sessionId,
    ).toBe(resolved.sessionId);
    await expect(
      resolver.resolve('another-user', response.suggestionId),
    ).rejects.toThrow('TODAY_GUIDANCE_NOT_FOUND');
  });
  it('shares one valid generated result between independent orchestrators', async () => {
    const input = await scope();
    let release!: () => void;
    let started!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const agent = {
      run: jest.fn(async () => {
        started();
        await paused;
        return run();
      }),
    };
    const [first, second] = services(input, agent);
    const result = first.get({ ...input, allowAi: true });
    await ready;
    const follower = second.get({ ...input, allowAi: true });
    release();
    const [one, two] = await Promise.all([result, follower]);
    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(one.suggestionId).toBe(two.suggestionId);
    expect(one.delivery.state).toBe('GENERATED');
    expect(two.delivery.state).toBe('CACHED');
    expect(
      await db.aiTodaySuggestion.count({ where: { userId: input.userId } }),
    ).toBe(1);
  });
  it('retries one semantic revision then publishes current fallback during continuous change', async () => {
    const input = await scope();
    let revision = 1;
    const agent = {
      run: jest.fn(async () => {
        revision++;
        return run();
      }),
    };
    const [first] = services(input, agent, () => `facts-v${revision}`);
    const result = await first.get({ ...input, allowAi: true });
    expect(agent.run).toHaveBeenCalledTimes(2);
    expect(result.delivery.reasonCode).toBe('FACTS_CHANGED');
    expect(
      (
        await db.aiTodaySuggestion.findFirstOrThrow({
          where: { userId: input.userId },
        })
      ).signatureHash,
    ).toBe('facts-v3');
    expect((await peer.claim(input)).kind).toBe('COOLDOWN');
    const state = await db.todaySuggestionGeneration.findUniqueOrThrow({
      where: { userId: input.userId },
    });
    expect(state.failures).toBe(0);
    expect(state.retryAfter!.getTime() - Date.now()).toBeLessThanOrEqual(
      15_000,
    );
  });
  it('preserves the fifth upstream failure and its cooldown when facts also change', async () => {
    const input = await scope();
    let revision = 1;
    const previous = await owner.claim(input);
    if (previous.kind !== 'ACQUIRED') throw new Error('fixture');
    await owner.release(previous.lease);
    await db.todaySuggestionGeneration.update({
      where: { userId: input.userId },
      data: { failures: 4 },
    });
    const agent = {
      run: jest.fn(async () => {
        revision++;
        throw new Error('UPSTREAM_ERROR');
      }),
    };
    const [first] = services(input, agent, () => `facts-v${revision}`);
    const result = await first.get({ ...input, allowAi: true });
    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(result.delivery.reasonCode).toBe('UPSTREAM_ERROR');
    const state = await db.todaySuggestionGeneration.findUniqueOrThrow({
      where: { userId: input.userId },
    });
    expect(state.failures).toBe(5);
    expect(state.retryAfter!.getTime() - Date.now()).toBeGreaterThan(
      14 * 60_000,
    );
    expect(
      (
        await db.aiTodaySuggestion.findFirstOrThrow({
          where: { userId: input.userId },
        })
      ).signatureHash,
    ).toBe('facts-v2');
  });
  it('does not abort shared server generation when the initiating browser disconnects', async () => {
    const input = await scope();
    const controller = new AbortController();
    const agent = {
      run: jest.fn(async ({ signal }: { signal: AbortSignal }) => {
        controller.abort();
        expect(signal.aborted).toBe(false);
        return run();
      }),
    };
    const [first] = services(input, agent);
    const result = await first.get({
      ...input,
      allowAi: true,
      signal: controller.signal,
    });
    expect(result.delivery.state).toBe('GENERATED');
    expect(
      (
        await db.todaySuggestionGeneration.findUniqueOrThrow({
          where: { userId: input.userId },
        })
      ).retryAfter,
    ).toBeNull();
  });
});
