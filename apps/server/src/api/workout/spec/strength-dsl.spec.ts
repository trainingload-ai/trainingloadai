import { describe, expect, it } from '@jest/globals';
import {
  parseStrengthWorkoutDsl,
  stringifyStrengthWorkoutDsl,
  summarizeStrengthWorkout,
  validateStrengthWorkout,
} from '../strength/strength-dsl';
import { WorkoutDefinitionValidationError } from '../codecs/workout-codec';

const SAMPLE = `duration 50m
session rpe 6

exercise "Back Squat" equipment barbell {
  warmup 1x5 weight 40kg rest 90s
  warmup 1x3 weight 60kg rest 2m
  work 3x5 weight 80kg rpe 7 rest 3m
}

exercise "Pull Up" equipment bodyweight {
  work 3x8 bodyweight rir 2 rest 90s
}`;

describe('strength workout DSL', () => {
  it('parses a complete workout and produces a canonical round trip', () => {
    const workout = parseStrengthWorkoutDsl(SAMPLE);

    expect(workout).toMatchObject({
      kind: 'STRENGTH',
      version: 1,
      durationSeconds: 3000,
      plannedSessionRpe: 6,
    });
    expect(workout.exercises).toHaveLength(2);
    expect(workout.exercises[0]).toMatchObject({
      name: 'Back Squat',
      equipmentCode: 'barbell',
    });
    expect(workout.exercises[0].setGroups[2]).toMatchObject({
      setType: 'WORK',
      setCount: 3,
      prescription: {
        kind: 'REPS',
        repsMin: 5,
        repsMax: 5,
        amrap: false,
      },
      load: { kind: 'ABSOLUTE', value: 80, unit: 'KG' },
      effort: { kind: 'RPE', value: 7 },
      restSeconds: 180,
    });

    const canonical = stringifyStrengthWorkoutDsl(workout);
    expect(parseStrengthWorkoutDsl(canonical)).toEqual(workout);
  });

  it('preserves localized exercise names through a canonical round trip', () => {
    const workout =
      parseStrengthWorkoutDsl(`exercise "杠铃深蹲" equipment barbell {
  work 3x5 weight 60kg rpe 7 rest 3m
}`);

    expect(workout.exercises[0].name).toBe('杠铃深蹲');
    const canonical = stringifyStrengthWorkoutDsl(workout);
    expect(canonical).toContain('exercise "杠铃深蹲" equipment barbell {');
    expect(parseStrengthWorkoutDsl(canonical)).toEqual(workout);
  });

  it.each([
    ['work 3x8-12 weight 20kg rir 2', 'REPS'],
    ['work 1x5+ weight 80kg rpe 9', 'REPS'],
    ['work 3xAMRAP bodyweight rpe 8 rest 60s', 'REPS'],
    ['work 4x4 weight 80%1rm rest 3m', 'REPS'],
    ['work 3x6 bodyweight +10kg', 'REPS'],
    ['work 3x8 bodyweight -20kg', 'REPS'],
    ['work 3x45s rest 30s', 'TIME'],
    ['work 3x8 open rir 3 rest 90s', 'REPS'],
  ])('supports prescription %s', (setLine, kind) => {
    const workout = parseStrengthWorkoutDsl(
      `exercise "Test" {\n  ${setLine}\n}`,
    );
    expect(workout.exercises[0].setGroups[0].prescription.kind).toBe(kind);
  });

  it('canonicalizes the common NxAMRAP alias to minimum-reps-plus syntax', () => {
    const workout = parseStrengthWorkoutDsl(`exercise "Push-Up" {
  work 3xAMRAP bodyweight rpe 8 rest 60s
}`);

    expect(workout.exercises[0].setGroups[0]).toMatchObject({
      setCount: 3,
      prescription: {
        kind: 'REPS',
        repsMin: 1,
        repsMax: 1,
        amrap: true,
      },
    });
    expect(stringifyStrengthWorkoutDsl(workout)).toContain(
      'work 3x1+ bodyweight rpe 8 rest 1m',
    );
  });

  it('summarizes work sets, reps, external volume and hard-session state', () => {
    const summary = summarizeStrengthWorkout(parseStrengthWorkoutDsl(SAMPLE));
    expect(summary).toMatchObject({
      durationSeconds: 3000,
      exerciseCount: 2,
      warmupSetCount: 2,
      workingSetCount: 6,
      totalRepsMin: 39,
      totalRepsMax: 39,
      volumeLoadKg: 1200,
      lowerBodyLoad: 'LOW',
      upperBodyLoad: 'LOW',
      hardSession: false,
      loadConfidence: 'HIGH',
    });
  });

  it.each([
    ['exercise "Squat" {\n work 3x5 rpe 8 rir 2\n}', 'CONFLICTING_EFFORT'],
    ['exercise "Squat" {\n warmup 1x5 weight 20kg\n}', 'MISSING_WORK_SET'],
    ['exercise "Squat" {\n work 3x12-8 open\n}', 'INVALID_REPS_RANGE'],
    ['exercise "Squat" {\n work 3x5 weight 120%1rm\n}', 'INVALID_PERCENT_1RM'],
    ['exercise "Squat" {\n work 3x5 foo bar\n}', 'UNSUPPORTED_FEATURE'],
  ])('reports %s as %s', (text, code) => {
    try {
      parseStrengthWorkoutDsl(text);
      throw new Error('expected parse to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkoutDefinitionValidationError);
      expect((error as WorkoutDefinitionValidationError).issues[0].code).toBe(
        code,
      );
      expect(
        (error as WorkoutDefinitionValidationError).issues[0].line,
      ).toBeGreaterThan(0);
    }
  });

  it('validates typed structures without relying on the text parser', () => {
    const workout = parseStrengthWorkoutDsl(SAMPLE);
    workout.exercises[0].setGroups[0].load = {
      kind: 'PERCENT_1RM',
      value: 120,
    };
    expect(validateStrengthWorkout(workout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_LOAD' }),
      ]),
    );
  });
});
