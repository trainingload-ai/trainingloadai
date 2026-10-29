import { Injectable } from '@nestjs/common';
import { CompetitionStatus } from '@prisma/client';
import { CompetitionRepository } from '../persistence/competition.repository';

/**
 * Competition 表对外只读 API。Calendar / 导出走这里，不要直查比赛表。
 */
@Injectable()
export class CompetitionQueryService {
  constructor(private readonly competitions: CompetitionRepository) {}

  /** Bounded, user-scoped competition projection for read-only MCP clients. */
  listForMcp(args: {
    userId: string;
    from: Date;
    to: Date;
    offset: number;
    limit: number;
  }) {
    return this.competitions.findEvents({
      where: {
        userId: args.userId,
        deletedAt: null,
        status: { not: CompetitionStatus.CANCELLED },
        startDate: { lte: args.to },
        OR: [
          { endDate: null, startDate: { gte: args.from } },
          { endDate: { gte: args.from } },
        ],
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      skip: args.offset,
      take: args.limit + 1,
      select: {
        id: true,
        title: true,
        sportType: true,
        distanceMeters: true,
        startDate: true,
        endDate: true,
        startTimeMinute: true,
        timezone: true,
        importance: true,
        goalType: true,
        targetTimeSeconds: true,
        location: true,
        notes: true,
        status: true,
      },
    });
  }

  /** Detailed user-scoped competition projection for read-only MCP clients. */
  getForMcp(userId: string, eventId: string) {
    return this.competitions.findEvent({
      where: {
        id: eventId,
        userId,
        deletedAt: null,
        status: { not: CompetitionStatus.CANCELLED },
      },
      select: {
        id: true,
        title: true,
        sportType: true,
        distanceMeters: true,
        startDate: true,
        endDate: true,
        startTimeMinute: true,
        timezone: true,
        importance: true,
        goalType: true,
        targetTimeSeconds: true,
        location: true,
        notes: true,
        status: true,
      },
    });
  }

  findPlannedGoalRaceById(userId: string, eventId: string) {
    return this.competitions.findEvent({
      where: {
        id: eventId,
        userId,
        deletedAt: null,
        status: CompetitionStatus.PLANNED,
      },
    });
  }

  findCalendarFeedEvents(userId: string) {
    return this.competitions.findEvents({
      where: {
        userId,
        deletedAt: null,
        status: { not: CompetitionStatus.CANCELLED },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        sportType: true,
        distanceMeters: true,
        startDate: true,
        endDate: true,
        startTimeMinute: true,
        timezone: true,
        importance: true,
        goalType: true,
        targetTimeSeconds: true,
        location: true,
        notes: true,
        status: true,
        version: true,
        updatedAt: true,
      },
    });
  }

  findExportEventsCutoff(userId: string, cutoff: Date) {
    return this.competitions.findEvents({
      where: {
        userId,
        createdAt: { lte: cutoff },
        deletedAt: null,
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
  }
}
