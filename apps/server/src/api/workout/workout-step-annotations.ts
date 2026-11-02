import { z } from 'zod';
import type {
  EnduranceWorkRestStep,
  EnduranceWorkoutStepTarget,
} from '../../../../../packages/shared/endurance-workout-ir';

const finite = z.number().finite();
const target = z
  .object({
    kind: z.enum([
      'NONE',
      'SPEED',
      'CADENCE',
      'HEART_RATE_ZONE',
      'HEART_RATE_CUSTOM',
      'POWER_ZONE',
      'POWER_CUSTOM',
    ]),
    value: finite.optional(),
    valueHigh: finite.optional(),
    zoneIndex: z.number().int().positive().optional(),
    zoneLabel: z.string().max(160).optional(),
    zoneSystem: z.string().max(160).optional(),
    zoneSource: z.string().max(160).optional(),
    zoneBasis: z.record(z.string(), z.unknown()).nullable().optional(),
    intensityIntent: z
      .object({
        family: z.enum([
          'RECOVERY',
          'EASY',
          'ENDURANCE',
          'STEADY',
          'TEMPO',
          'THRESHOLD',
          'VO2MAX',
          'ANAEROBIC',
          'SPRINT',
          'RACE_PACE',
          'TECHNIQUE',
          'OTHER',
        ]),
        purpose: z.string().optional(),
        source: z
          .enum(['PLAN_BUILDER', 'AI_COACH', 'TEMPLATE', 'USER'])
          .optional(),
        auxiliaryRpe: z
          .object({ low: finite, high: finite.optional() })
          .nullable()
          .optional(),
      })
      .strict()
      .nullable()
      .optional(),
    resolutionMode: z
      .enum(['LEGACY_SNAPSHOT', 'DYNAMIC_ZONE', 'FIXED_VALUE', 'EFFORT_ONLY'])
      .optional(),
    zoneSystemKey: z.string().max(160).optional(),
    zoneFingerprint: z.string().max(160).optional(),
    unit: z.string().max(40).optional(),
  })
  .strict();
const annotations = z
  .object({
    version: z.literal(1),
    swimMeta: z
      .object({
        stroke: z
          .enum([
            'FREESTYLE',
            'BREASTSTROKE',
            'BACKSTROKE',
            'BUTTERFLY',
            'DRILL',
            'MEDLEY',
          ])
          .optional(),
        trainingType: z.enum(['KICK', 'PULL', 'DRILL']).optional(),
        equipment: z
          .enum(['FINS', 'KICKBOARD', 'PADDLES', 'PULL_BUOY', 'SNORKEL'])
          .optional(),
      })
      .strict()
      .nullable()
      .optional(),
    secondaryTarget: target.nullable().optional(),
  })
  .strict();

/** Only the two existing IR annotations belong here; vendor payloads do not. */
export function encodeWorkoutStepAnnotations(
  step: Pick<EnduranceWorkRestStep, 'swimMeta' | 'secondaryTarget'>,
) {
  if (step.swimMeta == null && step.secondaryTarget == null) return undefined;
  const value = {
    version: 1,
    ...(step.swimMeta != null ? { swimMeta: step.swimMeta } : {}),
    ...(step.secondaryTarget != null
      ? { secondaryTarget: step.secondaryTarget }
      : {}),
  };
  if (Buffer.byteLength(JSON.stringify(value)) > 8192)
    throw new Error('WORKOUT_STEP_ANNOTATIONS_TOO_LARGE');
  return annotations.parse(value);
}
export function decodeWorkoutStepAnnotations(
  value: unknown,
): Pick<EnduranceWorkRestStep, 'swimMeta' | 'secondaryTarget'> {
  if (value == null) return {};
  const parsed = annotations.parse(value);
  return {
    ...(parsed.swimMeta ? { swimMeta: parsed.swimMeta } : {}),
    ...(parsed.secondaryTarget
      ? {
          secondaryTarget: parsed.secondaryTarget as EnduranceWorkoutStepTarget,
        }
      : {}),
  };
}
