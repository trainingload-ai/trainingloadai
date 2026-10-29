import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import type {
  TodaySuggestionEvidence,
  TodaySuggestionIntent,
  TodaySuggestionIntentType,
  TodaySuggestionV2,
  TodaySuggestionWorkout,
} from '@shared/ai-today-suggestion-contract';
import { stableJson } from '../core/ai-common.util';
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

function isChinese(locale: string) {
  return locale.toLowerCase().startsWith('zh');
}

function label(locale: string, zh: string, en: string) {
  return isChinese(locale) ? zh : en;
}

const EVIDENCE_LABELS: Record<string, [string, string]> = {
  NEVER_RECORDED_ACTIVITY: ['尚无活动记录', 'No recorded activity yet'],
  LAST_ACTIVITY_OVER_30_DAYS: [
    '超过 30 天没有活动记录',
    'No activity recorded for 30+ days',
  ],
  ACTIVITY_PROCESSING_PENDING: [
    '活动仍在处理中',
    'Activity data is still processing',
  ],
  TODAY_WORKOUT_COMPLETED: ['今日训练已完成', "Today's workout is complete"],
  TODAY_WORKOUT_AVAILABLE: ['今日已有训练安排', 'A workout is scheduled today'],
  NO_ACTIVE_PLAN: ['暂无进行中的计划', 'No active plan'],
  WAITING_FOR_USER: ['需要补充身体状态', 'Athlete input is needed'],
  WAITING_FOR_DATA: ['等待训练数据', 'Waiting for training data'],
  HIGH_CONCERN: ['当前状态需要优先处理', 'Current state needs attention'],
  RECENT_LOAD: ['近期训练负荷', 'Recent training load'],
  RECENT_ACTIVITY: ['最近一次活动', 'Latest activity'],
  PLAN_CONTEXT: ['当前训练计划', 'Current training plan'],
  COMPETITION_CONTEXT: ['近期比赛安排', 'Upcoming competition'],
  LOAD_ZERO_28D: [
    '近 28 天计算训练负荷为 0',
    'Calculated training load is zero over 28 days',
  ],
};

