import { Injectable, Optional } from '@nestjs/common';
import { BodyMetricType, ChangeSource, Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';

export type TimezoneInitializationSource =
  | 'EXISTING'
  | 'ACTIVITY_COORDINATES'
  | 'CLIENT'
  | 'NONE';

export type TimezoneInitializationResult = {
  timezone: string | null;
  initialized: boolean;
  source: TimezoneInitializationSource;
};

export function normalizeIanaTimezone(value: unknown): string | null {
  const candidate = String(value ?? '').trim();
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return null;
  }
}

@Injectable()
export class UserTimezoneInitializerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserQueryService,
    private readonly activityRead: ActivityReadService,
  ) {}

  async initializeFromAvailableSignals(
    userId: string,
    clientTimezone?: string | null,
  ): Promise<TimezoneInitializationResult> {
    const current = await this.currentOrEmpty(userId);
    if (current.timezone) return current;

    const coordinateActivity = await this.activityRead.findFirst({
      where: readyActivityWhere({
        userId,
        timezone: { not: null },
        startLat: { not: null },
        startLng: { not: null },
      }),
      orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, timezone: true },
    });
    const activityTimezone = normalizeIanaTimezone(
      coordinateActivity?.timezone,
    );
    const normalizedClientTimezone = normalizeIanaTimezone(clientTimezone);

    if (activityTimezone) {
      return this.initializeIfAbsent(userId, activityTimezone, {
        source: 'ACTIVITY_COORDINATES',
        activityId: coordinateActivity?.id ?? null,
      });
    }
    if (normalizedClientTimezone) {
      return this.initializeIfAbsent(userId, normalizedClientTimezone, {
        source: 'CLIENT',
      });
    }
    return this.currentOrEmpty(userId);
  }

  async initializeFromCoordinateActivity(
    userId: string,
    activity: {
      id: number;
      timezone?: string | null;
      startLat?: unknown;
      startLng?: unknown;
    },
  ): Promise<TimezoneInitializationResult> {
    const timezone = normalizeIanaTimezone(activity.timezone);
    if (
      !timezone ||
      activity.startLat === null ||
      activity.startLat === undefined ||
      activity.startLng === null ||
      activity.startLng === undefined
    ) {
      return this.currentOrEmpty(userId);
    }
    return this.initializeIfAbsent(userId, timezone, {
      source: 'ACTIVITY_COORDINATES',
      activityId: activity.id,
    });
  }

  private async currentOrEmpty(
    userId: string,
  ): Promise<TimezoneInitializationResult> {
    const current = await this.users.bodyMetrics().findFirst({
      where: { userId, type: BodyMetricType.TIMEZONE },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true },
    });
    const timezone = normalizeIanaTimezone(current?.value);
    return {
      timezone,
      initialized: false,
      source: timezone ? 'EXISTING' : 'NONE',
    };
  }

  private async initializeIfAbsent(
    userId: string,
    timezone: string,
    origin:
      | { source: 'ACTIVITY_COORDINATES'; activityId: number | null }
      | { source: 'CLIENT' },
  ): Promise<TimezoneInitializationResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const current = await this.users.bodyMetrics(tx).findFirst({
              where: { userId, type: BodyMetricType.TIMEZONE },
              orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
              select: { value: true },
            });
            const existingTimezone = normalizeIanaTimezone(current?.value);
            if (existingTimezone) {
              return {
                timezone: existingTimezone,
                initialized: false,
                source: 'EXISTING' as const,
              };
            }

            await this.users.bodyMetrics(tx).create({
              data: {
                userId,
                type: BodyMetricType.TIMEZONE,
                value: timezone,
                effectiveDate: new Date(),
                changeSource: ChangeSource.SYSTEM_CALCULATED,
                originPayload: {
                  initializationSource: origin.source,
                  ...('activityId' in origin
                    ? { activityId: origin.activityId }
                    : {}),
                } as Prisma.InputJsonValue,
              },
            });
            return {
              timezone,
              initialized: true,
              source: origin.source,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          (error as { code?: string } | null)?.code !== 'P2034' ||
          attempt === 2
        ) {
          throw error;
        }
      }
    }
    return this.currentOrEmpty(userId);
  }
}
