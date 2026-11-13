import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AthleteStateUpdates } from '@/athlete-state/updates/athlete-state-updates.service';
import { AthleteStateFeatureFlags } from '@/athlete-state/athlete-state-feature-flags.service';
import {
  ATHLETE_STATE_REASSESS_REQUESTED_EVENT,
  type AthleteStateReassessRequestedEvent,
} from '@/athlete-state/athlete-state.events';
import { UserService } from '@/api/user/user.service';
import { AiService } from '../ai.service';
import {
  ATHLETE_STATE_SKILL,
  ATHLETE_STATE_TASK,
  ATHLETE_STATE_TOOLS,
  ATHLETE_STATE_ANSWER_TOOL,
} from '../core/skills/athleteState.skill';

/** Scheduling adapter only; the shared Skill runtime owns evidence, questions and answers. */
@Injectable()
export class CoachAssessmentOrchestratorService {
  constructor(
    private readonly ai: AiService,
    private readonly users: UserService,
    private readonly flags: AthleteStateFeatureFlags,
    private readonly updates: AthleteStateUpdates,
  ) {}

  @OnEvent(ATHLETE_STATE_REASSESS_REQUESTED_EVENT, { suppressErrors: false })
  handleRequested(event: AthleteStateReassessRequestedEvent) {
    return this.updates.requestUpdate(event);
  }

  async assess(input: {
    userId: string;
    triggerType: string;
    triggerRef?: string;
    requestVersion?: number;
    explicit?: boolean;
  }) {
    if (!this.flags.evidenceEnabled() || !this.flags.assessmentShadowEnabled())
      return { disabled: true };
    const reason = await this.updates.eligibility(
      input.userId,
      input.explicit === true,
    );
    if (reason) return { skipped: true, reason };
    const lang = (await this.users.getPreferredLocale(input.userId)) ?? 'en';
    const task = await this.ai.runBackgroundCoachTask({
      userId: input.userId,
      lang,
      taskType: ATHLETE_STATE_TASK,
      activeSkillName: ATHLETE_STATE_SKILL,
      funding: 'PLATFORM',
      allowedToolNames: this.flags.homeInquiryEnabled()
        ? ATHLETE_STATE_TOOLS
        : ATHLETE_STATE_TOOLS.filter((name) => name !== 'ask_user_question'),
      requiredToolNames: ['training.data_coverage'],
      resultToolName: ATHLETE_STATE_ANSWER_TOOL,
      resumeHistory: true,
      allowUserInteraction: this.flags.homeInquiryEnabled(),
      dedupeKey:
        input.requestVersion == null
          ? undefined
          : `state-update:${input.requestVersion}`,
      triggerType: input.triggerType,
      triggerRef: input.triggerRef,
      instructions: [
        'Refresh the athlete’s current state using the athlete-state Skill and the existing conversation.',
        'Read current authoritative facts through tools. Prior dialogue preserves context but does not freeze old measurements or recommendations.',
        `UPDATE_EVENT_DATA=${JSON.stringify({ type: input.triggerType, ref: input.triggerRef, version: input.requestVersion })}`,
      ].join('\n'),
      validateResult: (value) => {
        if (
          !value ||
          typeof value !== 'object' ||
          !('assessmentId' in value) ||
          typeof value.assessmentId !== 'string'
        )
          throw new Error('ATHLETE_STATE_RESULT_REQUIRED');
        return value as {
          assessmentId: string;
          state: string;
          confidence: number;
        };
      },
    });
    return task.awaitingInput
      ? { awaitingInput: true, sessionId: task.sessionId }
      : task.result;
  }
}
