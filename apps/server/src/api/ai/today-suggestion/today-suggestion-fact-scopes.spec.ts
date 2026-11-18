import { todayCoachingFactScopes } from './today-suggestion-fact-scopes';

it('keeps a precise matching question independent of sleep while invalidating broad daily advice', () => {
  const projection: any = {
    date: '2026-11-18',
    allowAi: true,
    featureAllowed: true,
    todayWorkouts: [],
    tomorrowWorkouts: [],
    lightContext: {
      sharedFacts: { revision: 'r1', health: { sleep: 10800 } },
      workoutMatching: [{ activityHashId: 'run', candidates: ['a', 'b'] }],
    },
  };
  const before = todayCoachingFactScopes(projection);
  projection.lightContext.sharedFacts.health.sleep = 25200;
  const after = todayCoachingFactScopes(projection);
  expect(after.find((scope) => scope.topic === 'workout-match:run')).toEqual(
    before.find((scope) => scope.topic === 'workout-match:run'),
  );
  expect(after.find((scope) => scope.topic === 'today:2026-11-18')).not.toEqual(
    before.find((scope) => scope.topic === 'today:2026-11-18'),
  );
});

it('invalidates a broad discussion when a competing course in another plan changes', () => {
  const projection: any = {
    date: '2026-11-18',
    allowAi: true,
    featureAllowed: true,
    todayWorkouts: [],
    tomorrowWorkouts: [],
    lightContext: {
      sharedFacts: { revision: 'r1' },
      workoutMatching: [
        {
          activityHashId: 'run',
          candidates: ['plan-a-course', 'plan-b-course'],
        },
      ],
    },
  };
  const before = todayCoachingFactScopes(projection);
  projection.lightContext.workoutMatching[0].candidates.pop();
  expect(
    todayCoachingFactScopes(projection).find(
      (scope) => scope.topic === 'today:2026-11-18',
    ),
  ).not.toEqual(before.find((scope) => scope.topic === 'today:2026-11-18'));
});
