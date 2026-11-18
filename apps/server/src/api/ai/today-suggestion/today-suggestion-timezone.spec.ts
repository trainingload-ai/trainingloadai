import { PlanExecutionContextService } from '@/api/plan/plan-execution-context.service';
import { PlanRepository } from '@/api/plan/persistence/plan.repository';
import { PlanWorkoutRepository } from '@/api/plan/persistence/plan-workout.repository';
import { CoachContextRepository } from '@/api/plan/persistence/coach-context.repository';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { UserIdentityRepository } from '@/api/user/persistence/user-identity.repository';
import { TodaySuggestionGuidanceService } from './today-suggestion-guidance.service';
import { CurrentCoachFactScopeValidator } from './coach-fact-scope-validator.service';
import { todayCoachingFactScopes } from './today-suggestion-fact-scopes';

function fixture(profile: string | null, temporary = false) {
  const model = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => [],
  };
  const db: any = {
    userBodyMetric: {
      findFirst: async () => (profile ? { value: profile } : null),
    },
    plan: model,
    planWorkout: model,
    activity: model,
    coachContext: model,
    coachEvent: model,
  };
  const execution = new PlanExecutionContextService(
    db,
    { getStoredSliceAsOf: async () => ({ latest: null, daily: [] }) } as never,
    undefined as never,
    undefined as never,
    new PlanRepository(db),
    new PlanWorkoutRepository(db),
    new CoachContextRepository(db),
    new ActivityReadService(db),
    new UserQueryService(new UserIdentityRepository(db)),
  );
  const projector = {
    project: async (args: any) => {
      const ctx = await execution.buildContext({
        userId: args.userId,
        surface: 'HOME_TODAY',
        timezone: args.timezone,
      });
      return {
        userId: args.userId,
        locale: args.locale,
        date: ctx.anchor.anchorDate,
        timezone: ctx.anchor.timezone,
        factHash: ctx.factHash,
        constraintHash: 'constraints',
        allowAi: true,
        featureAllowed: true,
        lightContext: {
          sharedFacts: { revision: ctx.factHash, status: 'AVAILABLE' },
        },
        todayWorkouts: [],
        tomorrowWorkouts: [],
      } as any;
    },
  };
  let stored: any;
  db.aiTodaySuggestion = {
    findUnique: async () => (temporary ? null : stored),
  };
  db.todaySuggestionGeneration = {
    findFirst: async () => ({ userId: 'u1' }),
  };
  db.coachRun = { findFirst: async () => null };
  db.aiCoachSession = { upsert: async () => ({}) };
  db.todaySuggestionContextReference = {
    findFirst: async () => (temporary ? { timezone: 'Asia/Shanghai' } : null),
  };
  const guidance = new TodaySuggestionGuidanceService(
    db,
    projector as never,
    {
      reconcile: async () => ({ changed: 0 }),
      topics: todayCoachingFactScopes,
    } as never,
  );
  return {
    guidance,
    setProfile: (value: string | null) => {
      profile = value;
    },
    validator: new CurrentCoachFactScopeValidator(projector as never),
    home: async () => {
      const home = await projector.project({
        userId: 'u1',
        locale: 'zh',
        timezone: 'Asia/Shanghai',
      });
      stored = {
        userId: 'u1',
        locale: 'zh',
        date: home.date,
        summary: 'Today',
        keyContext: { timezone: home.timezone },
        signatureHash: home.factHash,
        constraintHash: 'constraints',
        structuredResult: null,
      };
      return home;
    },
  };
}

afterEach(() => jest.useRealTimers());
it.each([null, 'Asia/Shanghai', 'America/Los_Angeles'])(
  'keeps the advice calendar date with profile timezone %s',
  async (profile) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-17T20:00:00Z'));
    const f = fixture(profile);
    const home = await f.home();
    const resolved = await f.guidance.resolve('u1', 'token', 'zh');
    expect(resolved.context?.currentFacts.date).toBe(home.date);
    expect(resolved.scope?.timezone).toBe(profile ?? 'Asia/Shanghai');
    const scopes = await f.validator.current('u1', 'Asia/Shanghai');
    expect(
      scopes.find((s) => s.topic === resolved.scope?.topic)?.revision,
    ).toBe(resolved.scope?.revision);
  },
);
it('keeps the calendar timezone for a busy response without a saved advice row', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-17T20:00:00Z'));
  const f = fixture(null, true);
  const home = await f.home();
  expect(
    (await f.guidance.resolve('u1', 'token', 'zh')).context?.currentFacts.date,
  ).toBe(home.date);
});

it('lets a changed profile timezone override a previously stored device hint', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-17T20:00:00Z'));
  const f = fixture(null);
  await f.home();
  const before = await f.guidance.resolve('u1', 'token', 'zh');
  f.setProfile('UTC');
  const after = await f.guidance.resolve('u1', 'token', 'zh');
  expect(after.status).toBe('UPDATED');
  expect(after.scope?.timezone).toBe('UTC');
  expect(after.context?.currentFacts.date).toBe('2026-11-17');
  expect(after.scope?.revision).not.toBe(before.scope?.revision);
});
