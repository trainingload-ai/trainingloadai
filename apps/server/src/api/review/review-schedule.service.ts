import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { DEFAULT_REVIEW_SEND_AT_LOCAL_TIME } from '@/review/review-schedule.constants';
import { BodyMetricType, ReviewDigestType } from '@prisma/client';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

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
    users: UserQueryService,
  ) {
    this.users = users;
  }

  private readonly users: UserQueryService;

  private defaultTimezone() {
    return process.env.REVIEW_DEFAULT_TIMEZONE?.trim() || 'Asia/Shanghai';
  }

  private normalizeTimezone(value?: string | null) {
    const candidate = value?.trim() || this.defaultTimezone();
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
      return candidate;
    } catch {
      return this.defaultTimezone();
    }
  }

  private async getUserTimezone(userId: string) {
    const row = await this.users.bodyMetrics().findFirst({
      where: { userId, type: BodyMetricType.TIMEZONE },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true },
    });
    return this.normalizeTimezone(row?.value);
  }

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

  async triggerNow(userId: string, type: ReviewDigestType) {
    const tz = await this.getUserTimezone(userId);
    const localNow = dayjs().tz(tz);
    const periodEnd = localNow.startOf('day').utc().toDate();
    const periodStart = localNow
      .startOf('day')
      .subtract(type === 'DAILY' ? 1 : type === 'WEEKLY' ? 7 : 30, 'day')
      .utc()
      .toDate();

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
      `[复盘][手动触发] userId=${userId} type=${type} timezone=${tz} localNow=${localNow.format()} periodStartUtc=${periodStart.toISOString()} periodEndUtc=${periodEnd.toISOString()}`,
    );

    return row;
  }
}
