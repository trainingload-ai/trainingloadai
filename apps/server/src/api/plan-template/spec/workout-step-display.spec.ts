import { describe, expect, it } from '@jest/globals';
import { workoutDefinitionStepLines } from '../../../../../../packages/shared/plan-templates/workout-step-display';
import type { WorkoutDefinitionInput } from '../../../../../../packages/shared/workout-structure';

describe('workoutDefinitionStepLines', () => {
  const definition: WorkoutDefinitionInput = {
    kind: 'ENDURANCE',
    version: 1,
    source: 'STRUCTURE',
    structure: {
      kind: 'ENDURANCE',
      version: 1,
      blocks: [
        {
          type: 'work',
          steps: [{ duration: 600, stepKind: 'WARMUP' }],
        },
        {
          type: 'repeat',
          count: 3,
          children: [
            {
              type: 'work',
              steps: [
                {
                  duration: 300,
                  stepKind: 'WORK',
                  primaryTargetMeta: {
                    kind: 'SPEED',
                    value: 240,
                    valueHigh: 250,
                    unit: 'sec/km',
                  },
                },
              ],
            },
            {
              type: 'rest',
              steps: [{ duration: 120, stepKind: 'RECOVERY' }],
            },
          ],
        },
        {
          type: 'work',
          steps: [{ duration: 600, stepKind: 'COOLDOWN' }],
        },
      ],
    },
  };

  it('shows a complete localized prescription with repeats and pace', () => {
    expect(workoutDefinitionStepLines(definition, 'zh')).toEqual([
      '热身 · 10 分钟',
      '重复 3 组：主训练 · 5 分钟 · 4:00–4:10/km；恢复 · 2 分钟',
      '冷身 · 10 分钟',
    ]);
    expect(workoutDefinitionStepLines(definition, 'en')).toEqual([
      'Warm-up · 10 min',
      'Repeat 3 times: Main set · 5 min · 4:00–4:10/km; Recovery · 2 min',
      'Cool-down · 10 min',
    ]);
  });
});
