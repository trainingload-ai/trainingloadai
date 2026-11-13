import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
} from '../tool.types';

/** Selected daily facts preserve their local date, unit and source. */
export const healthSummaryTool = buildAiTool<
  { days?: number; endDate?: string },
  unknown
>({
  name: 'health.summary',
  description:
    'Read selected daily health facts for the signed-in athlete: sleep, HRV (rMSSD and SDNN separately), resting heart rate and other recorded measures. Includes local dates, units and selected providers. Missing measures are not abnormalities.',
  cost: 'low',
  isEnabled: (ctx) => hasSignedInUser(ctx) && !!ctx.healthData,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      days: { type: 'integer', minimum: 7, maximum: 90 },
      endDate: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description:
          'Inclusive athlete-local date (YYYY-MM-DD); defaults to today.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  execute: (ctx, input) =>
    ctx.healthData!.getOverview(
      ctx.session!.user.id,
      input.days ?? 42,
      input.endDate,
    ),
});
