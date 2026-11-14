import { buildAthleteStateScenarios } from '../../../../../test/athlete-state-scenarios/athlete-state-scenarios';

describe('Synthetic Athlete State scenario consistency', () => {
  const scenarios = buildAthleteStateScenarios('2026-11-14');
  it('keeps pace, duration and distance consistent across every model-facing activity', () => {
    for (const scenario of scenarios) {
      for (const output of Object.values(scenario.responses)) {
        const rows =
          (output as { activities?: any[]; recentActivities?: any[] })
            .activities ??
          (output as { recentActivities?: any[] }).recentActivities ??
          [];
        for (const activity of rows) {
          if (activity.avgPaceSecKm == null) continue;
          expect((activity.durationMin * 60) / activity.distanceKm).toBeCloseTo(
            activity.avgPaceSecKm,
            1,
          );
        }
      }
    }
  });
  it('does not introduce an accidental connection conflict in the sync-waiting case', () => {
    const syncing = scenarios.find((row) => row.id === 'sync-pending')!;
    expect(syncing.responses['training.data_coverage']).toMatchObject({
      pendingActivityCount: 8,
      connections: [{ provider: 'INTERVALS_ICU', status: 'CONNECTED' }],
    });
    expect(syncing.responses['integration.status']).toMatchObject({
      connections: [
        { provider: 'INTERVALS_ICU', connected: true, syncPending: true },
      ],
    });
  });
  it('separates explicit persistent concerns from missing clarification and declined answers', () => {
    expect(
      scenarios.find((row) => row.id === 'concrete-concern')!.acceptedStates,
    ).toEqual(['HIGH_CONCERN']);
    expect(
      scenarios.find((row) => row.id === 'necessary-question')!.acceptedStates,
    ).toEqual(['UNKNOWN']);
    const declined = scenarios.find((row) => row.id === 'declined-question')!;
    expect(declined.acceptedStates).toEqual(['UNKNOWN']);
    expect(declined.mayAsk).toBe(false);
  });
});