@Injectable()
export class TodaySuggestionDeliveryPolicy {
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
      ...projection.constraints.filter((code) => EVIDENCE_LABELS[code]),
    ];
    const evidence: TodaySuggestionEvidence[] = [...new Set(evidenceCodes)]
      .filter((code) => Boolean(EVIDENCE_LABELS[code]))
      .slice(0, 3)
      .map((code) => {
        const pair = EVIDENCE_LABELS[code];
        return {
          code,
          label: label(projection.locale, pair[0], pair[1]),
          evidenceRefs: [
            `constraint:${projection.constraintHash.slice(0, 16)}`,
          ],
        };
      });
    const preferred = this.resolveIntent(
      draft.preferredIntent,
      projection,
      draft,
      args.generationToken,
    );
    const candidates = [
      ...draft.secondaryIntents,
      'SCHEDULE_REMINDER' as const,
    ];
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
    return {
      version: 2,
      suggestionId: args.generationToken,
      delivery: {
        state: args.state,
        reasonCode: args.reasonCode,
        generatedAt: args.generatedAt?.toISOString() ?? null,
      },
      headline: draft.headline,
      summary: draft.summary,
      recommendation: draft.recommendation,
      confidence: draft.confidence,
      ...(draft.uncertainty ? { uncertainty: draft.uncertainty } : {}),
      evidence,
      primaryIntent,
      secondaryIntents: projection.pendingInquiry
        ? []
        : forced
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
      validUntil: projection.validUntil.toISOString(),
    };
  }

  private forcedSafetyIntent(
    projection: TodaySuggestionConstraintProjection,
  ): TodaySuggestionIntent | null {
    if (projection.pendingInquiry) {
      return {
        type: 'OPEN_ASSESSMENT',
        label: label(projection.locale, '补充状态', 'Update status'),
        caseId: projection.pendingInquiry.caseId,
      };
    }
    if (projection.activeDecisionId && projection.highConcern) {
      return {
        type: 'OPEN_DECISION',
        label: label(
          projection.locale,
          '查看教练判断',
          'Review coach decision',
        ),
        decisionId: projection.activeDecisionId,
      };
    }
    if (projection.highConcern) {
      return {
        type: 'ASK_COACH',
        label: label(projection.locale, '问教练', 'Ask coach'),
        starterCode: 'today-high-concern',
      };
    }
    return null;
  }

  private resolveIntent(
    type: TodaySuggestionIntentType,
    projection: TodaySuggestionConstraintProjection,
    draft: TodaySuggestionDraft,
    generationToken: string,
  ): TodaySuggestionIntent | null {
    const todayWorkout = projection.todayWorkouts.find((workout) =>
      ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
    );
    switch (type) {
      case 'OPEN_TODAY_WORKOUT':
        return todayWorkout &&
          (projection.newWorkoutWindowOpen !== false ||
            todayWorkout.status === 'IN_PROGRESS')
          ? {
              type,
              label: label(
                projection.locale,
                '打开今日训练',
                "Open today's workout",
              ),
              workoutId: todayWorkout.id,
              scheduledDate: todayWorkout.scheduledDate ?? projection.date,
              planId: todayWorkout.planId,
            }
          : null;
      case 'OPEN_PLAN':
        return projection.activePlan
          ? {
              type,
              label: label(projection.locale, '查看计划', 'View plan'),
              planId: projection.activePlan.id,
            }
          : null;
      case 'OPEN_ASSESSMENT':
        return projection.pendingInquiry
          ? {
              type,
              label: label(projection.locale, '补充状态', 'Update status'),
              caseId: projection.pendingInquiry.caseId,
            }
          : null;
      case 'OPEN_PROVIDER_SETTINGS':
        return {
          type,
          label: label(
            projection.locale,
            '检查数据连接',
            'Check data connection',
          ),
        };
      case 'OPEN_IMPORT':
        return {
          type,
          label: label(projection.locale, '导入活动', 'Import activity'),
        };
      case 'OPEN_ACTIVITY_REVIEW':
        return projection.latestActivityId
          ? {
              type,
              label: label(
                projection.locale,
                '查看活动复盘',
                'Review activity',
              ),
              activityId: projection.latestActivityId,
            }
          : null;
      case 'OPEN_DECISION':
        return projection.activeDecisionId
          ? {
              type,
              label: label(
                projection.locale,
                '查看教练判断',
                'Review coach decision',
              ),
              decisionId: projection.activeDecisionId,
            }
          : null;
      case 'ASK_COACH':
        return {
          type,
          label: label(projection.locale, '问教练', 'Ask coach'),
          starterCode: 'today-suggestion',
        };
      case 'VIEW_TOMORROW':
        return projection.tomorrowWorkouts.length
          ? {
              type,
              label: label(
                projection.locale,
                '查看明日安排',
                "View tomorrow's plan",
              ),
              date: projection.tomorrowWorkouts[0].scheduledDate ?? '',
            }
          : null;
      case 'CREATE_TODAY_WORKOUT':
        if (
          todayWorkout ||
          projection.highConcern ||
          projection.pendingInquiry ||
          projection.newWorkoutWindowOpen === false ||
          !draft.generatedWorkout
        ) {
          return null;
        }
        return {
          type,
          label: label(
            projection.locale,
            '添加为今日课次',
            "Add as today's workout",
          ),
          proposalToken: todaySuggestionProposalToken({
            generationToken,
            constraintHash: projection.constraintHash,
            proposal: draft.generatedWorkout,
          }),
          preview: draft.generatedWorkout,
        };
      case 'SCHEDULE_REMINDER': {
        if (projection.newWorkoutWindowOpen === false) return null;
        const earliest = new Date(Date.now() + 5 * 60_000);
        if (earliest.getTime() >= projection.validUntil.getTime()) return null;
        return {
          type,
          label: label(projection.locale, '稍后提醒', 'Remind me later'),
          earliestAt: earliest.toISOString(),
          latestAt: projection.validUntil.toISOString(),
        };
      }
    }
  }
}
