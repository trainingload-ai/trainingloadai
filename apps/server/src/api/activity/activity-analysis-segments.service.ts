import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireActivityWriteLock } from '@/prisma/activity-write-lock';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import {
  validTimelineSegments,
  type TimelineSegmentsResponse,
  type TimelineSegment,
} from '@shared/activity-timeline';
import { ReplaceTimelineSegmentsDto } from './dto/replace-timeline-segments.dto';

@Injectable()
export class ActivityAnalysisSegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async activity(
    client: Pick<Prisma.TransactionClient, 'activity'>,
    hashId: string,
    userId: string,
  ) {
    const activity = await client.activity.findFirst({
      where: readyActivityWhere({ hashId, userId }),
      select: { id: true, startTime: true, endTime: true, elapsedTime: true },
    });
    if (!activity) throw new NotFoundException('ACTIVITY_NOT_FOUND');
    return activity;
  }

  async get(hashId: string, userId: string): Promise<TimelineSegmentsResponse> {
    const activity = await this.activity(this.prisma, hashId, userId);
    const saved = await this.prisma.activityAnalysisSegments.findUnique({
      where: { activityId: activity.id },
    });
    return {
      revision: saved?.revision ?? 0,
      segments: (saved?.segments ?? null) as TimelineSegment[] | null,
    };
  }

  async replace(
    hashId: string,
    userId: string,
    dto: ReplaceTimelineSegmentsDto,
  ): Promise<TimelineSegmentsResponse> {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.activity(tx, hashId, userId);
      await acquireActivityWriteLock(tx, target.id);
      const activity = await this.activity(tx, hashId, userId);
      const duration =
        activity.startTime &&
        activity.endTime &&
        activity.endTime > activity.startTime
          ? (activity.endTime.getTime() - activity.startTime.getTime()) / 1000
          : (activity.elapsedTime ?? 0);
      if (
        dto.segments !== null &&
        !validTimelineSegments(dto.segments, duration)
      )
        throw new BadRequestException('INVALID_TIMELINE_SEGMENTS');
      const previous = await tx.activityAnalysisSegments.findUnique({
        where: { activityId: activity.id },
      });
      if ((previous?.revision ?? 0) !== dto.revision)
        throw new ConflictException('TIMELINE_SEGMENTS_STALE');
      const segments =
        dto.segments === null
          ? Prisma.JsonNull
          : dto.segments.map((segment) => ({
              ...segment,
              name: segment.name.trim(),
            }));
      const saved = await tx.activityAnalysisSegments.upsert({
        where: { activityId: activity.id },
        create: { activityId: activity.id, revision: 1, segments },
        update: { revision: { increment: 1 }, segments },
      });
      return {
        revision: saved.revision,
        segments: saved.segments as TimelineSegment[] | null,
      };
    });
  }
}
