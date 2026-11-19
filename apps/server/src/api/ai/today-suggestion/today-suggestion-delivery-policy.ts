import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { createHmac } from 'crypto';
import type {
  TodaySuggestionEvidence,
  TodaySuggestionIntent,
  TodaySuggestionIntentType,
  TodaySuggestionV2,
  TodaySuggestionWorkout,
} from '@shared/ai-today-suggestion-contract';
import { stableJson } from '../core/ai-common.util';
import { aiFallbackText } from '../core/ai-fallback-copy';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from './today-suggestion.types';

function authSecret() {
  const value =
    process.env.SELF_HOST_AUTH_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error('TODAY_SUGGESTION_SIGNING_SECRET_UNAVAILABLE');
  }
  return value;
}

export function todaySuggestionProposalToken(args: {
  generationToken: string;
  constraintHash: string;
  proposal: TodaySuggestionWorkout;
}) {
  return createHmac('sha256', authSecret())
    .update(
      stableJson({
        generationToken: args.generationToken,
        constraintHash: args.constraintHash,
        proposal: args.proposal,
      }),
    )
    .digest('base64url');
}

export function todaySuggestionLabel(
  i18n: I18nService,
  locale: string,
  key: string,
) {
  return aiFallbackText(
    i18n,
    resolveSupportedLocale(locale),
    `todayDelivery.${key}`,
  );
}

const EVIDENCE_CODES = new Set([
  'NEVER_RECORDED_ACTIVITY',
  'LAST_ACTIVITY_OVER_30_DAYS',
  'ACTIVITY_PROCESSING_PENDING',
  'TODAY_WORKOUT_COMPLETED',
  'TODAY_WORKOUT_AVAILABLE',
  'NO_ACTIVE_PLAN',
  'WAITING_FOR_USER',
  'WAITING_FOR_DATA',
  'HIGH_CONCERN',
  'RECENT_LOAD',
  'RECENT_ACTIVITY',
  'PLAN_CONTEXT',
  'COMPETITION_CONTEXT',
  'LOAD_ZERO_28D',
]);

@Injectable()
export class TodaySuggestionDeliveryPolicy {
  constructor(private readonly i18n: I18nService) {}

  private text(locale: string, key: string) {
    return todaySuggestionLabel(this.i18n, locale, key);
  }

  localize(
    result: TodaySuggestionV2,
    projection: Pick<
      TodaySuggestionConstraintProjection,
      'locale' | 'matchingActivityId'
    >,
  ): TodaySuggestionV2 {
    const intent = (value: TodaySuggestionIntent): TodaySuggestionIntent => ({
      ...value,
      label: this.text(
        projection.locale,
        `intents.${value.type === 'OPEN_ACTIVITY_REVIEW' && projection.matchingActivityId === value.activityId ? 'CHECK_ACTIVITY_ASSOCIATION' : value.type}`,
      ),
    });
    return {
      ...result,
      evidence: result.evidence.map((value) =>
        EVIDENCE_CODES.has(value.code)
          ? {
              ...value,
              label: this.text(projection.locale, `evidence.${value.code}`),
            }
          : value,
      ),
      primaryIntent: result.primaryIntent ? intent(result.primaryIntent) : null,
      secondaryIntents: result.secondaryIntents.map(intent),
    };
  }

