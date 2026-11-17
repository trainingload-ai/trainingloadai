import { AthleteStateInquiryService } from '../athlete-state/athlete-state-inquiry.service';
import { todayCoachingFactScopes } from './today-suggestion-fact-scopes';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { CoachRunStore } from '../coach-run-store.service';
import { TodaySuggestionConstraintProjector } from './today-suggestion-constraint.projector';
import { stableJson } from '../core/ai-common.util';
import type { TodaySuggestionConstraintProjection } from './today-suggestion.types';

export type FactGuidanceScope = {
  topic: string;
  revision: string;
  sessionId: string;
};
const hash = (value: unknown) =>
  createHash('sha256').update(stableJson(value)).digest('hex');

/** Runtime owns interaction state; projections only supply current topic dependencies. */
@Injectable()
export class TodaySuggestionGuidanceLifecycle {
  constructor(
    private readonly runs: CoachRunStore,
    @Optional() private readonly inquiries?: AthleteStateInquiryService,
  ) {}

  topics(projection: TodaySuggestionConstraintProjection) {
    return todayCoachingFactScopes(projection);
  }

  async reconcile(projection: TodaySuggestionConstraintProjection) {
    const topics = this.topics(projection);
    if (
      (projection.lightContext.sharedFacts as { status?: string } | undefined)
        ?.status === 'LIMITED'
    )
      return { topics, changed: 0 };
    let changed = await this.runs.reconcileFactGuidance(
      projection.userId,
      topics,
    );
    const shared = projection.lightContext.sharedFacts as
      | { revision?: string }
      | undefined;
    if (shared?.revision)
      changed +=
        (await this.inquiries?.reconcileFactRevision(
          projection.userId,
          shared.revision,
        )) ?? 0;
    return { topics, changed };
  }
}

@Injectable()
export class TodaySuggestionGuidanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projector: TodaySuggestionConstraintProjector,
    private readonly lifecycle: TodaySuggestionGuidanceLifecycle,
  ) {}

  async reconcile(userId: string, locale: string) {
    const projection = await this.projector.project({
      userId,
      locale,
      allowAi: true,
    });
    await this.lifecycle.reconcile(projection);
  }

  async resolve(userId: string, generationToken: string, locale = 'en') {
    const stored = await this.prisma.aiTodaySuggestion.findUnique({
      where: { generationToken },
    });
    if (stored && stored.userId !== userId)
      throw new NotFoundException('TODAY_GUIDANCE_NOT_FOUND');
    const temporary =
      !stored &&
      (await this.prisma.todaySuggestionGeneration.findFirst({
        where: { userId, contextToken: generationToken },
        select: { userId: true },
      }));
    if (!stored && !temporary)
      throw new NotFoundException('TODAY_GUIDANCE_NOT_FOUND');
    const lang = stored?.locale ?? locale;
    let projection = await this.projector.project({
      userId,
      locale: lang,
      allowAi: true,
    });
    const reconciled = await this.lifecycle.reconcile(projection);
    if (reconciled.changed)
      projection = await this.projector.project({
        userId,
        locale: lang,
        allowAi: true,
      });
    const topics = this.lifecycle.topics(projection);
    if (
      !projection.allowAi ||
      !projection.featureAllowed ||
      (projection.lightContext.sharedFacts as { status?: string } | undefined)
        ?.status === 'LIMITED'
    )
      return { status: 'UNAVAILABLE' as const, sessionId: null, context: null };
    const structured = stored?.structuredResult as {
      primaryIntent?: { type: string; activityId?: string };
    } | null;
    const activity =
      structured?.primaryIntent?.type === 'OPEN_ACTIVITY_REVIEW'
        ? structured.primaryIntent.activityId
        : null;
    const topic =
      (activity
        ? topics.find((item) => item.topic === `workout-match:${activity}`)
        : null) ??
      topics.find((item) => item.topic === `today:${projection.date}`)!;
    const shared = projection.lightContext.sharedFacts as
      | { revision?: string }
      | undefined;
    const pending =
      projection.pendingInquiry &&
      (await this.prisma.coachRun.findFirst({
        where: {
          id: projection.pendingInquiry.caseId,
          userId,
          status: 'awaiting_input',
          taskKind: 'ATHLETE_STATE_UPDATE',
          factScope: {
            path: ['revision'],
            equals: shared?.revision ?? 'unverified',
          },
        },
        select: { sessionId: true },
      }));
    const existingSessionId = pending?.sessionId;
    const sessionId =
      existingSessionId ??
      `fact-guidance-${hash([userId, topic.topic, topic.revision]).slice(0, 40)}`;
    await this.prisma.aiCoachSession.upsert({
      where: { userId_id: { userId, id: sessionId } },
      create: {
        userId,
        id: sessionId,
        lang,
        title: stored?.summary.slice(0, 80) ?? null,
      },
      update: {},
    });
    const existing = await this.prisma.coachRun.findFirst({
      where: {
        userId,
        sessionId,
        triggerType: 'FACT_GUIDANCE',
        status: { not: 'cancelled' },
      },
      select: { id: true },
    });
    const current =
      stored &&
      stored.signatureHash === projection.factHash &&
      stored.constraintHash === projection.constraintHash &&
      stored.date === projection.date;
    return {
      status: current ? ('CURRENT' as const) : ('UPDATED' as const),
      sessionId,
      resumeExisting: Boolean(existingSessionId || existing),
      context: {
        kind: 'today_suggestion_context',
        version: 2,
        suggestionId: generationToken,
        date: projection.date,
        headline: current
          ? ((stored!.structuredResult as { headline?: string } | null)
              ?.headline ?? '')
          : '',
        summary: current ? stored!.summary : '',
        currentFacts: {
          topic: topic.topic,
          activityId: topic.topic.startsWith('workout-match:')
            ? topic.topic.slice('workout-match:'.length)
            : projection.latestActivityId,
          date: projection.date,
        },
        guidanceStatus: current ? 'CURRENT' : 'UPDATED',
        instruction:
          'Discuss the current facts and explain the next useful step. A link click is not an answer or permission to change training. Use the existing activity linking or exact proposal confirmation flow for changes.',
      },
      scope: { ...topic, sessionId } satisfies FactGuidanceScope,
    };
  }
}
