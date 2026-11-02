import { z } from 'zod';
const date = z.date().refine((value) => Number.isFinite(value.getTime()));
const day = date.refine((value) =>
  value.toISOString().endsWith('T00:00:00.000Z'),
);
const common = z.object({
  externalId: z.string().min(1).max(512),
  localDate: day,
  timezone: z.string().min(1).max(100).nullable().optional(),
  offsetSeconds: z.number().int().min(-86400).max(86400).nullable().optional(),
});
const blood = common
  .extend({
    kind: z.literal('BLOOD_PRESSURE'),
    scope: z.literal('MEASUREMENT'),
    measuredAt: date,
    systolicMmHg: z.number().positive().lt(1000),
    diastolicMmHg: z.number().positive().lt(1000),
    pulseBpm: z.number().min(0).max(300).nullable().optional(),
    measurementOrigin: z.enum(['DEVICE', 'MANUAL', 'UNKNOWN']),
  })
  .strict();
const category = common.extend({
  kind: z.literal('BREATHING_VARIATION'),
  categorySystem: z
    .string()
    .min(1)
    .max(192)
    .regex(/^[\x21-\x7e]+$/),
  categoryCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9_:-]+$/),
});
const daily = category.extend({ scope: z.literal('DAILY') }).strict();
const interval = category
  .extend({
    scope: z.literal('INTERVAL'),
    intervalStart: date,
    intervalEnd: date,
  })
  .strict();
export const healthObservationCandidate = z
  .discriminatedUnion('scope', [blood, daily, interval])
  .refine(
    (value) =>
      value.scope !== 'INTERVAL' || value.intervalEnd > value.intervalStart,
    { message: 'HEALTH_OBSERVATION_INTERVAL_INVALID' },
  );
export type HealthObservationCandidate = z.infer<
  typeof healthObservationCandidate
>;
