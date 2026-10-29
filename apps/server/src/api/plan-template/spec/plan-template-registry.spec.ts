import { describe, expect, it } from '@jest/globals';
import type { I18nService } from 'nestjs-i18n';
import {
  RUN_PLAN_TEMPLATES,
  buildPlanTemplateDraft,
  getPlanTemplateVariant,
  getRunPlanTemplate,
  validateRunPlanTemplates,
} from '../../../../../../packages/shared/plan-templates';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutService } from '@/api/workout/workout.service';

function workoutDefinitions() {
  const workoutService = new WorkoutService({
    t: (key: string) => key,
  } as unknown as I18nService);
  return new WorkoutDefinitionService(
    new WorkoutCodecRegistry(
      new EnduranceWorkoutCodec(workoutService),
      new StrengthWorkoutCodec(),
      new FreeformWorkoutCodec(),
    ),
  );
}

describe('official running plan template registry', () => {
  it('preserves incumbent hashes and freezes the 12-template matrix', () => {
    expect(RUN_PLAN_TEMPLATES).toHaveLength(12);
    expect(
      RUN_PLAN_TEMPLATES.map((template) => ({
        key: template.key,
        contentHash: template.contentHash,
      })),
    ).toEqual([
      { key: 'RUN_5K_FIRST', contentHash: 'fnv1a-878da2ef' },
      { key: 'RUN_5K_FINISH', contentHash: 'fnv1a-90288714' },
      { key: 'RUN_5K_IMPROVE', contentHash: 'fnv1a-37d1d7f3' },
      { key: 'RUN_10K_FINISH', contentHash: 'fnv1a-893a47e3' },
      { key: 'RUN_10K_IMPROVE', contentHash: 'fnv1a-8bc2dad5' },
      { key: 'RUN_10K_TARGET', contentHash: 'fnv1a-8a00f5dc' },
      { key: 'RUN_HALF_FINISH', contentHash: 'fnv1a-01cbd96c' },
      { key: 'RUN_HALF_IMPROVE', contentHash: 'fnv1a-b83beeb8' },
      { key: 'RUN_HALF_TARGET', contentHash: 'fnv1a-14de91eb' },
      { key: 'RUN_MARATHON_FINISH', contentHash: 'fnv1a-345a9e16' },
      { key: 'RUN_MARATHON_IMPROVE', contentHash: 'fnv1a-4fdfd652' },
      { key: 'RUN_MARATHON_TARGET', contentHash: 'fnv1a-6534fb05' },
    ]);
    expect(getRunPlanTemplate('first-5k')?.version).toBe('1.0.1');
    for (const template of RUN_PLAN_TEMPLATES.slice(1)) {
      expect(template.version).toBe('1.0.0');
      expect(template.contentHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    }
    expect(validateRunPlanTemplates()).toEqual([]);
  });

  it('localizes generated workout copy without changing the frozen DSL', () => {
    const generated = RUN_PLAN_TEMPLATES.filter(
      (template) =>
        template.goal === 'HALF_MARATHON' ||
        template.goal === 'MARATHON' ||
        template.key === 'RUN_10K_IMPROVE' ||
        template.key === 'RUN_10K_TARGET',
    );
    expect(generated).toHaveLength(8);

    const englishLeak =
      /\b(?:warmup|work|recovery|cooldown|easy|long run|steady|threshold|intervals?|conversational|effort)\b/i;
    for (const template of generated) {
      expect(template.copyVersion).toBe('1.0.2');
      for (const workout of getPlanTemplateVariant(template)!.workouts) {
        expect(workout.sourceDsl).toMatch(/(?:warmup|work|cooldown)/);
        for (const locale of ['zh', 'zh-hant', 'ja'] as const) {
          expect(workout.copy[locale].name).not.toMatch(englishLeak);
          expect(workout.copy[locale].notes).not.toMatch(englishLeak);
        }
      }
    }

    const marathon = getPlanTemplateVariant(
      getRunPlanTemplate('finish-marathon')!,
    )!;
    expect(
      marathon.workouts
        .filter((workout) => workout.weekIndex === 2)
        .map((workout) => workout.copy.zh.name),
    ).toEqual(['轻松跑', '稳态跑', '轻松跑', '轻松长跑']);
    expect(marathon.workouts[0].definition.source).toBe('STRUCTURE');
  });

  it('freezes the reviewed 10K candidate, load shape and final distance', () => {
    const template = getRunPlanTemplate('finish-10k')!;
    const variant = getPlanTemplateVariant(template)!;
    expect(template).toMatchObject({
      key: 'RUN_10K_FINISH',
      version: '1.0.0',
      goal: '10K',
      contentHash: 'fnv1a-893a47e3',
      authoring: {
        source: 'OFFLINE_AI_REVIEWED',
        promptContract: 'official-running-template-authoring/v2.1',
        candidateSha256:
          '73cef8903c96edfed44e3781d6b62d8c6af6e360f4fc8232024e94a702b3bd36',
      },
    });
    expect(variant).toMatchObject({
      id: 'standard',
      periodWeeks: 10,
      trainingDaysPerWeek: 3,
    });
    expect(
      variant.workouts
        .filter((workout) => workout.intensityKind === 'STEADY')
        .map((workout) => workout.weekIndex),
    ).toEqual([4, 6, 8]);
    expect(
      variant.workouts
        .filter(
          (workout) =>
            workout.slotIndex === 3 && workout.intensityKind === 'LONG',
        )
        .map((workout) => workout.sourceDsl),
    ).toEqual([
      'warmup 5m\nwork 40m\ncooldown 5m',
      'warmup 5m\nwork 45m\ncooldown 5m',
      'warmup 5m\nwork 45m\ncooldown 5m',
      'warmup 5m\nwork 50m\ncooldown 5m',
      'warmup 5m\nwork 50m\ncooldown 5m',
      'warmup 5m\nwork 55m\ncooldown 5m',
      'warmup 5m\nwork 60m\ncooldown 5m',
      'warmup 5m\nwork 55m\ncooldown 5m',
      'warmup 5m\nwork 50m\ncooldown 5m',
    ]);
    expect(variant.workouts.at(-1)?.sourceDsl).toBe(
      'warmup 5m\nwork 10km\ncooldown 5m',
    );
    expect(JSON.stringify(variant.workouts)).not.toMatch(
      /SPEED|HEART_RATE|POWER|zoneSystem/i,
    );
  });

  it('keeps First 5K structure free from pace and heart-rate targets', () => {
    const first = getRunPlanTemplate('first-5k')!;
    for (const variant of first.variants) {
      expect([8, 9, 10, 12]).toContain(variant.periodWeeks);
      expect(variant.trainingDaysPerWeek).toBe(3);
      for (const workout of variant.workouts) {
        expect(workout.plannedRpeRange).toEqual({ min: 3, max: 4 });
        expect(JSON.stringify(workout.definition)).not.toMatch(
          /SPEED|HEART_RATE|paceKmh/i,
        );
      }
    }
  });

  it('freezes explicit RPE ranges for each workout intent', () => {
    const finish = getPlanTemplateVariant(getRunPlanTemplate('finish-5k')!)!;
    const improve = getPlanTemplateVariant(getRunPlanTemplate('improve-5k')!)!;
    expect(
      finish.workouts
        .slice(0, 4)
        .map((workout) => [workout.intensityKind, workout.plannedRpeRange]),
    ).toEqual([
      ['EASY', { min: 3, max: 4 }],
      ['STEADY', { min: 5, max: 6 }],
      ['EASY', { min: 3, max: 4 }],
      ['LONG', { min: 3, max: 4 }],
    ]);
    expect(
      improve.workouts
        .slice(0, 4)
        .map((workout) => [workout.intensityKind, workout.plannedRpeRange]),
    ).toEqual([
      ['EASY', { min: 3, max: 4 }],
      ['INTERVAL', { min: 7, max: 8 }],
      ['EASY', { min: 3, max: 4 }],
      ['LONG', { min: 3, max: 4 }],
    ]);
  });

  it('freezes the reviewed First 5K candidate and exact progression', () => {
    const first = getRunPlanTemplate('first-5k')!;
    const standard = getPlanTemplateVariant(first, '9-week')!;
    expect(first.authoring).toEqual({
      source: 'OFFLINE_AI_REVIEWED',
      generatedAt: '2026-08-20T13:30:22.461Z',
      model: 'deepseek-v4-pro',
      promptContract: 'plan-builder/current',
      candidateSha256:
        '6eda207b84e257f21a55e4e7b4153c5e3250ed6dd044067c569e174e15eeaa84',
    });
    expect(
      standard.workouts
        .filter((workout) => workout.slotIndex === 1)
        .map((workout) => workout.sourceDsl),
    ).toEqual([
      'warmup 5m\nrepeat 6 {\n  work 1m\n  recovery 2m\n}\ncooldown 5m',
      'warmup 5m\nrepeat 7 {\n  work 1m\n  recovery 2m\n}\ncooldown 5m',
      'warmup 5m\nrepeat 6 {\n  work 2m\n  recovery 2m\n}\ncooldown 5m',
      'warmup 5m\nrepeat 5 {\n  work 3m\n  recovery 2m\n}\ncooldown 5m',
      'warmup 5m\nrepeat 4 {\n  work 4m\n  recovery 2m\n}\ncooldown 5m',
      'warmup 5m\nrepeat 4 {\n  work 5m\n  recovery 2m\n}\ncooldown 5m',
      'warmup 5m\nwork 15m\ncooldown 5m',
      'warmup 5m\nwork 20m\ncooldown 5m',
      'warmup 5m\nwork 15m\ncooldown 5m',
    ]);
    expect(standard.workouts.at(-1)?.sourceDsl).toBe(
      'warmup 10m\nwork 5km\ncooldown 10m',
    );
  });

  it('freezes reviewed Finish and Improve progressions', () => {
    const finish = getRunPlanTemplate('finish-5k')!;
    const improve = getRunPlanTemplate('improve-5k')!;
    expect(finish.authoring).toEqual({
      source: 'OFFLINE_AI_REVIEWED',
      generatedAt: '2026-08-20T13:58:52.990Z',
      model: 'deepseek-v4-pro',
      promptContract: 'plan-builder/current',
      candidateSha256:
        'c8263d9ff7d0f1118349527b8b57e6959180096a162642661f94d670bbdc1a73',
    });
    expect(improve.authoring).toEqual({
      source: 'OFFLINE_AI_REVIEWED',
      generatedAt: '2026-08-20T14:09:04.876Z',
      model: 'deepseek-v4-pro',
      promptContract: 'plan-builder/current',
      candidateSha256:
        '0c69c3e94fb095d44e81e30f36260287663718ba2c73e141a2d034a60c62c292',
    });

    expect(
      getPlanTemplateVariant(finish)!
        .workouts.filter((workout) => workout.slotIndex === 4)
        .map((workout) => workout.sourceDsl),
    ).toEqual([
      'warmup 5m\nwork 25m\ncooldown 5m',
      'warmup 5m\nwork 30m\ncooldown 5m',
      'warmup 5m\nwork 35m\ncooldown 5m',
      'warmup 5m\nwork 30m\ncooldown 5m',
      'warmup 5m\nwork 40m\ncooldown 5m',
      'warmup 5m\nwork 45m\ncooldown 5m',
      'warmup 5m\nwork 30m\ncooldown 5m',
      'warmup 10m\nwork 5km\ncooldown 10m',
    ]);
    expect(
      getPlanTemplateVariant(improve)!
        .workouts.filter((workout) => workout.slotIndex === 2)
        .map((workout) => workout.sourceDsl),
    ).toEqual([
      'warmup 10m\nrepeat 6 {\n  work 1m\n  recovery 2m\n}\ncooldown 10m',
      'warmup 10m\nwork 15m\ncooldown 10m',
      'warmup 10m\nrepeat 5 {\n  work 2m\n  recovery 2m\n}\ncooldown 10m',
      'warmup 10m\nwork 12m\ncooldown 10m',
      'warmup 10m\nrepeat 6 {\n  work 2m\n  recovery 2m\n}\ncooldown 10m',
      'warmup 10m\nwork 20m\ncooldown 10m',
      'warmup 10m\nrepeat 4 {\n  work 1m\n  recovery 2m\n}\ncooldown 10m',
      'warmup 10m\nwork 10m\ncooldown 10m',
    ]);
  });

  it('round-trips every frozen workout DSL to canonical structure', () => {
    const definitions = workoutDefinitions();
    for (const template of RUN_PLAN_TEMPLATES) {
      for (const variant of template.variants) {
        for (const workout of variant.workouts) {
          expect(workout.sourceDsl).toBeTruthy();
          const resolved = definitions.resolve({
            kind: 'ENDURANCE',
            version: 1,
            source: 'TEXT',
            text: workout.sourceDsl,
          });
          expect(resolved.structure).toEqual(
            workout.definition.source === 'STRUCTURE'
              ? workout.definition.structure
              : null,
          );
        }
      }
    }
  });

  it('adds VDOT targets only when Improve has a reliable 5K anchor', () => {
    const template = getRunPlanTemplate('improve-5k')!;
    const variant = getPlanTemplateVariant(template)!;
    const input = {
      template,
      variant,
      locale: 'en',
      preferredWeekdays: [1, 3, 5, 7],
      requestedStartDate: '2026-09-07',
    };
    const withoutAnchor = buildPlanTemplateDraft(input);
    const withAnchor = buildPlanTemplateDraft({
      ...input,
      recent5kSeconds: 1_500,
    });
    expect(JSON.stringify(withoutAnchor)).not.toContain('"zoneSystem":"VDOT"');
    expect(JSON.stringify(withAnchor)).toContain('"zoneSystem":"VDOT"');
  });

  it('maps ISO weekdays relative to the requested local start date', () => {
    const template = getRunPlanTemplate('first-5k')!;
    const variant = getPlanTemplateVariant(template, '9-week')!;
    const draft = buildPlanTemplateDraft({
      template,
      variant,
      locale: 'en',
      preferredWeekdays: [1, 3, 6],
      requestedStartDate: '2026-09-09', // Wednesday
    });
    expect(
      draft.workouts
        .filter((workout) => workout.weekIndex === 1)
        .map((workout) => workout.dayIndex),
    ).toEqual([1, 4, 6]);
    expect(draft.workouts.map((workout) => workout.plannedSessionRpe)).toEqual(
      variant.workouts.map((workout) => workout.plannedRpe),
    );
  });
});