  build(args: {
    projection: TodaySuggestionConstraintProjection;
    draft: TodaySuggestionDraft;
    generationToken: string;
    state: TodaySuggestionV2['delivery']['state'];
    reasonCode: TodaySuggestionV2['delivery']['reasonCode'];
    generatedAt: Date | null;
  }): TodaySuggestionV2 {
    const { projection, draft } = args;
    const evidenceCodes = [
      ...draft.evidenceCodes,
      ...projection.constraints.filter((code) => EVIDENCE_CODES.has(code)),
    ];
    const evidence: TodaySuggestionEvidence[] = [...new Set(evidenceCodes)]
      .filter((code) => Boolean(EVIDENCE_CODES.has(code)))
      .slice(0, 3)
      .map((code) => {
        return {
          code,
          label: this.text(projection.locale, `evidence.${code}`),
          evidenceRefs: [
            `fact:${projection.factHash}`,
            ...(projection.constraints.includes(code as never)
              ? [`constraint:${projection.constraintHash}`]
              : []),
          ],
        };
      });
    const preferred = this.resolveIntent(
      draft.preferredIntent,
      projection,
      draft,
      args.generationToken,
    );
    const candidates = draft.secondaryIntents;
    const secondaryIntents = candidates
      .filter((intent, index) => candidates.indexOf(intent) === index)
      .map((intent) =>
        this.resolveIntent(intent, projection, draft, args.generationToken),
      )
      .filter((intent): intent is TodaySuggestionIntent => Boolean(intent))
      .filter((intent) => intent.type !== preferred?.type)
      .slice(0, 2);

    const forced = this.forcedSafetyIntent(projection);
    const primaryIntent = forced ?? preferred;
    let validUntil = projection.validUntil.getTime();
    if (
      args.state === 'FACT_FALLBACK' ||
      args.reasonCode === 'AI_NOT_CONFIGURED'
    ) {
      validUntil = Math.min(validUntil, Date.now() + 60_000);
    }
    if (
      projection.constraints.some((code) =>
        ['ACTIVITY_PROCESSING_PENDING', 'WAITING_FOR_DATA'].includes(code),
      )
    ) {
      validUntil = Math.min(validUntil, Date.now() + 30_000);
    }
    if (draft.recommendation.kind === 'TRAIN') {
      const duration =
        draft.generatedWorkout?.summary.durationSeconds ??
        (draft.recommendation.durationMinutes
          ? draft.recommendation.durationMinutes * 60
          : (projection.todayWorkouts.find((workout) =>
              ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
            )?.plannedDurationSeconds ?? 1_800));
      const latestStart = projection.validUntil.getTime() - duration * 1_000;
      if (latestStart > Date.now())
        validUntil = Math.min(validUntil, latestStart);
    }
    return {
      version: 2,
      suggestionId: args.generationToken,
      delivery: {
        state: args.state,
        reasonCode: args.reasonCode,
        generatedAt: args.generatedAt?.toISOString() ?? null,
        cached: false,
      },
      headline: draft.headline,
      summary: draft.summary,
      recommendation: draft.recommendation,
      confidence: draft.confidence,
      ...(draft.uncertainty ? { uncertainty: draft.uncertainty } : {}),
      evidence,
      primaryIntent,
      secondaryIntents: forced
        ? secondaryIntents.filter(
            (intent) =>
              !['CREATE_TODAY_WORKOUT', 'SCHEDULE_REMINDER'].includes(
                intent.type,
              ),
          )
        : secondaryIntents,
      ...(projection.pendingInquiry
        ? { assessmentCaseRef: projection.pendingInquiry }
        : {}),
      ...(projection.activeDecisionId
        ? { decisionRef: { decisionId: projection.activeDecisionId } }
        : {}),
      validUntil: new Date(validUntil).toISOString(),
    };
  }

  private forcedSafetyIntent(
    projection: TodaySuggestionConstraintProjection,
  ): TodaySuggestionIntent | null {
    if (projection.highConcern && projection.pendingInquiry) {
      return {
        type: 'OPEN_ASSESSMENT',
        label: this.text(projection.locale, 'intents.OPEN_ASSESSMENT'),
        caseId: projection.pendingInquiry.caseId,
      };
    }
    if (projection.activeDecisionId && projection.highConcern) {
      return {
        type: 'OPEN_DECISION',
        label: this.text(projection.locale, 'intents.OPEN_DECISION'),
        decisionId: projection.activeDecisionId,
      };
    }
    if (projection.highConcern) {
      return {
        type: 'ASK_COACH',
        label: this.text(projection.locale, 'intents.ASK_COACH'),
        starterCode: 'today-high-concern',
      };
    }
    return null;
  }

