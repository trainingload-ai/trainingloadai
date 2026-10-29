import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { CompetitionImportance, CompetitionStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PMCService } from '@/training-load/pmc.service';
import { CompetitionRepository } from './persistence/competition.repository';
import { resolveSupportedLocale } from '@/utils/locale.util';
import {
  addCompetitionDays,
  competitionDateToYmd,
  differenceInCompetitionDays,
  parseCompetitionYmd,
} from './competition-calendar.util';
import type {
  CompetitionImpactInput,
  ResolveCompetitionImpactArgs,
} from './competition-impact.types';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { ActivityReadService } from '@/api/activity/activity-read.service';

const MAX_CANDIDATE_EVENTS = 24;
const IMPORTANCE_WEIGHT: Record<CompetitionImportance, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function rounded(value: number, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

@Injectable()
export class CompetitionImpactContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pmc: PMCService,
    private readonly competitions: CompetitionRepository,
    private readonly activityRead: ActivityReadService,
  ) {}

  async buildInput(
    args: ResolveCompetitionImpactArgs,
  ): Promise<CompetitionImpactInput> {
    const scopeStart = parseCompetitionYmd(
      args.scopeStartDate,
      'scopeStartDate',
    );
    const scopeEnd = parseCompetitionYmd(args.scopeEndDate, 'scopeEndDate');
    const anchorDate = parseCompetitionYmd(args.anchorDate, 'anchorDate');
    if (scopeEnd < scopeStart) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_DATE',
        message: 'scopeEndDate cannot precede scopeStartDate',
      });
    }
    if (differenceInCompetitionDays(scopeEnd, scopeStart) > 730) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_DATE',
        message: 'competition impact scope cannot exceed 730 days',
      });
    }

    const candidateStart = addCompetitionDays(scopeStart, -84);
    const candidateEnd = addCompetitionDays(scopeEnd, 364);
    const rawEvents = await this.competitions.findEvents({
      where: {
        userId: args.userId,
        deletedAt: null,
        status: CompetitionStatus.PLANNED,
        startDate: { lte: candidateEnd },
        OR: [
          { endDate: null, startDate: { gte: candidateStart } },
          { endDate: { gte: candidateStart } },
        ],
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true,
        version: true,
        title: true,
        sportType: true,
        sportDefinitionCode: true,
        distanceMeters: true,
        startDate: true,
        endDate: true,
        importance: true,
        goalType: true,
        targetTimeSeconds: true,
      },
    });

    const rankedEvents = rawEvents
      .map((event) => ({
        event,
        distanceToScope:
          event.startDate < scopeStart
            ? differenceInCompetitionDays(scopeStart, event.startDate)
            : event.startDate > scopeEnd
              ? differenceInCompetitionDays(event.startDate, scopeEnd)
              : 0,
      }))
      .sort(
        (a, b) =>
          IMPORTANCE_WEIGHT[b.event.importance] -
            IMPORTANCE_WEIGHT[a.event.importance] ||
          a.distanceToScope - b.distanceToScope ||
          a.event.startDate.getTime() - b.event.startDate.getTime(),
      )
      .slice(0, MAX_CANDIDATE_EVENTS)
      .map(({ event }) => event)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    const baselineStart = addCompetitionDays(anchorDate, -56);
    const [activities, pmcRows] = await Promise.all([
      this.activityRead.findMany({
        where: readyActivityWhere({
          userId: args.userId,
          startTime: {
            gte: baselineStart,
            lt: addCompetitionDays(anchorDate, 1),
          },
        }),
        orderBy: { startTime: 'desc' },
        select: {
          startTime: true,
          sportType: true,
          timerTime: true,
          elapsedTime: true,
          distance: true,
          coggan: { select: { bikeStress: true } },
          trimp: { select: { trimp100: true } },
        },
      }),
      this.pmc.listFitnessWindow(
        args.userId,
        addCompetitionDays(anchorDate, -6),
        anchorDate,
      ),
    ]);

    const activityDurationMin = (activity: (typeof activities)[number]) =>
      Number(activity.timerTime ?? activity.elapsedTime ?? 0) / 60;
    const activityDistanceKm = (activity: (typeof activities)[number]) =>
      Number(activity.distance ?? 0) / 1000;
    const activityLoad = (activity: (typeof activities)[number]) =>
      Number(activity.coggan?.bikeStress ?? activity.trimp?.trimp100 ?? 0);
    const activeDayKeys = new Set(
      activities
        .map((activity) => competitionDateToYmd(activity.startTime))
        .filter(Boolean),
    );
    const longest = activities.reduce<(typeof activities)[number] | null>(
      (best, activity) =>
        !best || activityDurationMin(activity) > activityDurationMin(best)
          ? activity
          : best,
      null,
    );
    const latestPmc = pmcRows[pmcRows.length - 1] ?? null;

    return {
      schemaVersion: 1,
      locale: resolveSupportedLocale(args.locale),
      anchorDate: args.anchorDate,
      scope: {
        type: args.scopeType,
        startDate: args.scopeStartDate,
        endDate: args.scopeEndDate,
        ...(args.subjectSummary ? { subjectSummary: args.subjectSummary } : {}),
      },
      candidateSelection: {
        startDate: competitionDateToYmd(candidateStart)!,
        endDate: competitionDateToYmd(candidateEnd)!,
        truncated: rawEvents.length > rankedEvents.length,
        totalBeforeLimit: rawEvents.length,
      },
      events: rankedEvents.map((event) => ({
        id: event.id,
        version: event.version,
        title: event.title,
        sportType: event.sportType,
        sportDefinitionCode: event.sportDefinitionCode,
        distanceMeters: event.distanceMeters,
        startDate: competitionDateToYmd(event.startDate)!,
        endDate: competitionDateToYmd(event.endDate),
        importance: event.importance,
        goalType: event.goalType,
        targetTimeSeconds: event.targetTimeSeconds,
      })),
      athlete: {
        personalizationReadiness:
          activities.length === 0
            ? 'none'
            : activities.length < 4
              ? 'sparse'
              : 'adequate',
        averageWeek: {
          activityCount: rounded(activities.length / 8),
          activeDays: rounded(activeDayKeys.size / 8),
          totalDurationMin: rounded(
            activities.reduce(
              (sum, activity) => sum + activityDurationMin(activity),
              0,
            ) / 8,
          ),
          totalDistanceKm: rounded(
            activities.reduce(
              (sum, activity) => sum + activityDistanceKm(activity),
              0,
            ) / 8,
            2,
          ),
          totalLoad: rounded(
            activities.reduce(
              (sum, activity) => sum + activityLoad(activity),
              0,
            ) / 8,
          ),
        },
        longestSession: longest
          ? {
              sportType: longest.sportType,
              durationMin: rounded(activityDurationMin(longest)),
              distanceKm: rounded(activityDistanceKm(longest), 2),
              date: competitionDateToYmd(longest.startTime),
            }
          : null,
        recentLoad: {
          ctl: latestPmc?.CTL ?? null,
          atl: latestPmc?.ATL ?? null,
          tsb: latestPmc?.TSB ?? null,
          dailyLoadLast7d: pmcRows.map((row) =>
            rounded(Number(row.dailyValue ?? 0)),
          ),
        },
        dataFreshness: {
          latestActivityAt: activities[0]?.startTime?.toISOString() ?? null,
          latestPmcDate: competitionDateToYmd(latestPmc?.date),
        },
      },
    };
  }
}
