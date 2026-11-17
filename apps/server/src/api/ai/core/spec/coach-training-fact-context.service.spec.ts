import { CoachTrainingFactContextService } from '../coach-training-fact-context.service';
import { TrainingDataCoverageQueryService } from '../training-data-coverage-query.service';

it('invalidates an older activity correction even when the displayed recent twelve and stored load are unchanged', async () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({
    hashId: `run-${i}`,
    activityName: 'Run',
    sportType: 'RUN',
    timerTime: 1800,
    distance: 5000,
    avgHeartRate: 140,
    avgPower: null,
    sessionRpe: 4,
    startTime: new Date(Date.UTC(2026, 10, 17 - i)),
    updatedAt: new Date(),
    readyAt: new Date(),
  }));
  const coverage = new TrainingDataCoverageQueryService(
    {
      findMany: async ({ take }: { take: number }) => rows.slice(0, take),
    } as never,
    {} as never,
    {} as never,
  );
  const service = new CoachTrainingFactContextService(
    {
      buildContext: async () => ({
        plan: null,
        day: {},
        tomorrow: {},
        nextWorkouts: [],
        recentLoad: { atl: 30 },
        workoutMatching: [],
      }),
    } as never,
    coverage,
    { findMany: async () => [] } as never,
  );
  const before = await service.build('athlete', '2026-11-18', 'UTC');
  rows[12].distance = 10000;
  const after = await service.build('athlete', '2026-11-18', 'UTC');
  expect(after.facts).toEqual(before.facts);
  expect(after.activityRevision).not.toBe(before.activityRevision);
  expect(after.truncated).toBe(false);
});
