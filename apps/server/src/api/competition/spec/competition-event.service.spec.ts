import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import {
  CompetitionEventSource,
  CompetitionGoalType,
  CompetitionImportance,
  CompetitionRevisionAction,
  CompetitionStatus,
  SportType,
} from '@prisma/client';
import { CompetitionEventService } from '../competition-event.service';
import { CompetitionRepository } from '../persistence/competition.repository';
import { SportCatalogService } from '@/sports/sport-catalog.service';
import { SportCatalogRepository } from '@/sports/persistence/sport-catalog.repository';

function createService(prisma: object) {
  return new CompetitionEventService(
    new CompetitionRepository(prisma as never),
    new SportCatalogService(new SportCatalogRepository(prisma as never)),
  );
}

const asyncMock = (value: unknown) =>
  jest.fn<() => Promise<unknown>>().mockResolvedValue(value);

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    userId: 'user-1',
    title: 'Target marathon',
    sportType: SportType.RUN,
    sportDefinitionCode: null,
    sportDefinition: null,
    distanceMeters: 42195,
    startDate: new Date('2026-08-23T00:00:00.000Z'),
    endDate: null,
    startTimeMinute: 420,
    timezone: 'Asia/Shanghai',
    importance: CompetitionImportance.CRITICAL,
    goalType: CompetitionGoalType.TARGET_TIME,
    targetTimeSeconds: 14400,
    location: null,
    notes: null,
    status: CompetitionStatus.PLANNED,
    source: CompetitionEventSource.MANUAL,
    idempotencyKey: 'create-1',
    idempotencyHash: null,
    version: 1,
    deletedAt: null,
    createdAt: new Date('2026-07-16T00:00:00.000Z'),
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    ...overrides,
  };
}

function createInput() {
  return {
    title: 'Target marathon',
    sportType: SportType.RUN,
    distanceMeters: 42195,
    startDate: '2026-08-23',
    startTimeMinute: 420,
    timezone: 'Asia/Shanghai',
    importance: CompetitionImportance.CRITICAL,
    goalType: CompetitionGoalType.TARGET_TIME,
    targetTimeSeconds: 14400,
  };
}

describe('CompetitionEventService', () => {
  it('creates the event and immutable revision in one transaction', async () => {
    const created = eventRow();
    const tx = {
      competitionEvent: { create: asyncMock(created) },
      competitionEventRevision: { create: asyncMock({}) },
    };
    const prisma = {
      competitionEvent: { findUnique: asyncMock(null) },
      sportDefinition: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    const result = await service.create('user-1', {
      input: createInput(),
      source: CompetitionEventSource.MANUAL,
      actorType: 'USER',
      idempotencyKey: 'create-1',
      requestId: 'request-1',
    });

    expect(result).toMatchObject({
      id: 'event-1',
      startDate: '2026-08-23',
      importance: CompetitionImportance.CRITICAL,
      version: 1,
    });
    expect(tx.competitionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          startDate: new Date('2026-08-23T00:00:00.000Z'),
          idempotencyKey: 'create-1',
          idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(tx.competitionEventRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'event-1',
        eventVersion: 1,
        action: 'CREATED',
        actorType: 'USER',
        requestId: 'request-1',
      }),
    });
  });

  it('returns an existing resource for a matching idempotent retry', async () => {
    const prisma = {
      competitionEvent: { findUnique: jest.fn<() => Promise<unknown>>() },
      sportDefinition: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = createService(prisma);
    const firstAttemptData = await (service as never as { normalizeWriteInput: (...args: unknown[]) => Promise<unknown> }).normalizeWriteInput(
      createInput(),
    );
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value && typeof value === 'object') {
        if (value instanceof Date) return JSON.stringify(value.toJSON());
        return `{${Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
          .join(',')}}`;
      }
      return JSON.stringify(value);
    };
    const { createHash } = await import('crypto');
    const hash = createHash('sha256')
      .update(canonical(firstAttemptData))
      .digest('hex');
    prisma.competitionEvent.findUnique.mockResolvedValue(
      eventRow({ idempotencyHash: hash }),
    );

    const result = await service.create('user-1', {
      input: createInput(),
      source: CompetitionEventSource.MANUAL,
      actorType: 'USER',
      idempotencyKey: 'create-1',
    });

    expect(result.id).toBe('event-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with another payload', async () => {
    const prisma = {
      competitionEvent: {
        findUnique: asyncMock(eventRow({ idempotencyHash: 'different' })),
      },
      sportDefinition: { findUnique: jest.fn() },
    };
    const service = createService(prisma);

    await expect(
      service.create('user-1', {
        input: createInput(),
        source: CompetitionEventSource.MANUAL,
        actorType: 'USER',
        idempotencyKey: 'create-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires target time only for TARGET_TIME goals', async () => {
    const service = createService({});
    await expect(
      service.create('user-1', {
        input: {
          ...createInput(),
          goalType: CompetitionGoalType.FINISH,
          targetTimeSeconds: 14400,
        },
        source: CompetitionEventSource.MANUAL,
        actorType: 'USER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a version conflict with the latest event', async () => {
    const prisma = {
      competitionEvent: {
        findFirst: asyncMock(eventRow({ version: 2 })),
      },
    };
    const service = createService(prisma);

    await expect(
      service.update({
        userId: 'user-1',
        eventId: 'event-1',
        input: { expectedVersion: 1, title: 'New title' },
        actorType: 'USER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels through an optimistic transaction and writes an immutable revision', async () => {
    const before = eventRow();
    const after = eventRow({ status: CompetitionStatus.CANCELLED, version: 2 });
    const tx = {
      competitionEvent: {
        updateMany: asyncMock({ count: 1 }),
        findUniqueOrThrow: asyncMock(after),
      },
      competitionEventRevision: { create: asyncMock({}) },
    };
    const prisma = {
      competitionEvent: { findFirst: asyncMock(before) },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    const result = await service.cancelOrRestore({
      userId: 'user-1',
      eventId: 'event-1',
      expectedVersion: 1,
      restore: false,
      actorType: 'USER',
      requestId: 'cancel-request',
    });

    expect(result).toMatchObject({ status: CompetitionStatus.CANCELLED, version: 2 });
    expect(tx.competitionEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', userId: 'user-1', version: 1, deletedAt: null },
      data: { status: CompetitionStatus.CANCELLED, version: { increment: 1 } },
    });
    expect(tx.competitionEventRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: CompetitionRevisionAction.CANCELLED,
        eventVersion: 2,
        requestId: 'cancel-request',
      }),
    });
  });

  it('rejects invalid state transitions instead of silently replaying them', async () => {
    const service = createService({
      competitionEvent: {
        findFirst: asyncMock(eventRow({ status: CompetitionStatus.CANCELLED })),
      },
    });

    await expect(service.cancelOrRestore({
      userId: 'user-1',
      eventId: 'event-1',
      expectedVersion: 1,
      restore: false,
      actorType: 'USER',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('queries events by date-range intersection rather than containment', async () => {
    const findMany = asyncMock([]);
    const service = createService({
      competitionEvent: { findMany },
    });

    await service.list({
      userId: 'user-1',
      startDate: '2026-08-20',
      endDate: '2026-08-25',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          startDate: { lte: new Date('2026-08-25T00:00:00.000Z') },
          OR: [
            {
              endDate: null,
              startDate: { gte: new Date('2026-08-20T00:00:00.000Z') },
            },
            { endDate: { gte: new Date('2026-08-20T00:00:00.000Z') } },
          ],
        }),
      }),
    );
  });
});
