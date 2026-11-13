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
    "Read the signed-in runner's four-week VO2max forecast. The athlete-facing product name is 最大摄氧量 in Simplified Chinese or VO2max in English. Use for next month or expected improvement/decline. Returns weekly estimates, intervals labeled by intervalKind: REFERENCE is a model-based reference range without an empirical coverage guarantee; CALIBRATED_80 is a validated 80% prediction interval, cutoff and evidence coverage from the same service as the home card. A full metric interpretation also needs the authoritative current metric and relevant history. The forecast uses historical metric values only; it cannot quantify proposed training changes. An unavailable result has no numerical forecast.",
  searchHint:
    'future forecast prediction next month four weeks VO2max 最大摄氧量 一个月 四周 预测 提升 趋势',
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
  summarizeForModel: ({ output }) => {
    const { dailyForecasts, ...summary } = output;
    return summary;
  },
});
