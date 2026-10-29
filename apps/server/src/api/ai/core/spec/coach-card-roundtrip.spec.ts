import { describe, expect, it, jest } from '@jest/globals';
import { uiSurfaceAssistantForToolResult } from '../tool-loop-agent.runtime';
import { coachQueryYieldsToUIMessageStream } from '../coach-ui-message-stream';
import { buildStoredCoachUiMessageEnvelope } from '../coach-history-messages';
import { presentCoachPlanDraftTool } from '../tools/presentCoachPlanDraft.tool';
import { presentPlanWorkoutAdjustmentDraftTool } from '../tools/presentPlanWorkoutAdjustmentDraft.tool';
import {
  parseCoachPlanDraftData,
  parsePlanWorkoutAdjustmentDraftData,
} from '@shared/ai-coach-schema';
import { adjustmentDraftToWorkoutUpdatePayload } from '@shared/coach-adjustment-decision';
import { assessPlanQuality } from '@shared/plan-quality';
import {
  auditConversation,
  AuditRedactor,
} from '../../audit/coach-conversation-audit';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { WorkoutService } from '@/api/workout/workout.service';

const workoutDefinitions = new WorkoutDefinitionService(
  new WorkoutCodecRegistry(
    new EnduranceWorkoutCodec(new WorkoutService({} as never)),
    new StrengthWorkoutCodec(),
    new FreeformWorkoutCodec(),
  ),
);

async function roundtrip(name: string, output: unknown) {
  const event = uiSurfaceAssistantForToolResult({
    id: 'provider-call-1',
    name,
    output,
    input: {},
    ok: true,
  });
  if (!event || event.type !== 'assistant')
    throw new Error('Missing assistant card');
  async function* events() {
    yield event;
  }
  const reader = coachQueryYieldsToUIMessageStream(events()).getReader();
  let input: unknown;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value.type === 'data-coach-tool') {
        expect(next.value.data.toolCallId).toBe('provider-call-1');
        input = next.value.data.input;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const stored = buildStoredCoachUiMessageEnvelope({
    role: 'assistant',
    content: '',
    message: event.message,
  });
  expect(stored.parts).toEqual([
    expect.objectContaining({
      type: 'data-coach-tool',
      data: expect.objectContaining({ input }),
    }),
  ]);
  expect(
    auditConversation(
      [{ sequence: 1, role: 'ASSISTANT', content: '', message: stored }],
      new AuditRedactor(),
    )[0].delivery,
  ).toBe('cards_only');
  return input;
}

describe('real tool -> card stream -> storage -> client parsing contracts', () => {
  it('preserves enforceable plan constraints through the public card parser', async () => {
    const qualityContract = {
      startDate: '2026-09-07',
      weekPhases: ['BUILD', 'RECOVERY'] as const,
      maxDailyMinutes: 60,
    };
    const output = await presentCoachPlanDraftTool.execute(
      {
        i18n: { t: (key: string) => key },
        lang: 'zh',
        workoutDefinitions,
      } as never,
      {
        title: 'Two weeks',
        periodWeeks: 2,
        qualityContract: {
          ...qualityContract,
          weekPhases: [...qualityContract.weekPhases],
        },
        workouts: [
          { weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 30m' },
          { weekIndex: 2, dayIndex: 1, sportType: 'RUN', text: 'work 20m' },
        ],
      },
    );
    const input = await roundtrip('present_coach_plan_draft', output);
    const web = parseCoachPlanDraftData(input);
    expect(web.ok && web.data.qualityContract).toEqual(qualityContract);
    expect(input).toMatchObject({ qualityReport: { valid: true } });
    if (!web.ok) throw new Error(web.error);
    // The emitted contract still rejects a tampered recovery duration.
    const report = assessPlanQuality(
      web.data.periodWeeks,
      web.data.workouts.map((w) => ({ ...w, durationSeconds: 1800 })),
      web.data.qualityContract,
    );
    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: 'RECOVERY_NOT_REDUCED' }),
    );
  });

  it.each([
    {
      field: 'notes',
      before: undefined,
      after: 'Keep it easy',
      oldLabel: '—',
      newLabel: 'Keep it easy',
    },
    {
      field: 'notes',
      before: 'Old note',
      after: '',
      oldLabel: 'Old note',
      newLabel: '—',
    },
    {
      field: 'name',
      before: undefined,
      after: 'Easy run',
      oldLabel: '—',
      newLabel: 'Easy run',
    },
    {
      field: 'name',
      before: 'Old name',
      after: '',
      oldLabel: 'Old name',
      newLabel: '—',
    },
  ])(
    'keeps $field add/clear changes renderable and the stored write intact',
    async ({ field, before, after, oldLabel, newLabel }) => {
      const workout = {
        weekIndex: 1,
        dayIndex: 1,
        sessionIndex: 1,
        sportType: 'RUN',
        text: 'work 30m',
        [field]: before,
      };
      const squashBranch = jest.fn(async (_args: unknown) => ({
        decision: { id: 'stored-decision' },
      }));
      const output = await presentPlanWorkoutAdjustmentDraftTool.execute(
        {
          session: { user: { id: 'user' } },
          branchId: 'branch',
          planService: { getWorkoutDetail: async () => ({ workout }) },
          coachBranching: { squashBranch },
        } as never,
        {
          planId: 'plan',
          workoutId: 'workout',
          title: 'Adjust',
          reason: 'User request',
          before: workout,
          after: { ...workout, [field]: after },
          changes: [{ field, before: oldLabel, after: newLabel }],
        },
      );
      expect(squashBranch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            dto: expect.objectContaining({ [field]: after }),
          }),
        }),
      );
      expect(output.after[field]).toBe(after);
      expect(output.changes).toContainEqual({
        field,
        before: oldLabel,
        after: newLabel,
      });
      const input = await roundtrip(
        'present_plan_workout_adjustment_draft',
        output,
      );
      const web = parsePlanWorkoutAdjustmentDraftData(input);
      expect(web.ok && web.data.decisionId).toBe('stored-decision');
      expect(web.ok && web.data.changes).toContainEqual({
        field,
        before: oldLabel,
        after: newLabel,
        reason: undefined,
      });
    },
  );

  it('does not turn failure output into a successful interactive card', () => {
    expect(
      uiSurfaceAssistantForToolResult({
        id: 'failed',
        name: 'present_coach_plan_draft',
        output: { kind: 'coach_plan_draft' },
        input: {},
        ok: false,
      }),
    ).toBeNull();
  });

  it('keeps legacy adjustments without decision IDs readable without inventing approval', async () => {
    const w = { weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 30m' };
    const input = await roundtrip('present_plan_workout_adjustment_draft', {
      kind: 'plan_workout_adjustment_draft',
      planId: 'p',
      workoutId: 'w',
      title: 'Legacy',
      reason: 'Reduce',
      before: w,
      after: { ...w, text: 'work 20m' },
      changes: [{ field: 'text', before: 'work 30m', after: 'work 20m' }],
    });
    const web = parsePlanWorkoutAdjustmentDraftData(input);
    expect(web.ok).toBe(true);
    expect(web.ok && web.data.decisionId).toBeUndefined();
  });

  it('does not translate omitted optional fields into clear operations', () => {
    const w = { weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 30m' };
    const payload = adjustmentDraftToWorkoutUpdatePayload({
      planId: 'p',
      workoutId: 'w',
      reason: 'Reduce',
      before: { ...w, notes: 'keep' },
      after: w,
    });
    expect(payload.dto).not.toHaveProperty('notes');
    expect(payload.dto).not.toHaveProperty('name');
  });
});
