import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ActivityAnalysisSegmentsService } from '../activity-analysis-segments.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('ActivityAnalysisSegmentsService', () => {
  let service: ActivityAnalysisSegmentsService;
  let database: any;
  let saved: any;
  const segment = { id: 'lap:1', name: ' Work ', start: 0, end: 60 };
  beforeEach(() => {
    saved = null;
    database = {
      activity: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 7,
            startTime: new Date(0),
            endTime: new Date(120000),
            elapsedTime: 120,
          }),
      },
      activityAnalysisSegments: {
        findUnique: jest.fn(async () => saved),
        upsert: jest.fn(async ({ create, update }) => {
          saved = saved
            ? {
                ...saved,
                revision: saved.revision + 1,
                segments: update.segments,
              }
            : create;
          return saved;
        }),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(async (callback) => callback(database)),
    };
    service = new ActivityAnalysisSegmentsService(database as PrismaService);
  });
  it('scopes reads to the activity owner and defaults to imported laps without a write', async () => {
    expect(await service.get('hash', 'owner')).toEqual({
      revision: 0,
      segments: null,
    });
    expect(database.activity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ hashId: 'hash', userId: 'owner' }),
          ]),
        }),
      }),
    );
    expect(database.activityAnalysisSegments.upsert).not.toHaveBeenCalled();
    database.activity.findFirst.mockResolvedValue(null);
    await expect(service.get('hash', 'other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(database.activityAnalysisSegments.findUnique).toHaveBeenCalledTimes(
      1,
    );
  });
  it('saves separate analysis boundaries, trims names and rejects stale edits', async () => {
    expect(
      await service.replace('hash', 'owner', {
        revision: 0,
        segments: [segment],
      }),
    ).toEqual({ revision: 1, segments: [{ ...segment, name: 'Work' }] });
    expect(database.$executeRawUnsafe).toHaveBeenCalled();
    await expect(
      service.replace('hash', 'owner', { revision: 0, segments: [segment] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(saved.revision).toBe(1);
    expect(database.activityAnalysisSegments.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects overlap and invalid activity boundaries before persistence', async () => {
    for (const segments of [
      [{ ...segment, end: 121 }],
      [segment, { ...segment, id: 'lap:2', start: 59, end: 80 }],
      [{ ...segment, end: 0 }],
    ]) {
      await expect(
        service.replace('hash', 'owner', { revision: 0, segments }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(database.activityAnalysisSegments.upsert).not.toHaveBeenCalled();
  });
});
