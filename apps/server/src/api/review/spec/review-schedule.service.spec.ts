import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { BodyMetricType } from '@prisma/client';
import { ReviewScheduleService } from '../review-schedule.service';

describe('ReviewScheduleService', () => {
  function createService() {
    const prisma = {
      reviewSchedule: {
        findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
      userBodyMetric: {
        findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
      reviewJob: {
        upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
    };

    return {
      prisma,
      service: new ReviewScheduleService(
        prisma as never,
        {
          bodyMetrics: () => prisma.userBodyMetric,
        } as never,
      ),
    };
  }

  it('returns explicit schedules merged with defaults for missing digest types', async () => {
    const { prisma, service } = createService();
    const updatedAt = new Date('2026-06-29T00:00:00.000Z');
    prisma.reviewSchedule.findMany.mockResolvedValueOnce([
      {
        type: 'WEEKLY',
        enabled: false,
        sendAtLocalTime: '21:30',
        updatedAt,
      },
    ]);

    await expect(service.getSchedules('user-1')).resolves.toEqual([
      {
        type: 'DAILY',
        enabled: true,
        sendAtLocalTime: '05:00',
        updatedAt: null,
        isDefault: true,
      },
      {
        type: 'WEEKLY',
        enabled: false,
        sendAtLocalTime: '21:30',
        updatedAt,
        isDefault: false,
      },
      {
        type: 'MONTHLY',
        enabled: true,
        sendAtLocalTime: '05:00',
        updatedAt: null,
        isDefault: true,
      },
    ]);
    expect(prisma.reviewSchedule.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        type: true,
        enabled: true,
        sendAtLocalTime: true,
        updatedAt: true,
      },
    });
  });

  it('normalizes valid send times during schedule updates', async () => {
    const { prisma, service } = createService();
    const row = {
      type: 'DAILY',
      enabled: false,
      sendAtLocalTime: '07:05',
      updatedAt: new Date('2026-06-29T00:00:00.000Z'),
    };
    prisma.reviewSchedule.upsert.mockResolvedValueOnce(row);

    await expect(
      service.updateSchedule('user-1', 'DAILY', {
        enabled: false,
        sendAtLocalTime: '7:05',
      }),
    ).resolves.toBe(row);

    expect(prisma.reviewSchedule.upsert).toHaveBeenCalledWith({
      where: { userId_type: { userId: 'user-1', type: 'DAILY' } },
      create: {
        userId: 'user-1',
        type: 'DAILY',
        enabled: false,
        sendAtLocalTime: '07:05',
      },
      update: {
        enabled: false,
        sendAtLocalTime: '07:05',
      },
      select: {
        type: true,
        enabled: true,
        sendAtLocalTime: true,
        updatedAt: true,
      },
    });
  });

  it('uses 05:00 when creating a schedule without an explicit send time', async () => {
    const { prisma, service } = createService();
    const row = {
      type: 'DAILY',
      enabled: false,
      sendAtLocalTime: '05:00',
      updatedAt: new Date('2026-09-11T00:00:00.000Z'),
    };
    prisma.reviewSchedule.upsert.mockResolvedValueOnce(row);

    await expect(
      service.updateSchedule('user-1', 'DAILY', { enabled: false }),
    ).resolves.toBe(row);

    expect(prisma.reviewSchedule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: 'user-1',
          type: 'DAILY',
          enabled: false,
          sendAtLocalTime: '05:00',
        },
      }),
    );
  });

  it('rejects invalid local send times before writing', async () => {
    const { prisma, service } = createService();

    await expect(
      service.updateSchedule('user-1', 'DAILY', {
        sendAtLocalTime: '24:00',
      }),
    ).rejects.toThrow('INVALID_TIME');
    expect(prisma.reviewSchedule.upsert).not.toHaveBeenCalled();
  });

  it('triggers a review job for the previous local day in the user timezone', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-29T10:30:00.000Z'));
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { prisma, service } = createService();
    prisma.userBodyMetric.findFirst.mockResolvedValueOnce({
      value: 'Asia/Shanghai',
    });
    const row = {
      id: 'job-1',
      type: 'DAILY',
      periodStart: new Date('2026-06-27T16:00:00.000Z'),
      periodEnd: new Date('2026-06-28T16:00:00.000Z'),
      status: 'PENDING',
      availableAt: new Date('2026-06-29T10:30:00.000Z'),
    };
    prisma.reviewJob.upsert.mockResolvedValueOnce(row);

    try {
      await expect(service.triggerNow('user-1', 'DAILY')).resolves.toBe(row);

      expect(prisma.userBodyMetric.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', type: BodyMetricType.TIMEZONE },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        select: { value: true },
      });
      expect(prisma.reviewJob.upsert).toHaveBeenCalledWith({
        where: {
          userId_type_periodStart_periodEnd: {
            userId: 'user-1',
            type: 'DAILY',
            periodStart: new Date('2026-06-27T16:00:00.000Z'),
            periodEnd: new Date('2026-06-28T16:00:00.000Z'),
          },
        },
        create: {
          userId: 'user-1',
          type: 'DAILY',
          periodStart: new Date('2026-06-27T16:00:00.000Z'),
          periodEnd: new Date('2026-06-28T16:00:00.000Z'),
          status: 'PENDING',
          availableAt: new Date('2026-06-29T10:30:00.000Z'),
          attempts: 0,
        },
        update: {
          status: 'PENDING',
          availableAt: new Date('2026-06-29T10:30:00.000Z'),
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
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('user-1'));
    } finally {
      jest.useRealTimers();
      logSpy.mockRestore();
    }
  });
});
