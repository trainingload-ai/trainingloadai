import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PlanCalendarCoachSession } from '@shared/plan-proposal';
import type { CoachBranchingService } from '../coach-branching.service';
import type { CoachQueryYield } from '../core/coach-query-yield';
import type { CoachTurnInput } from '../core/coach-turn-input';
import { planFollowupSkill } from '../core/skills/planFollowup.skill';
import { streamCoachAnswer } from '../core/tool-loop-agent.runtime';
import { applyConfirmedCoachDecision } from '../core/tools/coachDecisionApply.tool';

const PREVIEW_TOOLS = ['plan.proposal_preview', 'coach_decision_draft'];

export function streamTrainingAdjustment(
  turn: Parameters<typeof streamCoachAnswer>[0],
  session: PlanCalendarCoachSession,
) {
  return streamCoachAnswer({
    ...turn,
    maxSteps: Math.min(turn.maxSteps ?? 8, 8),
    activeSkill: {
      ...planFollowupSkill,
      activatedBy: 'calendar-adjustment',
      suggestedTools: planFollowupSkill.suggestedTools ?? [],
      prompt: [
        '1. Read the opened plan with plan.by_id using bound planId and range as calendarFrom and calendarTo. Check the affected weeks, actual spacing, nearby workouts and effective constraints.',
        '2. Decide whether the date change alone still meets the athlete’s plan and recovery needs. Crossing a week boundary or changing neighboring dates alone does not justify more edits. The server includes the selected move and supplies the date range. For a move alone, submit empty changes, additions and deletions. Otherwise include only justified extra edits and retained edits from the last draft. Use current workout IDs and revisions. Editing the moved workout’s content is allowed while its destination stays fixed.',
        '3. Call plan.proposal_preview with mode SCHEDULE, bound planId, a short rationale, evidenceRefs and explicit workout edits. Then call coach_decision_draft with decisionType PLAN_SCHEDULE and payload set to the returned decisionPayload, which contains only planId and previewId. Use the preview’s changedRows for the card rationale and reply. If a workout is absent from those rows, describe any advice about it as optional guidance. Say consecutive dates are consecutive training days. The proposal awaits user confirmation.',
        'For a move alone, report each week’s before and after values from the bound impact. When there are additional edits, only give weekly totals if the available evidence covers the whole revised week. Compare dates explicitly for cross-week moves.',
        'If validation rejects the draft, correct the specific reason once. If you cannot resolve it, explain the constraint or ask one focused question. A different destination for the original workout requires a new move on the calendar.',
      ].join('\n'),
    },
    tools: turn.tools.filter(
      (tool) =>
        PREVIEW_TOOLS.includes(tool.name) ||
        (tool.kind !== 'mutation' &&
          tool.kind !== 'draft' &&
          tool.isReadOnly !== false &&
          tool.name !== 'skill.activate'),
    ),
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          kind: 'bound_calendar_move',
          planId: session.planId,
          range: session.range,
          impact: session.impact,
        }),
      },
      ...turn.messages,
    ],
  });
}

export async function* confirmTrainingAdjustment(args: {
  branching: CoachBranchingService;
  userId: string;
  sid: string;
  branchId?: string | null;
  decisionId: string;
  assistantMessageId?: string;
  comment: string;
  proposedBefore: Date;
  signal: AbortSignal;
  onActivity?: CoachTurnInput['onActivity'];
}): AsyncGenerator<CoachQueryYield, void, undefined> {
  const { branching, userId, sid, branchId, decisionId, assistantMessageId } =
    args;
  if (
    !assistantMessageId ||
    !branchId ||
    (await branching.decisionConversationBranch(userId, sid, decisionId)) !==
      branchId
  ) {
    throw new ConflictException('CALENDAR_CONFIRMATION_MISMATCH');
  }
  const id = randomUUID();
  const activity = {
    key: `tool:${id}`,
    kind: 'tool' as const,
    labelKey: 'tool' as const,
    toolName: 'coach_decision_apply',
    toolCallId: id,
    mutation: true,
  };
  await args.onActivity?.({ ...activity, status: 'running' });
  let receipt: Awaited<ReturnType<typeof applyConfirmedCoachDecision>>;
  try {
    args.signal.throwIfAborted();
    receipt = await applyConfirmedCoachDecision(branching, {
      userId,
      branchId,
      decisionId,
      comment: args.comment,
      proposedBefore: args.proposedBefore,
      confirmation: { sid, assistantMessageId },
    });
  } catch (error) {
    await args.onActivity?.({ ...activity, status: 'failed' });
    throw error;
  }
  await args.onActivity?.({ ...activity, status: 'completed' });
  yield {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id, name: 'CoachDecisionApplied', input: receipt },
      ],
    },
  };
  yield { type: 'result', subtype: 'success', is_error: false, result: '' };
}
