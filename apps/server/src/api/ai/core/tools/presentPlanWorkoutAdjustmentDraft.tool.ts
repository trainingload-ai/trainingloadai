/**
 * 对话里的单课调整草案。确认后走 CoachDecision，不再只是前端 PATCH。
 *
 * execute 会 openBranch(conversation_adjustment) + squash PLAN_WORKOUT_UPDATE，
 * 返回 decisionId。旧消息没有 id 时，前端仍走原来的 updateWorkout。
 * 这一步不改 PlanWorkout。
 */
import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import {
  PLAN_WORKOUT_ADJUSTMENT_DRAFT_TYPE,
  parsePlanWorkoutAdjustmentDraftData,
  planWorkoutAdjustmentDraftToolParametersSchema,
  type PlanWorkoutAdjustmentDraftData,
} from '../../../../../../../packages/shared/ai-coach-schema';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';
import { adjustmentDraftToWorkoutUpdatePayload } from '@shared/coach-adjustment-decision';
import { workoutChangeDiff } from '../coach-workout-change';

type Input = PlanWorkoutAdjustmentDraftData;

type Output = {
  kind: typeof PLAN_WORKOUT_ADJUSTMENT_DRAFT_TYPE;
} & PlanWorkoutAdjustmentDraftData;

export const presentPlanWorkoutAdjustmentDraftTool: AiToolDef<Input, Output> =
  buildAiTool({
    name: 'present_plan_workout_adjustment_draft',
    aliases: ['plan_workout_adjustment_draft', 'show_workout_adjustment_draft'],
    description:
      'Create one proposed CoachDecision for a single planned-workout adjustment after the user has agreed to a direction. This writes a PROPOSED decision; it does not change PlanWorkout until the user confirms. The after.text must be valid Trainingload.ai workout DSL.',
    searchHint: 'show workout adjustment before after preview decision draft',
    cost: 'low',
    kind: 'draft',
    applicableSkills: [...PLAN_REVIEW_SKILLS],
    maxResultChars: 16_000,
    isReadOnly: false,
    isConcurrencySafe: false,
    isEnabled: async (ctx) =>
      ctx.athleteStateSafetyMode !== 'HIGH_CONCERN' && hasSignedInUser(ctx),
    parameters: planWorkoutAdjustmentDraftToolParametersSchema,
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    validateInput: async (ctx, input) => {
      const parsed = parsePlanWorkoutAdjustmentDraftData(input);
      if (!parsed.ok) return aiToolError(parsed.error, 'INVALID_INPUT');

      try {
        ctx.workoutService.parsePlanText(parsed.data.after.text);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'workout DSL parse failed';
        return aiToolError(
          `after.text must be valid workout DSL: ${msg}`,
          'INVALID_INPUT',
        );
      }
      return { ok: true };
    },
    execute: async (ctx, input) => {
      const signedInUser = ctx.session?.user?.id;
      if (!signedInUser || !ctx.planService || !ctx.coachBranching)
        throw new Error('A signed-in plan context is required');
      const { workout: actual } = await ctx.planService.getWorkoutDetail(
        signedInUser,
        input.planId,
        input.workoutId,
      );
      const draft: PlanWorkoutAdjustmentDraftData = {
        planId: input.planId,
        workoutId: input.workoutId,
        title: input.title.trim(),
        reason: input.reason.trim(),
        before: {
          weekIndex: actual.weekIndex,
          dayIndex: actual.dayIndex,
          sessionIndex: actual.sessionIndex,
          name: actual.name ?? undefined,
          notes: actual.notes ?? undefined,
          text: actual.text,
          sportType: actual.sportType,
          scheduledDate: actual.scheduledDate ?? undefined,
        },
        after: {
          ...input.after,
          sessionIndex: input.after.sessionIndex ?? actual.sessionIndex,
          name:
            input.after.name === undefined
              ? (actual.name ?? undefined)
              : input.after.name.trim(),
          notes:
            input.after.notes === undefined
              ? (actual.notes ?? undefined)
              : input.after.notes.trim(),
          text: input.after.text.trim(),
          sportType: input.after.sportType.trim(),
          scheduledDate: actual.scheduledDate
            ? new Date(
                Date.parse(`${actual.scheduledDate}T00:00:00Z`) +
                  ((input.after.weekIndex - actual.weekIndex) * 7 +
                    input.after.dayIndex -
                    actual.dayIndex) *
                    86_400_000,
              )
                .toISOString()
                .slice(0, 10)
            : undefined,
        },
        changes: [],
      };
      draft.changes = workoutChangeDiff(draft.before, draft.after).map(
        (change) => ({
          field: change.field,
          // Diff strings are presentation only. Keep actual empty values in
          // draft.after / the stored decision, not in these non-empty labels.
          before: String(change.before ?? '').trim() || '—',
          after: String(change.after ?? '').trim() || '—',
        }),
      );

      const userId = ctx.session?.user?.id;
      let decisionId: string | undefined;
      if (userId && ctx.coachBranching) {
        let branchId = String(ctx.branchId ?? '').trim();
        if (!branchId) {
          const opened = await ctx.coachBranching.openBranch({
            userId,
            planId: draft.planId,
            openReason: 'conversation_adjustment',
            sourceNode: {
              page: 'conversation_adjustment',
              planId: draft.planId,
              workoutId: draft.workoutId,
            },
          });
          branchId = opened.branch.id;
        }
        const squashed = await ctx.coachBranching.squashBranch({
          userId,
          branchId,
          riskTier: 'HIGH',
          decisionType: 'PLAN_WORKOUT_UPDATE',
          payload: adjustmentDraftToWorkoutUpdatePayload(draft),
          rationale: draft.reason,
          options: [
            {
              optionKey: 'apply',
              title: draft.title,
              isSelected: true,
            },
            {
              optionKey: 'keep',
              title: 'Keep the plan',
              isSelected: false,
            },
          ],
        });
        decisionId = squashed.decision.id;
      }

      return {
        kind: PLAN_WORKOUT_ADJUSTMENT_DRAFT_TYPE,
        ...draft,
        ...(decisionId ? { decisionId } : {}),
      };
    },
  });
