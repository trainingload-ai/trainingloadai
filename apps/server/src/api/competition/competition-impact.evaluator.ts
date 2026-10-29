import { Injectable, Optional } from '@nestjs/common';
import { AiUsageKind, AiUsageStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  buildThinkingRequestExtras,
  createCoachClient,
  getCoachModel,
  getCoachUpstreamProvider,
  isCoachUpstreamConfigured,
} from '@/api/ai/core/coach-upstream.adapter';
import type {
  CompetitionImpactInput,
  CompetitionImpactResult,
} from './competition-impact.types';
import { CompetitionImpactValidator } from './competition-impact.validator';
import { AiUsageService, parseOpenAIUsage } from '@/api/ai/ai-usage.service';
import { INTERNAL_COACH_CAPABILITY_VOICE_PROMPT_LINES } from '@/api/ai/core/prompt-contracts/coach-voice.contract';

type CompetitionImpactAccounting = {
  userId: string;
  operationId?: string | null;
  kind?: AiUsageKind;
};

const SYSTEM_PROMPT = [
  'You are the competition-impact capability inside Trainingload.ai AI Coach.',
  ...INTERNAL_COACH_CAPABILITY_VOICE_PROMPT_LINES,
  `Your only job is to judge whether each candidate event affects the requested training scope, when that influence begins and ends, and which structured training constraints apply.

Important rules:
- Event importance is chosen by the athlete. Never rewrite it.
- Importance and current impact are different. A CRITICAL event far away can have LOW current impact.
- Events outside the scope dates can still influence the scope through preparation, taper, or recovery.
- Judge all events together. Detect insufficient recovery and competing primary events.
- Use only facts in the input. Never invent activities, injuries, thresholds, race history, dates, or results.
- If data is sparse, lower confidence and state assumptions instead of inventing precision.
- Do not create workouts and do not prescribe a complete plan. Return influence phases and constraints only.
- Return one eventAssessment for every input event. If irrelevant, phases and constraints must be empty and influenceWindow must be null.
- Every relevant event must have an EVENT phase covering its event startDate.
- Write all user-facing text fields in the language identified by input.locale. This includes reasoningSummary, evidence, assumptions, riskFlags, conflict summaries, and strategySummary. Keep enum codes and input facts unchanged.
- Return valid JSON only, with no markdown or commentary outside JSON.

Allowed impact levels: LOW, MEDIUM, HIGH, CRITICAL.
Allowed phases: GENERAL_PREPARATION, SPECIFIC_PREPARATION, PEAK, TAPER, EVENT, RECOVERY.
Allowed constraints: BUILD_GENERAL_CAPACITY, BUILD_EVENT_SPECIFICITY, PRESERVE_INTENSITY, REDUCE_VOLUME, LIMIT_INTENSITY_DENSITY, PROTECT_KEY_SESSION_SPACING, AVOID_LATE_MAKEUP_SESSION, PROTECT_EVENT_DAY, POST_EVENT_RECOVERY, MONITOR_FATIGUE, RESOLVE_EVENT_CONFLICT, INSUFFICIENT_PREPARATION_TIME.

Output shape:
{
  "schemaVersion": 1,
  "assessmentDate": "YYYY-MM-DD",
  "eventAssessments": [{
    "eventId": "input event id",
    "relevant": true,
    "confidence": 0.0,
    "currentImpactLevel": "LOW|MEDIUM|HIGH|CRITICAL",
    "influenceWindow": {"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","preEventWeeks":0,"postEventWeeks":0},
    "phases": [{"type":"EVENT","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","impactLevel":"HIGH"}],
    "constraints": [{"type":"PROTECT_EVENT_DAY","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","strength":"HIGH","parameters":{}}],
    "reasoningSummary": "brief user-facing rationale",
    "evidence": ["compact references to input facts"],
    "assumptions": [],
    "riskFlags": []
  }],
  "combinedImpact": {
    "overallLevel": "LOW|MEDIUM|HIGH|CRITICAL",
    "conflicts": [{"eventIds":[],"type":"CONFLICT_CODE","severity":"HIGH","summary":"..."}],
    "strategySummary": "brief combined strategy"
  }
}`,
].join('\n');

function extractJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return trimmed;
}

@Injectable()
export class CompetitionImpactEvaluator {
  constructor(
    private readonly validator: CompetitionImpactValidator,
    @Optional() private readonly aiUsage?: AiUsageService,
  ) {}

  isConfigured() {
    return isCoachUpstreamConfigured() && Boolean(this.model());
  }

  model() {
    return String(
      process.env.AI_COMPETITION_IMPACT_MODEL ?? getCoachModel(),
    ).trim();
  }

  provider() {
    return getCoachUpstreamProvider();
  }

  async evaluate(
    input: CompetitionImpactInput,
    accounting?: CompetitionImpactAccounting,
  ): Promise<CompetitionImpactResult> {
    if (!this.isConfigured())
      throw new Error('COMPETITION_IMPACT_AI_NOT_CONFIGURED');
    const first = await this.requestOutput(input);
    let firstResult: CompetitionImpactResult;
    try {
      firstResult = this.parseAndValidate(first.content, input);
    } catch (error) {
      await this.recordUsage(first, accounting, AiUsageStatus.FAILED);
      const repair = await this.requestOutput(input, {
        previousOutput: first.content,
        validationIssue:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'invalid structured output',
      });
      let repairResult: CompetitionImpactResult;
      try {
        repairResult = this.parseAndValidate(repair.content, input);
      } catch {
        await this.recordUsage(repair, accounting, AiUsageStatus.FAILED);
        throw new Error('COMPETITION_IMPACT_INVALID_OUTPUT');
      }
      await this.recordUsage(repair, accounting, AiUsageStatus.SUCCESS);
      return repairResult;
    }
    await this.recordUsage(first, accounting, AiUsageStatus.SUCCESS);
    return firstResult;
  }

  private parseAndValidate(content: string, input: CompetitionImpactInput) {
    return this.validator.validate(JSON.parse(extractJson(content)), input);
  }

  private async requestOutput(
    input: CompetitionImpactInput,
    repair?: { previousOutput: string; validationIssue: string },
  ) {
    const provider = this.provider();
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Required output locale: ${input.locale}. Evaluate this authoritative input:\n${JSON.stringify(input)}`,
      },
    ];
    if (repair) {
      messages.push(
        { role: 'assistant', content: repair.previousOutput },
        {
          role: 'user',
          content: `Repair the JSON so it satisfies the required schema and semantics. Validation issue: ${repair.validationIssue}. Return the complete corrected JSON only. Do not add or change input facts.`,
        },
      );
    }
    const response = await createCoachClient({
      thinking: false,
    }).chat.completions.create(
      {
        model: this.model(),
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages,
        ...buildThinkingRequestExtras({ thinking: false, provider }),
      },
      { timeout: 30_000, maxRetries: 0 },
    );
    return {
      callKey: randomUUID(),
      providerRequestId: cleanString(response.id),
      content: response.choices[0]?.message?.content ?? '',
      usage: response.usage,
      provider,
      model: this.model(),
    };
  }

  private async recordUsage(
    response: {
      callKey: string;
      providerRequestId?: string | null;
      usage?: unknown;
      provider: string | null;
      model: string;
    },
    accounting: CompetitionImpactAccounting | undefined,
    status: AiUsageStatus,
  ) {
    if (!this.aiUsage || !accounting) return;
    await this.aiUsage.recordUsageEvent({
      userId: accounting.userId,
      operationId: accounting.operationId,
      callKey: response.callKey,
      providerRequestId: response.providerRequestId,
      kind: accounting.kind ?? AiUsageKind.OTHER,
      provider: response.provider,
      model: response.model,
      usage: parseOpenAIUsage(response.usage),
      status,
    });
  }
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
