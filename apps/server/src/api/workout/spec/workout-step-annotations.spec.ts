import { WorkoutService } from '../workout.service';
import { encodeWorkoutStepAnnotations } from '../workout-step-annotations';
describe('persisted provider-neutral step annotations', () => {
  const service = new WorkoutService({ t: () => '' } as any);
  it('round trips swim attributes and a secondary cadence target through the step representation', () => {
    const step: any = {
      duration: 30,
      durationMeta: { kind: 'DISTANCE', value: 50, unit: 'METERS' },
      swimMeta: {
        stroke: 'FREESTYLE',
        trainingType: 'KICK',
        equipment: 'FINS',
      },
      primaryTargetMeta: { kind: 'NONE' },
      secondaryTarget: {
        kind: 'CADENCE',
        value: 80,
        valueHigh: 90,
        unit: 'RPM',
      },
    };
    const rows = service.buildWorkoutPlanSteps([
      { type: 'work', steps: [step] },
    ]);
    const restored = service.buildPlanBlocksFromWorkoutSteps(rows, 'SWIM');
    expect((restored[0] as any).steps[0]).toMatchObject({
      swimMeta: step.swimMeta,
      secondaryTarget: step.secondaryTarget,
      durationMeta: step.durationMeta,
    });
  });
  it('keeps unannotated legacy steps unchanged', () => {
    expect(encodeWorkoutStepAnnotations({})).toBeUndefined();
    expect(
      service.buildPlanBlocksFromWorkoutSteps(
        [{ stepType: 'WORK', durationType: 'TIME', durationValue: 60 }],
        'RUN',
      )[0],
    ).toMatchObject({ steps: [{ duration: 60 }] });
  });
  it('rejects unknown attributes and oversized metadata instead of silently dropping them', () => {
    expect(() =>
      encodeWorkoutStepAnnotations({
        swimMeta: { stroke: 'NOT_A_STROKE' },
      } as any),
    ).toThrow();
    expect(() =>
      encodeWorkoutStepAnnotations({
        secondaryTarget: { kind: 'CADENCE', zoneLabel: 'x'.repeat(9000) },
      }),
    ).toThrow();
  });
});
