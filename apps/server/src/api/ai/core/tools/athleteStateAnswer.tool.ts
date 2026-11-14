import {
  ATHLETE_STATE_RESULT_SCHEMA,
  type AthleteStateSkillResult,
} from '../../athlete-state/athlete-state-result.contract';
import { aiToolError, buildAiTool, type AiToolDef } from '../tool.types';
import {
  ATHLETE_STATE_SKILL,
  ATHLETE_STATE_ANSWER_TOOL,
} from '../skills/athleteState.skill';

/** The skill's structured answer uses the same execution and result-validation loop. */
export const athleteStateAnswerTool: AiToolDef<
  { result: AthleteStateSkillResult },
  Record<string, unknown>
> = buildAiTool({
  name: ATHLETE_STATE_ANSWER_TOOL,
  description:
    'Submit the current Athlete State assessment after reading authoritative evidence. The server validates and saves the derived state. Passive updates should normally finish using available facts and explicit uncertainty. Ask the athlete only when their answer is essential to resolve a concrete current concern and would materially change the judgment; missing data alone does not require a question.',
  kind: 'read',
  cost: 'low',
  isReadOnly: true,
  isConcurrencySafe: false,
  applicableSkills: [ATHLETE_STATE_SKILL],
  isEnabled: (ctx) =>
    Boolean(ctx.athleteState) && ctx.activeSkillName === ATHLETE_STATE_SKILL,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['result'],
    properties: { result: ATHLETE_STATE_RESULT_SCHEMA },
  },
  validateInput: (ctx, input) =>
    !ctx.athleteState
      ? aiToolError(
          'No Athlete State turn is active',
          'ATHLETE_STATE_TURN_REQUIRED',
        )
      : !input.result || typeof input.result !== 'object'
        ? aiToolError(
            'A structured assessment result is required',
            'RESULT_REQUIRED',
          )
        : { ok: true },
  execute: async (ctx, input) => ({
    kind: ctx.backgroundTask
      ? 'coach_task_result_accepted'
      : 'athlete_state_saved',
    taskType: 'ATHLETE_STATE_UPDATE',
    ...(await ctx.athleteState!.submit(input.result)),
  }),
});
