import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
} from '../tool.types';
import type { ActivitySeriesOptions } from '@/api/activity/activity-series-summary';
import type { ActivitySeriesQueryService } from '@/api/activity/activity-series-query.service';

type Input = ActivitySeriesOptions & { hashId: string };
export const activitySeriesTool = buildAiTool<
  Input,
  Awaited<ReturnType<ActivitySeriesQueryService['query']>>
>({
  name: 'activity.series',
  description:
    'Read time-weighted recorded HR, power, speed, cadence and grade for one owned activity. Use before segment, climbing, moving-only or zero-power claims. Returns filter coverage and bounded time buckets; never substitutes estimated power or missing values.',
  searchHint:
    'activity time series segment climbing cadence exclude zero power moving',
  cost: 'medium',
  maxResultChars: 60_000,
  isEnabled: (ctx) => hasSignedInUser(ctx) && Boolean(ctx.activitySeries),
  checkPermissions: (ctx) => requireSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['hashId'],
    properties: {
      hashId: { type: 'string' },
      fromSecond: { type: 'number', minimum: 0 },
      toSecond: { type: 'number', exclusiveMinimum: 0 },
      movingOnly: { type: 'boolean' },
      excludeZeroPower: { type: 'boolean' },
      minGrade: { type: 'number', minimum: -100, maximum: 100 },
      maxGrade: { type: 'number', minimum: -100, maximum: 100 },
      maxPoints: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
    },
  },
  validateInput: (_ctx, input) => {
    if (typeof input.hashId !== 'string' || !input.hashId.trim())
      return aiToolError('hashId is required', 'INVALID_INPUT');
    for (const key of [
      'fromSecond',
      'toSecond',
      'minGrade',
      'maxGrade',
      'maxPoints',
    ] as const) {
      if (
        input[key] !== undefined &&
        (typeof input[key] !== 'number' || !Number.isFinite(input[key]))
      )
        return aiToolError(`Invalid ${key}`, 'INVALID_INPUT');
    }
    if (
      (input.fromSecond ?? 0) < 0 ||
      (input.toSecond !== undefined &&
        input.toSecond <= (input.fromSecond ?? 0)) ||
      (input.minGrade !== undefined && Math.abs(input.minGrade) > 100) ||
      (input.maxGrade !== undefined && Math.abs(input.maxGrade) > 100) ||
      (input.minGrade !== undefined &&
        input.maxGrade !== undefined &&
        input.minGrade > input.maxGrade) ||
      (input.maxPoints !== undefined &&
        (!Number.isInteger(input.maxPoints) ||
          input.maxPoints < 1 ||
          input.maxPoints > 120)) ||
      ['movingOnly', 'excludeZeroPower'].some(
        (key) => input[key] !== undefined && typeof input[key] !== 'boolean',
      )
    ) {
      return aiToolError('Invalid series range or filters', 'INVALID_INPUT');
    }
    return { ok: true };
  },
  execute: (ctx, input) =>
    ctx.activitySeries.query(ctx.session.user.id, input.hashId.trim(), input),
});
