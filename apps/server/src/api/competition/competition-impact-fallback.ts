import { Injectable } from '@nestjs/common';
import {
  addCompetitionDays,
  competitionDateToYmd,
  parseCompetitionYmd,
} from './competition-calendar.util';
import type {
  CompetitionImpactInput,
  CompetitionImpactLevel,
  CompetitionImpactResult,
} from './competition-impact.types';

const importanceWeeks = {
  LOW: { pre: 1, post: 1, level: 'LOW' },
  MEDIUM: { pre: 3, post: 1, level: 'MEDIUM' },
  HIGH: { pre: 8, post: 2, level: 'HIGH' },
  CRITICAL: { pre: 12, post: 3, level: 'CRITICAL' },
} as const;

@Injectable()
export class CompetitionImpactFallback {
  readonly version = 'competition-impact-fallback-v1';

  build(input: CompetitionImpactInput): CompetitionImpactResult {
    const eventAssessments = input.events.map((event) => {
      const defaults = importanceWeeks[event.importance];
      const longDistance =
        (event.sportType === 'RUN' && Number(event.distanceMeters ?? 0) >= 21_097) ||
        Number(event.distanceMeters ?? 0) >= 100_000;
      const preWeeks = defaults.pre + (longDistance ? 4 : 0);
      const postWeeks = defaults.post + (longDistance ? 1 : 0);
      const eventDate = parseCompetitionYmd(event.startDate, 'event.startDate');
      const eventEndDate = event.endDate
        ? parseCompetitionYmd(event.endDate, 'event.endDate')
        : eventDate;
      const influenceStart = addCompetitionDays(eventDate, -preWeeks * 7);
      const influenceEnd = addCompetitionDays(eventEndDate, postWeeks * 7);
      const relevant =
        competitionDateToYmd(influenceStart)! <= input.scope.endDate &&
        competitionDateToYmd(influenceEnd)! >= input.scope.startDate;
      const current = input.anchorDate;
      const currentImpactLevel: CompetitionImpactLevel =
        relevant &&
        current >= competitionDateToYmd(addCompetitionDays(eventDate, -14))! &&
        current <= competitionDateToYmd(influenceEnd)!
          ? defaults.level
          : relevant
            ? event.importance === 'LOW'
              ? 'LOW'
              : 'MEDIUM'
            : 'LOW';
      if (!relevant) {
        return {
          eventId: event.id,
          relevant: false,
          confidence: 0,
          currentImpactLevel: 'LOW' as const,
          influenceWindow: null,
          phases: [],
          constraints: [],
          reasoningSummary:
            'The conservative fallback found no overlap between this event influence window and the requested training scope.',
          evidence: [`event.importance=${event.importance}`],
          assumptions: ['AI impact assessment was unavailable.'],
          riskFlags: [],
        };
      }
      const taperDays = event.importance === 'CRITICAL' ? 14 : event.importance === 'HIGH' ? 10 : 3;
      const recoveryStart = addCompetitionDays(eventEndDate, 1);
      return {
        eventId: event.id,
        relevant: true,
        confidence: 0,
        currentImpactLevel,
        influenceWindow: {
          startDate: competitionDateToYmd(influenceStart)!,
          endDate: competitionDateToYmd(influenceEnd)!,
          preEventWeeks: preWeeks,
          postEventWeeks: postWeeks,
        },
        phases: [
          {
            type: 'GENERAL_PREPARATION' as const,
            startDate: competitionDateToYmd(influenceStart)!,
            endDate: competitionDateToYmd(addCompetitionDays(eventDate, -taperDays - 1))!,
            impactLevel: currentImpactLevel,
          },
          {
            type: 'TAPER' as const,
            startDate: competitionDateToYmd(addCompetitionDays(eventDate, -taperDays))!,
            endDate: competitionDateToYmd(addCompetitionDays(eventDate, -1))!,
            impactLevel: defaults.level,
          },
          {
            type: 'EVENT' as const,
            startDate: event.startDate,
            endDate: event.endDate ?? event.startDate,
            impactLevel: defaults.level,
          },
          {
            type: 'RECOVERY' as const,
            startDate: competitionDateToYmd(recoveryStart)!,
            endDate: competitionDateToYmd(influenceEnd)!,
            impactLevel: defaults.level,
          },
        ],
        constraints: [
          {
            type: 'PROTECT_EVENT_DAY' as const,
            startDate: event.startDate,
            endDate: event.endDate ?? event.startDate,
            strength: defaults.level,
            parameters: {},
          },
          {
            type: 'AVOID_LATE_MAKEUP_SESSION' as const,
            startDate: competitionDateToYmd(addCompetitionDays(eventDate, -taperDays))!,
            endDate: event.startDate,
            strength: defaults.level,
            parameters: {},
          },
          {
            type: 'REDUCE_VOLUME' as const,
            startDate: competitionDateToYmd(addCompetitionDays(eventDate, -taperDays))!,
            endDate: competitionDateToYmd(addCompetitionDays(eventDate, -1))!,
            strength: defaults.level,
            parameters: { targetVolumeRatio: event.importance === 'CRITICAL' ? 0.65 : 0.8 },
          },
          {
            type: 'LIMIT_INTENSITY_DENSITY' as const,
            startDate: competitionDateToYmd(addCompetitionDays(eventDate, -taperDays))!,
            endDate: competitionDateToYmd(addCompetitionDays(eventDate, -1))!,
            strength: defaults.level,
            parameters: { maxHardSessionsPer7Days: 1 },
          },
          {
            type: 'POST_EVENT_RECOVERY' as const,
            startDate: competitionDateToYmd(recoveryStart)!,
            endDate: competitionDateToYmd(influenceEnd)!,
            strength: defaults.level,
            parameters: { noHardSessionsDays: event.importance === 'CRITICAL' ? 5 : 3 },
          },
        ],
        reasoningSummary:
          'AI assessment was unavailable; conservative safeguards were derived from event importance, sport, distance, and timing.',
        evidence: [
          `event.importance=${event.importance}`,
          `event.distanceMeters=${event.distanceMeters ?? 'unknown'}`,
        ],
        assumptions: ['This is a rule-based safety fallback, not a personalized AI assessment.'],
        riskFlags: ['AI_ASSESSMENT_UNAVAILABLE'],
      };
    });

    const relevant = eventAssessments.filter((assessment) => assessment.relevant);
    const levelOrder: CompetitionImpactLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const overallLevel = relevant.reduce<CompetitionImpactLevel>(
      (highest, assessment) =>
        levelOrder.indexOf(assessment.currentImpactLevel) > levelOrder.indexOf(highest)
          ? assessment.currentImpactLevel
          : highest,
      'LOW',
    );
    const conflicts: CompetitionImpactResult['combinedImpact']['conflicts'] = [];
    const critical = input.events.filter(
      (event) =>
        event.importance === 'CRITICAL' &&
        relevant.some((assessment) => assessment.eventId === event.id),
    );
    for (let i = 0; i < critical.length; i += 1) {
      for (let j = i + 1; j < critical.length; j += 1) {
        const firstDate = parseCompetitionYmd(critical[i].startDate, 'event.startDate');
        const secondDate = parseCompetitionYmd(critical[j].startDate, 'event.startDate');
        const gapDays = Math.abs(
          Math.round((secondDate.getTime() - firstDate.getTime()) / 86_400_000),
        );
        if (gapDays > 42) continue;
        conflicts.push({
          eventIds: [critical[i].id, critical[j].id],
          type: 'CRITICAL_EVENT_RECOVERY_CONFLICT',
          severity: 'CRITICAL',
          summary: `Two critical events are only ${gapDays} days apart; conservative fallback cannot assume peak performance for both.`,
        });
      }
    }
    return {
      schemaVersion: 1,
      assessmentDate: input.anchorDate,
      eventAssessments,
      combinedImpact: {
        overallLevel,
        conflicts,
        strategySummary:
          relevant.length > 0
            ? 'Conservative event safeguards are active until a personalized AI assessment succeeds.'
            : 'No candidate event currently overlaps the requested scope under conservative fallback rules.',
      },
    };
  }
}
