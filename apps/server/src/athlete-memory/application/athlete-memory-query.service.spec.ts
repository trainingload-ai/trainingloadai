import { AthleteMemoryQueryService } from './athlete-memory-query.service';
import { AmbientMemoryContextService } from './ambient-memory-context.service';
import type {
  AthleteMemoryStore,
  MemoryFactRecord,
} from './ports/athlete-memory-store';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

function fact(userId: string, anchor: string): MemoryFactRecord {
  return {
    id: `${userId}-sleep`,
    userId,
    kind: 'OBSERVATION',
    category: 'sleep_quality',
    claim: '用户主观认为该晚睡眠质量较差',
    status: 'ACTIVE',
    epistemicStatus: 'USER_ASSERTED',
    confidence: 0.96,
    eventStart: new Date(anchor),
    eventEnd: new Date(anchor),
    timeText: '昨晚',
    timePrecision: 'APPROXIMATE',
    timezone: 'Asia/Shanghai',
    validFrom: null,
    validUntil: null,
    decayProfile: 'ACUTE_RECOVERY',
    relevanceAnchorAt: new Date(anchor),
    reviewAfter: null,
    supersededById: null,
    version: 1,
    createdAt: new Date(anchor),
    updatedAt: new Date(anchor),
    evidence: [
      {
        id: 'evidence',
        sourceMessageId: 'message',
        assertedAt: new Date(anchor),
        createdAt: new Date(anchor),
      },
    ],
  };
}

describe('AthleteMemoryQueryService', () => {
  const rows = [
    fact('athlete-a', '2026-09-21T01:00:00.000Z'),
    fact('athlete-b', '2026-10-10T01:00:00.000Z'),
  ];
  const store = {
    findFacts: jest.fn(async (input: { userId: string }) =>
      rows.filter((row) => row.userId === input.userId),
    ),
  } as unknown as AthleteMemoryStore & {
    findFacts: ReturnType<typeof jest.fn>;
  };
  const preferences = { isEnabled: async () => true };
  const ambient = new AmbientMemoryContextService(store, preferences as never);
  const service = new AthleteMemoryQueryService(
    store,
    ambient,
    preferences as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('does not inject a 20-day-old acute observation but keeps it historically searchable', async () => {
    const asOf = new Date('2026-10-11T01:00:00.000Z');
    const context = await service.buildAmbientContext({
      userId: 'athlete-a',
      asOf,
      timezone: 'Asia/Shanghai',
    });
    expect(context.items).toEqual([]);

    const history = await service.search({
      userId: 'athlete-a',
      intent: 'monthly sleep trend',
      query: 'sleep quality',
      mode: 'HISTORICAL',
      asOf,
    });
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ id: 'athlete-a-sleep' });
  });

  it('forces user scope for ambient and search', async () => {
    const result = await service.search({
      userId: 'athlete-b',
      intent: 'sleep',
      query: 'sleep',
      mode: 'HISTORICAL',
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'athlete-b-sleep' });
    expect(store.findFacts).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'athlete-b' }),
    );
  });

  it('keeps CJK-heavy ambient data inside the configured token budget', async () => {
    const oversized = {
      ...fact('athlete-a', '2026-10-10T01:00:00.000Z'),
      claim: '睡'.repeat(320),
    };
    const boundedAmbient = new AmbientMemoryContextService(
      {
        findFacts: async () => [oversized],
      } as unknown as AthleteMemoryStore,
      preferences as never,
    );

    const context = await boundedAmbient.build({
      userId: 'athlete-a',
      asOf: new Date('2026-10-11T01:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      maxTokens: 200,
    });

    expect(context.items).toEqual([]);
    expect(context.estimatedTokens).toBeLessThanOrEqual(200);
    expect(context.truncated).toBe(true);
  });
});
