import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AthleteClockService } from '@/timezone/athlete-clock.service';
import { DEFAULT_REVIEW_SEND_AT_LOCAL_TIME } from '@/review/review-schedule.constants';
import { ReviewDigestType } from '@prisma/client';
import { completedReviewWindow } from '@/review/review-date-window';

const TYPES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type ReviewType = (typeof TYPES)[number];

function normalizeTime(v: string) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

@Injectable()
export class ReviewScheduleService {
  private readonly logger = new Logger(ReviewScheduleService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AthleteClockService,
  ) {}

  async getSchedules(userId: string) {
    const rows = await this.prisma.reviewSchedule.findMany({
      where: { userId },
      select: {
        type: true,
        enabled: true,
        sendAtLocalTime: true,
        updatedAt: true,
      },
    });
    const map = new Map<string, (typeof rows)[number]>();
    for (const r of rows) map.set(String(r.type), r);

    return TYPES.map((type) => {
      const row = map.get(type);
      return {
        type,
        enabled: row?.enabled ?? true,
        sendAtLocalTime:
          row?.sendAtLocalTime ?? DEFAULT_REVIEW_SEND_AT_LOCAL_TIME,
        updatedAt: row?.updatedAt ?? null,
        isDefault: !row,
      };
    });
  }

  async updateSchedule(
    userId: string,
    type: ReviewType,
    patch: { enabled?: boolean; sendAtLocalTime?: string },
  ) {
    const time =
      patch.sendAtLocalTime !== undefined
        ? normalizeTime(patch.sendAtLocalTime)
        : undefined;
    if (time === null) {
      throw new Error('INVALID_TIME');
    }
    const row = await this.prisma.reviewSchedule.upsert({
      where: { userId_type: { userId, type } },
      create: {
        userId,
        type,
        enabled: patch.enabled ?? true,
        sendAtLocalTime: time ?? DEFAULT_REVIEW_SEND_AT_LOCAL_TIME,
      },
      update: {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(time !== undefined ? { sendAtLocalTime: time } : {}),
      },
      select: {
        type: true,
        enabled: true,
        sendAtLocalTime: true,
        updatedAt: true,
      },
    });
    return row;
  }

  async triggerNow(userId: string, type: ReviewDigestType, asOf = new Date()) {
    const { timezone: tz } = await this.clock.resolve({
      userId,
      instant: asOf,
      fallbackTimezone: process.env.REVIEW_DEFAULT_TIMEZONE,
    });
    const { periodStart, periodEnd } = completedReviewWindow(type, asOf, tz);

    const row = await this.prisma.reviewJob.upsert({
      where: {
        userId_type_periodStart_periodEnd: {
          userId,
          type,
          periodStart,
          periodEnd,
        },
      },
      create: {
        userId,
        type,
        periodStart,
        periodEnd,
        status: 'PENDING',
        availableAt: new Date(),
        attempts: 0,
      },
      update: {
        status: 'PENDING',
        availableAt: new Date(),
        attempts: 0,
        lastError: null,
      },
      select: {
        id: true,
        type: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        availableAt: true,
      },
    });

    this.logger.log(
      `Review manually queued userId=${userId} type=${type} timezone=${tz} periodStartUtc=${periodStart.toISOString()} periodEndUtc=${periodEnd.toISOString()}`,
    );

    return row;
  }
}
