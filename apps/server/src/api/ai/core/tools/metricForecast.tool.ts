import type { VdotForecastResult } from '@shared/vdot-forecast';
import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

export const metricForecastTool: AiToolDef<
  {
    metric: 'vdot' | 'vo2Max';
    horizonWeeks?: 4;
  },
  VdotForecastResult
> = buildAiTool({
  name: 'metric.forecast',
  description:
    "Read the signed-in runner's four-week VDOT forecast. Use for future VO2max/VDOT, next month, expected improvement or decline. Returns the same forecast as the home card, including weekly estimates, calibrated 80% intervals, cutoff and evidence coverage. Explain returned numbers and status. The model uses historical VDOT only. Training changes require a different model. An unavailable result has no numerical forecast.",
  searchHint:
    'future forecast prediction next month four weeks VO2max VDOT 一个月 四周 预测 提升 趋势',
  cost: 'low',
  maxResultChars: 8_000,
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['metric'],
    properties: {
      metric: { type: 'string', enum: ['vdot', 'vo2Max'] },
      horizonWeeks: { type: 'integer', enum: [4] },
    },
  },
  execute: async (ctx) => ctx.pmc.getVdotForecast(ctx.session.user.id),
  summarizeForModel: ({ output }) => output,
});
