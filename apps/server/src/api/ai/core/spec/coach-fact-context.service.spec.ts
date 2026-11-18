import { CoachFactContextService } from '../coach-fact-context.service';
import { AmbientMemoryContextService } from '@/athlete-memory/application/ambient-memory-context.service';
import { AthleteMemoryQueryService } from '@/athlete-memory/application/athlete-memory-query.service';

function fixture() {
  let facts: any[] = [];
  let enabled = true;
  let consent = true;
  let extraction: any[] = [];
  const store: any = {
    findFacts: jest.fn(async () => facts),
    contextInputStatus: jest.fn(async () => extraction),
  };
  const preferences: any = { isEnabled: async () => enabled };
  const memory = new AthleteMemoryQueryService(
    store,
    new AmbientMemoryContextService(store, preferences),
    preferences,
  );
  const reported: any = {
    observations: [
      {
        key: 'sleep',
        value: 10800,
        readiness: { completePeriod: 'UNVERIFIED' },
      },
    ],
    sleepSessions: [],
    truncated: false,
  };
  const health: any = { getCoachingFacts: jest.fn(async () => reported) };
  const training = {
    day: { completionState: 'PLANNED' },
    load: { atl: 30 },
    independent: [] as unknown[],
  };
  const service = new CoachFactContextService(
    health,
    memory,
    { isGranted: async () => consent } as never,
    {
      users: () => ({
        findUnique: async () => ({ accountDeletionRequestedAt: null }),
      }),
    } as never,
    { build: async () => training } as never,
  );
  const read = () =>
    service.build({
      userId: 'user',
      date: '2026-11-18',
      timezone: 'Asia/Shanghai',
      allowAi: true,
    });
  return {
    read,
    store,
    health,
    reported,
    training,
    setFacts: (value: any[]) => {
      facts = value;
    },
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    setConsent: (value: boolean) => {
      consent = value;
    },
    setExtraction: (value: any[]) => {
      extraction = value;
    },
  };
}

describe('Shared current coaching facts', () => {
  it('keeps identical reads stable and invalidates a 3h→7h report without waiting for assessment TTL', async () => {
    const f = fixture();
    const first = await f.read();
    expect((await f.read()).revision).toBe(first.revision);
    f.reported.observations[0].value = 25200;
    expect((await f.read()).revision).not.toBe(first.revision);
  });
  it('invalidates an assessment basis for training changes even when health and Memory stay unchanged', async () => {
    const f = fixture();
    const before = await f.read();
    f.training.load.atl = 75;
    const loadChanged = await f.read();
    expect(loadChanged.revision).not.toBe(before.revision);
    f.training.independent.push({ id: 'new-course', revision: 1 });
    expect((await f.read()).revision).not.toBe(loadChanged.revision);
  });
  it('includes user injury, correction and withdrawal with stable semantic versions', async () => {
    const f = fixture();
    const empty = await f.read();
    const fact = {
      id: 'pain',
      kind: 'CURRENT_STATE',
      category: 'pain',
      claim: '今天脚踝扭伤',
      status: 'ACTIVE',
      version: 1,
      epistemicStatus: 'USER_ASSERTED',
      decayProfile: 'ACUTE_RECOVERY',
      relevanceAnchorAt: new Date(),
      validFrom: null,
      validUntil: null,
      reviewAfter: null,
      confidence: 1,
    };
    f.setFacts([fact]);
    const injured = await f.read();
    expect(injured.revision).not.toBe(empty.revision);
    expect((await f.read()).revision).toBe(injured.revision);
    fact.version = 2;
    fact.claim = '医生确认已经恢复';
    expect((await f.read()).revision).not.toBe(injured.revision);
    f.setFacts([]);
    expect((await f.read()).memory?.items).toEqual([]);
  });
  it('invalidates on memory preference and refuses stale memory after the switch is disabled', async () => {
    const f = fixture();
    const before = await f.read();
    f.setEnabled(false);
    const disabled = await f.read();
    expect(disabled.revision).not.toBe(before.revision);
    expect(disabled.memory?.disabled).toBe(true);
  });
  it('does not read health or memory after AI consent is revoked', async () => {
    const f = fixture();
    f.setConsent(false);
    expect((await f.read()).status).toBe('DISABLED');
    expect(f.health.getCoachingFacts).not.toHaveBeenCalled();
    expect(f.store.findFacts).not.toHaveBeenCalled();
  });
  it('distinguishes unavailable reads from an empty history', async () => {
    const f = fixture();
    f.health.getCoachingFacts.mockRejectedValue(new Error('offline'));
    const result = await f.read();
    expect(result.status).toBe('LIMITED');
    expect(result.limitations).toContain('HEALTH_READ_UNAVAILABLE');
  });
  it('reports delayed extraction without turning worker heartbeats into new facts', async () => {
    const f = fixture();
    f.setExtraction([{ id: 'job', status: 'PENDING' }]);
    const pending = await f.read();
    expect(pending.limitations).toContain(
      'USER_REPORT_EXTRACTION_PENDING_OR_FAILED',
    );
    f.setExtraction([{ id: 'job', status: 'RUNNING' }]);
    expect((await f.read()).revision).toBe(pending.revision);
    f.setExtraction([]);
    expect((await f.read()).revision).not.toBe(pending.revision);
  });
  it.each([1, 13])(
    'preserves current constraints or declares limited coverage with %s constraints',
    async (count) => {
      const f = fixture();
      const at = new Date();
      const base = {
        status: 'ACTIVE',
        version: 1,
        epistemicStatus: 'USER_CONFIRMED',
        decayProfile: 'STABLE',
        relevanceAnchorAt: at,
        validFrom: null,
        validUntil: null,
        reviewAfter: null,
        confidence: 1,
      };
      const facts = Array.from({ length: 12 }, (_, i) => ({
        ...base,
        id: `pref-${i}`,
        kind: 'PREFERENCE',
        category: 'training_preference',
        claim: 'Morning workouts',
      }));
      facts.push(
        ...Array.from({ length: count }, (_, i) => ({
          ...base,
          id: `constraint-${i}`,
          kind: 'CONSTRAINT',
          category: 'equipment_constraint',
          claim: 'Bike unavailable',
          confidence: 0.9,
        })),
      );
      f.setFacts(facts);
      const result = await f.read();
      if (count === 1) {
        expect(
          result.memory?.items.some((item) => item.id === 'constraint-0'),
        ).toBe(true);
        expect(result.status).toBe('AVAILABLE');
      } else {
        expect(result.status).toBe('LIMITED');
        expect(result.memory?.omittedSafetyConstraints).toBe(true);
      }
    },
  );
});

it('does not let preferences hide a current user-reported sleep constraint', async () => {
  const f = fixture();
  const at = new Date();
  const common = {
    status: 'ACTIVE',
    version: 1,
    epistemicStatus: 'USER_CONFIRMED',
    decayProfile: 'STABLE',
    relevanceAnchorAt: at,
    validFrom: null,
    validUntil: null,
    reviewAfter: null,
    confidence: 1,
  };
  f.setFacts([
    ...Array.from({ length: 12 }, (_, i) => ({
      ...common,
      id: `pref-${i}`,
      kind: 'PREFERENCE',
      category: 'training_preference',
      claim: 'Morning workouts',
    })),
    {
      ...common,
      id: 'sleep',
      kind: 'CURRENT_STATE',
      category: 'sleep_duration',
      claim: '昨晚只睡了三小时',
      confidence: 0.9,
    },
  ]);
  const result = await f.read();
  expect(result.memory?.items.some((item) => item.id === 'sleep')).toBe(true);
});
