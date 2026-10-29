import { describe, expect, it } from '@jest/globals';
import {
  assertSafe,
  canonicalPayloadJson,
  fromPlan,
  isRenderablePreviewStructure,
  nextImportedTitle,
  previewMetricsFromStructure,
  toCreatePlanDto,
  toPreview,
  withPreviewMetrics,
} from '@shared/plan-share';

const dirtyPlan = {
  id: 'plan-1',
  userId: 'user-a',
  title: '10K Build',
  description: 'Aerobic block',
  goal: 'Race a 10K',
  periodWeeks: 2,
  startDate: '2026-08-03',
  endDate: '2026-08-16',
  status: 'ACTIVE',
  currentWeekIndex: 1,
  currentDayIndex: 3,
  workouts: [
    {
      id: 'w-1',
      planId: 'plan-1',
      weekIndex: 1,
      dayIndex: 2,
      dayOffset: 8,
      sessionIndex: 1,
      scheduledDate: '2026-08-04',
      sportType: 'RUN',
      sportDefinitionCode: 'ROAD_RUNNING',
      name: 'Easy',
      notes: 'Keep it conversational',
      text: '40min Z2',
      structureKind: 'ENDURANCE',
      dslVersion: 1,
      status: 'DONE',
      completedAt: '2026-08-04T10:00:00.000Z',
      estimatedLoad: 42,
      estimatedLoadSource: 'HR',
      estimatedLoadInputs: { ftp: 250, vdot: 50 },
      estimatedLoadComputedAt: '2026-08-04T11:00:00.000Z',
      links: [{ activityId: 99, role: 'PRIMARY' }],
    },
    {
      id: 'w-2',
      planId: 'plan-1',
      dayOffset: 10,
      sessionIndex: 1,
      scheduledDate: '2026-08-06',
      sportType: 'STRETCHING',
      name: 'Lift',
      text: 'Squat 3x5',
      structureKind: 'STRENGTH',
      dslVersion: 1,
      status: 'SKIPPED',
      skippedAt: '2026-08-06T10:00:00.000Z',
      structure: {
        kind: 'STRENGTH',
        version: 1,
        exercises: [
          {
            name: 'Back Squat',
            setGroups: [
              {
                setType: 'WORK',
                setCount: 3,
                prescription: { kind: 'REPS', repsMin: 5, repsMax: 5, amrap: false },
                load: { kind: 'OPEN' },
              },
            ],
          },
        ],
      },
    },
  ],
};

describe('plan-share-v1 snapshot', () => {
  it('strips execution, dates, load and identity fields', () => {
    const payload = fromPlan(dirtyPlan, {
      locale: 'zh',
      now: new Date('2026-08-14T00:00:00.000Z'),
    });
    const json = JSON.stringify(payload);

    expect(payload.payloadVersion).toBe('plan-share-v1');
    expect(payload.workouts).toHaveLength(2);
    expect(payload.workouts[0]).toMatchObject({
      weekIndex: 1,
      dayIndex: 2,
      sessionIndex: 1,
      text: '40min Z2',
      structureKind: 'ENDURANCE',
    });
    expect(payload.workouts[1]).toMatchObject({
      weekIndex: 2,
      dayIndex: 4,
      structureKind: 'STRENGTH',
    });
    expect(payload.workouts[1].definition?.source).toBe('STRUCTURE');

    for (const key of [
      'userId',
      'planId',
      '"id"',
      'scheduledDate',
      'startDate',
      'status',
      'completedAt',
      'skippedAt',
      'estimatedLoad',
      'links',
      'dayOffset',
    ]) {
      expect(json).not.toContain(key === '"id"' ? '"id":' : key);
    }
  });

  it('excludes exportedAt from the canonical hash input', () => {
    const first = fromPlan(dirtyPlan, {
      now: new Date('2026-08-14T00:00:00.000Z'),
    });
    const second = fromPlan(dirtyPlan, {
      now: new Date('2026-08-15T00:00:00.000Z'),
    });
    expect(first.exportedAt).not.toBe(second.exportedAt);
    expect(canonicalPayloadJson(first)).toBe(canonicalPayloadJson(second));
  });

  it('builds a preview without definition or raw text', () => {
    const preview = toPreview(fromPlan(dirtyPlan));
    const json = JSON.stringify(preview);
    expect(preview.workoutCount).toBe(2);
    expect(preview.sportTypes).toEqual(['RUN', 'STRETCHING']);
    expect(json).not.toContain('definition');
    expect(json).not.toContain('40min Z2');
    expect(preview.workouts[0].structure).toBeUndefined();
    expect(preview.workouts[1].structure).toMatchObject({
      kind: 'STRENGTH',
      exercises: [{ name: 'Back Squat' }],
    });
  });

  it('stores endurance structure when blocks exist so previews can render charts', () => {
    const payload = fromPlan({
      ...dirtyPlan,
      workouts: [
        {
          ...dirtyPlan.workouts[0],
          structure: {
            kind: 'ENDURANCE',
            version: 1,
            blocks: [
              {
                type: 'work',
                steps: [{ duration: 2400, stepKind: 'WORK' }],
              },
            ],
          },
        },
      ],
    });
    expect(payload.workouts[0].definition?.source).toBe('STRUCTURE');
    const preview = toPreview(payload);
    expect(preview.workouts[0].structure).toMatchObject({
      kind: 'ENDURANCE',
      blocks: [{ type: 'work' }],
    });
    expect(preview.workouts[0].durationSeconds).toBe(2400);
    expect(preview.workouts[0].previewLoad).toBe(32.7);
    expect(JSON.stringify(preview)).not.toContain('40min Z2');
    expect(JSON.stringify(preview)).not.toContain('estimatedLoad');
  });

  it('round-trips into CreatePlanDto without forbidden fields', () => {
    const dto = toCreatePlanDto(fromPlan(dirtyPlan), {
      metadata: {
        importedFrom: {
          sharePublicId: 'abcdefghijkl',
          payloadVersion: 'plan-share-v1',
        },
      },
    });
    expect(dto.sourceType).toBe('IMPORTED');
    expect(dto.workouts[0]).toMatchObject({
      weekIndex: 1,
      dayIndex: 2,
      text: '40min Z2',
      definition: { source: 'TEXT', text: '40min Z2' },
    });
    expect(dto.workouts[1].definition?.source).toBe('STRUCTURE');
    expect(JSON.stringify(dto.workouts)).not.toContain('estimatedLoad');
    expect(JSON.stringify(dto.workouts)).not.toContain('scheduledDate');
  });

  it('rejects payload objects that reintroduce forbidden keys', () => {
    const payload = fromPlan(dirtyPlan) as Record<string, unknown>;
    payload.userId = 'user-a';
    expect(() => assertSafe(payload)).toThrow(/userId/);
  });

  it('increments 副本 titles', () => {
    expect(nextImportedTitle('10K Build', [])).toBe('10K Build');
    expect(nextImportedTitle('10K Build', ['10K Build'])).toBe('10K Build（副本）');
    expect(
      nextImportedTitle('10K Build', ['10K Build', '10K Build（副本）']),
    ).toBe('10K Build（副本 2）');
  });
});

