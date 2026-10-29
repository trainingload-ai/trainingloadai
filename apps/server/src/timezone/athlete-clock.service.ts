import { Injectable } from '@nestjs/common';
import { BodyMetricType } from '@prisma/client';

import { UserQueryService } from '@/api/user/user-query.service';
import { activityCalendarYmdInZone } from '@/api/plan/plan-link-calendar.util';
import { normalizeIanaTimezone } from './user-timezone-initializer.service';

export type AthleteClock = {
  instant: Date;
  timezone: string;
  localDate: string;
};

/**
 * 统一处理“UTC 瞬间属于运动员哪一个日历日”。
 *
 * 数据库中的 timestamp 始终是 UTC 瞬间；只有在业务边界判断“今天、昨天、
 * 本周”等本地语义时，才结合用户 IANA 时区投影为日历日。Prisma DATE 列本身
 * 是无时区日历日期，不经过本服务二次偏移。
 */
@Injectable()
export class AthleteClockService {
  constructor(private readonly users: UserQueryService) {}

  async preferredTimezone(userId: string): Promise<string | null> {
    const row = await this.users.bodyMetrics().findFirst({
      where: { userId, type: BodyMetricType.TIMEZONE },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true },
    });
    return normalizeIanaTimezone(row?.value);
  }

  async resolve(args: {
    userId: string;
    clientTimezone?: string | null;
    instant?: Date;
  }): Promise<AthleteClock> {
    const instant = args.instant ?? new Date();
    const timezone =
      (await this.preferredTimezone(args.userId)) ??
      normalizeIanaTimezone(args.clientTimezone) ??
      'UTC';
    const localDate = activityCalendarYmdInZone(instant, timezone);
    if (!localDate) {
      throw new Error('ATHLETE_LOCAL_DATE_PROJECTION_FAILED');
    }
    return { instant, timezone, localDate };
  }

  async todayYmd(
    userId: string,
    clientTimezone?: string | null,
    instant?: Date,
  ): Promise<string> {
    return (await this.resolve({ userId, clientTimezone, instant })).localDate;
  }
}
