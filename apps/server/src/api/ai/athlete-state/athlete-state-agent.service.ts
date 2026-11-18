import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AthleteStateUpdates } from '@/athlete-state/updates/athlete-state-updates.service';
import { AthleteStateCommands } from '@/athlete-state/application/athlete-state-commands.service';
import {
  ATHLETE_STATE_POLICY,
  ATHLETE_STATE_POLICY_VERSION,
  ATHLETE_STATE_PROMPT_VERSION,
} from '@/athlete-state/athlete-state-policy';
import {
  parseAthleteStateSkillResult,
  ATHLETE_STATE_FACT_TOOLS,
} from './athlete-state-result.contract';

export type AthleteStateReadReceipt = {
  tool: string;
  inputHash: string;
  resultHash: string;
  readAt: string;
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Per-turn tools submit derived state; conversation history stays in the Coach runtime. */
@Injectable()
export class AthleteStateAgentService {
  constructor(
    private readonly commands: AthleteStateCommands,
    private readonly updates: AthleteStateUpdates,
  ) {}

  async assertEligible(userId: string) {
    const reason = await this.updates.eligibility(userId, true);
    if (reason) throw new ForbiddenException({ code: reason, message: reason });
  }

  openTurn(input: {
    userId: string;
    sessionId: string;
    runId: string;
    timezone: string;
    asOf: Date;
    onSubmitted?: (result: unknown) => void | Promise<void>;
  }) {
    const reads: AthleteStateReadReceipt[] = [];
    let accepted:
      | { assessmentId: string; state: string; confidence: number }
      | undefined;
    return {
      recordRead: (tool: string, args: unknown, output: unknown) => {
        reads.push({
          tool,
          inputHash: hash(args),
          resultHash: hash(output),
          readAt: new Date().toISOString(),
        });
      },
      submit: async (raw: unknown) => {
        if (accepted) throw new Error('ATHLETE_STATE_RESULT_ALREADY_SUBMITTED');
        await this.assertEligible(input.userId);
        if (!reads.some((read) => read.tool === 'training.data_coverage'))
          throw new Error('ATHLETE_STATE_COVERAGE_REQUIRED');
        const parsed = parseAthleteStateSkillResult(raw);
        if (!parsed.success) throw parsed.error;
        if (
          parsed.value.state !== 'UNKNOWN' &&
          !reads.some((read) => ATHLETE_STATE_FACT_TOOLS.has(read.tool))
        )
          throw new Error('ATHLETE_STATE_FACTS_REQUIRED');
        const snapshot = {
          schemaVersion: 2 as const,
          policyVersion: ATHLETE_STATE_POLICY_VERSION,
          asOf: input.asOf.toISOString(),
          timezone: input.timezone,
          sessionId: input.sessionId,
          runId: input.runId,
          // Hashes reference actual tool reads without duplicating private Memory claims.
          reads: [...reads],
        };
        const saved = await this.commands.saveAssessment({
          userId: input.userId,
          evidence: {
            snapshot,
            evidenceHash: hash(snapshot),
            latestSourceAt: null,
            expiresAt: new Date(
              input.asOf.getTime() +
                ATHLETE_STATE_POLICY.assessmentMaxAgeHours * 3_600_000,
            ),
          },
          // The legacy database field is retained for older Case records only.
          result: { ...parsed.value, evidenceRequests: [] },
          promptVersion: ATHLETE_STATE_PROMPT_VERSION,
        });
        accepted = {
          assessmentId: saved.assessment.id,
          state: saved.assessment.state,
          confidence: saved.assessment.confidence,
        };
        await input.onSubmitted?.(accepted);
        return accepted;
      },
    };
  }
}