  private resolveIntent(
    type: TodaySuggestionIntentType | null,
    projection: TodaySuggestionConstraintProjection,
    draft: TodaySuggestionDraft,
    generationToken: string,
  ): TodaySuggestionIntent | null {
    if (!type) return null;
    if (
      ['REST_TODAY', 'TRAINED_ELSEWHERE', 'DATA_PENDING'].includes(
        projection.userFeedback?.feedback ?? '',
      ) &&
      [
        'CREATE_TODAY_WORKOUT',
        'OPEN_TODAY_WORKOUT',
        'SCHEDULE_REMINDER',
      ].includes(type)
    ) {
      return null;
    }
    const todayWorkout = projection.todayWorkouts.find((workout) =>
      ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
    );
    switch (type) {
      case 'OPEN_TODAY_WORKOUT':
        return todayWorkout
          ? {
              type,
              label: this.text(projection.locale, 'intents.OPEN_TODAY_WORKOUT'),
              workoutId: todayWorkout.id,
              scheduledDate: todayWorkout.scheduledDate ?? projection.date,
              planId: todayWorkout.planId,
            }
          : null;
      case 'OPEN_PLAN':
        return projection.activePlan
          ? {
              type,
              label: this.text(projection.locale, 'intents.OPEN_PLAN'),
              planId: projection.activePlan.id,
            }
          : null;
      case 'OPEN_ASSESSMENT':
        return projection.pendingInquiry
          ? {
              type,
              label: this.text(projection.locale, 'intents.OPEN_ASSESSMENT'),
              caseId: projection.pendingInquiry.caseId,
            }
          : null;
      case 'OPEN_PROVIDER_SETTINGS':
        return {
          type,
          label: this.text(projection.locale, 'intents.OPEN_PROVIDER_SETTINGS'),
        };
      case 'OPEN_IMPORT':
        return {
          type,
          label: this.text(projection.locale, 'intents.OPEN_IMPORT'),
        };
      case 'OPEN_ACTIVITY_REVIEW':
        return projection.matchingActivityId || projection.latestActivityId
          ? {
              type,
              label: this.text(
                projection.locale,
                projection.matchingActivityId
                  ? 'intents.CHECK_ACTIVITY_ASSOCIATION'
                  : 'intents.OPEN_ACTIVITY_REVIEW',
              ),
              activityId:
                projection.matchingActivityId ?? projection.latestActivityId,
            }
          : null;
      case 'OPEN_DECISION':
        return projection.activeDecisionId
          ? {
              type,
              label: this.text(projection.locale, 'intents.OPEN_DECISION'),
              decisionId: projection.activeDecisionId,
            }
          : null;
      case 'ASK_COACH':
        return {
          type,
          label: this.text(projection.locale, 'intents.ASK_COACH'),
          starterCode: 'today-suggestion',
        };
      case 'VIEW_TOMORROW':
        return projection.tomorrowWorkouts.length
          ? {
              type,
              label: this.text(projection.locale, 'intents.VIEW_TOMORROW'),
              date: projection.tomorrowWorkouts[0].scheduledDate ?? '',
            }
          : null;
      case 'CREATE_TODAY_WORKOUT':
        if (todayWorkout || projection.highConcern || !draft.generatedWorkout) {
          return null;
        }
        return {
          type,
          label: this.text(projection.locale, 'intents.CREATE_TODAY_WORKOUT'),
          proposalToken: todaySuggestionProposalToken({
            generationToken,
            constraintHash: projection.constraintHash,
            proposal: draft.generatedWorkout,
          }),
          preview: draft.generatedWorkout,
        };
      case 'SCHEDULE_REMINDER': {
        const earliest = new Date(Date.now() + 5 * 60_000);
        if (earliest.getTime() >= projection.validUntil.getTime()) return null;
        return {
          type,
          label: this.text(projection.locale, 'intents.SCHEDULE_REMINDER'),
          earliestAt: earliest.toISOString(),
          latestAt: projection.validUntil.toISOString(),
        };
      }
    }
  }
}