describe('previewMetricsFromStructure', () => {
  it('uses WORK IF 0.7 for a 2400s endurance step', () => {
    expect(
      previewMetricsFromStructure({
        kind: 'ENDURANCE',
        version: 1,
        blocks: [
          {
            type: 'work',
            steps: [{ duration: 2400, stepKind: 'WORK' }],
          },
        ],
      }),
    ).toEqual({ durationSeconds: 2400, previewLoad: 32.7 });
  });

  it('prefers zone IF over stepKind and multiplies repeat blocks', () => {
    expect(
      previewMetricsFromStructure({
        kind: 'ENDURANCE',
        version: 1,
        blocks: [
          {
            type: 'repeat',
            count: 3,
            children: [
              {
                type: 'work',
                steps: [
                  {
                    duration: 600,
                    stepKind: 'WORK',
                    primaryTargetMeta: {
                      kind: 'HEART_RATE_ZONE',
                      zoneIndex: 2,
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({ durationSeconds: 1800, previewLoad: 21.1 });
  });

  it('maps strength duration and planned RPE onto the generic IF scale', () => {
    expect(
      previewMetricsFromStructure({
        kind: 'STRENGTH',
        version: 1,
        durationSeconds: 3600,
        plannedSessionRpe: 6,
        exercises: [{ name: 'Squat', setGroups: [] }],
      }),
    ).toEqual({ durationSeconds: 3600, previewLoad: 36 });
  });

  it('returns null metrics when structure cannot contribute duration', () => {
    expect(previewMetricsFromStructure(undefined)).toEqual({
      durationSeconds: null,
      previewLoad: null,
    });
    expect(
      previewMetricsFromStructure({
        kind: 'FREEFORM',
        version: 1,
        text: 'notes only',
      }),
    ).toEqual({ durationSeconds: null, previewLoad: null });
  });

  it('does not treat empty endurance blocks as renderable', () => {
    expect(
      isRenderablePreviewStructure({
        kind: 'ENDURANCE',
        version: 1,
        blocks: [],
      }),
    ).toBe(false);
    expect(
      isRenderablePreviewStructure({
        kind: 'STRENGTH',
        version: 1,
        exercises: [{ name: 'Squat', setGroups: [] }],
      }),
    ).toBe(true);
  });

  it('fills previewLoad without introducing estimatedLoad', () => {
    const workout = withPreviewMetrics({
      weekIndex: 1,
      dayIndex: 1,
      sessionIndex: 1,
      sportType: 'RUN',
      name: 'Easy',
      notes: null,
      structureKind: 'ENDURANCE',
    }, {
      kind: 'ENDURANCE',
      version: 1,
      blocks: [{ type: 'work', steps: [{ duration: 2400, stepKind: 'WORK' }] }],
    });
    expect(workout.previewLoad).toBe(32.7);
    expect(workout).not.toHaveProperty('estimatedLoad');
  });
});
