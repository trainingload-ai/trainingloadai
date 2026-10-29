import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompetitionEventSource,
  CompetitionGoalType,
  CompetitionImportance,
  CompetitionRevisionAction,
  CompetitionStatus,
  Prisma,
  SportType,
} from '@prisma/client';
import { createHash } from 'crypto';
import { CompetitionRepository } from './persistence/competition.repository';
import type { CompetitionDb } from './persistence/competition-db';
import { SportCatalogService } from '@/sports/sport-catalog.service';
import {
  assertIanaTimezone,
  competitionDateToYmd,
  differenceInCompetitionDays,
  parseCompetitionYmd,
} from './competition-calendar.util';
import type {
  CompetitionEventMutationActor,
  CompetitionEventWriteInput,
  CreateCompetitionEventArgs,
} from './competition-event.types';
import type { UpdateCompetitionEventDto } from './dto/update-competition-event.dto';

const MAX_EVENT_DURATION_DAYS = 31;

type CompetitionEventRow = Prisma.CompetitionEventGetPayload<{
  include: { sportDefinition: { select: { code: true; displayName: true } } };
}>;

const eventInclude = {
  sportDefinition: { select: { code: true, displayName: true } },
} satisfies Prisma.CompetitionEventInclude;

function normalizedString(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class CompetitionEventService {
  constructor(
    private readonly competitions: CompetitionRepository,
    private readonly sports: SportCatalogService,
  ) {}

  async list(args: {
    userId: string;
    startDate: string;
    endDate: string;
    status?: CompetitionStatus;
  }) {
    const startDate = parseCompetitionYmd(args.startDate, 'startDate');
    const endDate = parseCompetitionYmd(args.endDate, 'endDate');
    if (endDate < startDate) this.invalidDate('endDate cannot precede startDate');
    if (differenceInCompetitionDays(endDate, startDate) > 400) {
      this.invalidDate('competition event query range cannot exceed 400 days');
    }

    const events = await this.competitions.findEvents({
      where: {
        userId: args.userId,
        deletedAt: null,
        ...(args.status
          ? { status: args.status }
          : { status: { in: [CompetitionStatus.PLANNED, CompetitionStatus.COMPLETED] } }),
        startDate: { lte: endDate },
        OR: [{ endDate: null, startDate: { gte: startDate } }, { endDate: { gte: startDate } }],
      },
      orderBy: [{ startDate: 'asc' }, { importance: 'desc' }, { createdAt: 'asc' }],
      include: eventInclude,
    });
    return { events: events.map((event) => this.toResponse(event)) };
  }

  async getById(userId: string, eventId: string) {
    const event = await this.findOwnedEvent(userId, eventId);
    return this.toResponse(event);
  }

  async create(
    userId: string,
    args: CreateCompetitionEventArgs,
    tx?: CompetitionDb,
  ) {
    const normalizedKey = normalizedString(args.idempotencyKey)?.slice(0, 200) ?? null;
    const data = await this.normalizeWriteInput(args.input);
    const idempotencyHash = normalizedKey
      ? createHash('sha256').update(canonicalJson(data)).digest('hex')
      : null;

    if (normalizedKey) {
      const existing = await this.competitions.findEventUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: normalizedKey } },
        include: eventInclude,
      }, tx);
      if (existing) {
        if (existing.idempotencyHash !== idempotencyHash) {
          throw new ConflictException({
            code: 'COMPETITION_EVENT_IDEMPOTENCY_CONFLICT',
            message: 'Idempotency-Key was already used with a different payload',
          });
        }
        return this.toResponse(existing);
      }
    }

    try {
      const created = await this.competitions.runTransaction(async (tx) => {
        const event = await this.competitions.createEvent(
          {
            data: {
              userId,
              ...data,
              source: args.source,
              idempotencyKey: normalizedKey,
              idempotencyHash,
            },
            include: eventInclude,
          },
          tx,
        );
        await this.competitions.createRevision(
          {
            data: {
              eventId: event.id,
              userId,
              eventVersion: event.version,
              action: CompetitionRevisionAction.CREATED,
              actorType: args.actorType,
              requestId: normalizedString(args.requestId),
              after: this.toSnapshot(event),
            },
          },
          tx,
        );
        return event;
      }, tx);
      return this.toResponse(created);
    } catch (error) {
      if (normalizedKey && this.isUniqueConstraint(error)) {
        const existing = await this.competitions.findEventUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: normalizedKey } },
          include: eventInclude,
        }, tx);
        if (existing?.idempotencyHash === idempotencyHash) return this.toResponse(existing);
      }
      throw error;
    }
  }

  async update(args: {
    userId: string;
    eventId: string;
    input: UpdateCompetitionEventDto;
    actorType: CompetitionEventMutationActor;
    requestId?: string | null;
    tx?: CompetitionDb;
  }) {
    const { expectedVersion, ...patch } = args.input;
    const before = await this.findOwnedEvent(args.userId, args.eventId, args.tx);
    if (before.version !== expectedVersion) this.versionConflict(before);

    const merged: CompetitionEventWriteInput = {
      title: patch.title ?? before.title,
      sportType: patch.sportType ?? before.sportType,
      sportDefinitionCode:
        patch.sportDefinitionCode !== undefined
          ? patch.sportDefinitionCode
          : before.sportDefinitionCode,
      distanceMeters:
        patch.distanceMeters !== undefined ? patch.distanceMeters : before.distanceMeters,
      startDate: patch.startDate ?? competitionDateToYmd(before.startDate)!,
      endDate:
        patch.endDate !== undefined ? patch.endDate : competitionDateToYmd(before.endDate),
      startTimeMinute:
        patch.startTimeMinute !== undefined
          ? patch.startTimeMinute
          : before.startTimeMinute,
      timezone: patch.timezone !== undefined ? patch.timezone : before.timezone,
      importance: patch.importance ?? before.importance,
      goalType: patch.goalType ?? before.goalType,
      targetTimeSeconds:
        patch.targetTimeSeconds !== undefined
          ? patch.targetTimeSeconds
          : before.targetTimeSeconds,
      location: patch.location !== undefined ? patch.location : before.location,
      notes: patch.notes !== undefined ? patch.notes : before.notes,
    };
    if (merged.goalType !== CompetitionGoalType.TARGET_TIME) {
      merged.targetTimeSeconds = null;
    }
    const data = await this.normalizeWriteInput(merged);
    return this.updateWithRevision({
      userId: args.userId,
      eventId: args.eventId,
      expectedVersion,
      before,
      data,
      action: CompetitionRevisionAction.UPDATED,
      actorType: args.actorType,
      requestId: args.requestId,
      tx: args.tx,
    });
  }

  async cancelOrRestore(args: {
    userId: string;
    eventId: string;
    expectedVersion: number;
    restore: boolean;
    actorType: CompetitionEventMutationActor;
    requestId?: string | null;
    tx?: CompetitionDb;
  }) {
    const before = await this.findOwnedEvent(args.userId, args.eventId, args.tx);
    if (before.version !== args.expectedVersion) this.versionConflict(before);
    const expectedStatus = args.restore
      ? CompetitionStatus.CANCELLED
      : CompetitionStatus.PLANNED;
    if (before.status !== expectedStatus) {
      throw new ConflictException({
        code: 'COMPETITION_EVENT_STATE_CONFLICT',
        message: args.restore
          ? 'Only cancelled competition events can be restored'
          : 'Only planned competition events can be cancelled',
        data: { latest: this.toResponse(before) },
      });
    }
    return this.updateWithRevision({
      userId: args.userId,
      eventId: args.eventId,
      expectedVersion: args.expectedVersion,
      before,
      data: { status: args.restore ? CompetitionStatus.PLANNED : CompetitionStatus.CANCELLED },
      action: args.restore
        ? CompetitionRevisionAction.RESTORED
        : CompetitionRevisionAction.CANCELLED,
      actorType: args.actorType,
      requestId: args.requestId,
      tx: args.tx,
    });
  }

  async softDelete(args: {
    userId: string;
    eventId: string;
    expectedVersion: number;
    actorType: CompetitionEventMutationActor;
    requestId?: string | null;
    tx?: CompetitionDb;
  }) {
    const before = await this.findOwnedEvent(args.userId, args.eventId, args.tx);
    if (before.version !== args.expectedVersion) this.versionConflict(before);
    return this.updateWithRevision({
      userId: args.userId,
      eventId: args.eventId,
      expectedVersion: args.expectedVersion,
      before,
      data: { deletedAt: new Date() },
      action: CompetitionRevisionAction.DELETED,
      actorType: args.actorType,
      requestId: args.requestId,
      tx: args.tx,
    });
  }

  private async updateWithRevision(args: {
    userId: string;
    eventId: string;
    expectedVersion: number;
    before: CompetitionEventRow;
    data: Prisma.CompetitionEventUpdateManyMutationInput;
    action: CompetitionRevisionAction;
    actorType: CompetitionEventMutationActor;
    requestId?: string | null;
    tx?: CompetitionDb;
  }) {
    return this.competitions.runTransaction(async (tx) => {
      const updated = await this.competitions.updateEvents(
        {
          where: {
            id: args.eventId,
            userId: args.userId,
            version: args.expectedVersion,
            deletedAt: null,
          },
          data: { ...args.data, version: { increment: 1 } },
        },
        tx,
      );
      if (updated.count !== 1) {
        const latest = await this.competitions.findEvent(
          {
            where: { id: args.eventId, userId: args.userId, deletedAt: null },
            include: eventInclude,
          },
          tx,
        );
        if (!latest) this.notFound();
        this.versionConflict(latest);
      }
      const event = await this.competitions.findEventUniqueOrThrow(
        {
          where: { id: args.eventId },
          include: eventInclude,
        },
        tx,
      );
      await this.competitions.createRevision(
        {
          data: {
            eventId: event.id,
            userId: args.userId,
            eventVersion: event.version,
            action: args.action,
            actorType: args.actorType,
            requestId: normalizedString(args.requestId),
            before: this.toSnapshot(args.before),
            after: this.toSnapshot(event),
          },
        },
        tx,
      );
      return this.toResponse(event);
    }, args.tx);
  }

  private async normalizeWriteInput(input: CompetitionEventWriteInput) {
    const title = normalizedString(input.title);
    if (!title || title.length > 120) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_TITLE',
        message: 'title must contain between 1 and 120 characters',
      });
    }
    if (!Object.values(SportType).includes(input.sportType)) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_SPORT',
        message: 'sportType is invalid',
      });
    }
    if (!Object.values(CompetitionImportance).includes(input.importance)) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_IMPORTANCE',
        message: 'importance is invalid',
      });
    }
    if (!Object.values(CompetitionGoalType).includes(input.goalType)) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_TARGET',
        message: 'goalType is invalid',
      });
    }
    const distanceMeters = input.distanceMeters ?? null;
    if (
      distanceMeters != null &&
      (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || distanceMeters > 1_000_000)
    ) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_DISTANCE',
        message: 'distanceMeters must be greater than 0 and no more than 1000000',
      });
    }
    const startDate = parseCompetitionYmd(input.startDate, 'startDate');
    const endDate = input.endDate
      ? parseCompetitionYmd(input.endDate, 'endDate')
      : null;
    if (endDate && endDate < startDate) this.invalidDate('endDate cannot precede startDate');
    if (endDate && differenceInCompetitionDays(endDate, startDate) > MAX_EVENT_DURATION_DAYS) {
      this.invalidDate(`competition event cannot span more than ${MAX_EVENT_DURATION_DAYS} days`);
    }
    const timezone = normalizedString(input.timezone);
    const startTimeMinute = input.startTimeMinute ?? null;
    if (
      startTimeMinute != null &&
      (!Number.isInteger(startTimeMinute) || startTimeMinute < 0 || startTimeMinute > 1439)
    ) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_TIME',
        message: 'startTimeMinute must be an integer from 0 to 1439',
      });
    }
    if ((startTimeMinute == null) !== (timezone == null)) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_TIMEZONE',
        message: 'startTimeMinute and timezone must be provided or cleared together',
      });
    }
    assertIanaTimezone(timezone);
    const targetTimeSeconds = input.targetTimeSeconds ?? null;
    if (
      targetTimeSeconds != null &&
      (!Number.isInteger(targetTimeSeconds) ||
        targetTimeSeconds <= 0 ||
        targetTimeSeconds > 31_536_000)
    ) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_TARGET',
        message: 'targetTimeSeconds is outside the supported range',
      });
    }
    if (
      (input.goalType === CompetitionGoalType.TARGET_TIME && targetTimeSeconds == null) ||
      (input.goalType !== CompetitionGoalType.TARGET_TIME && targetTimeSeconds != null)
    ) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_TARGET',
        message: 'targetTimeSeconds is required only when goalType is TARGET_TIME',
      });
    }

    const sportDefinitionCode = normalizedString(input.sportDefinitionCode);
    if (sportDefinitionCode) {
      const sport = await this.sports.get(sportDefinitionCode);
      if (!sport?.active || sport.family !== input.sportType) {
        throw new BadRequestException({
          code: 'COMPETITION_EVENT_INVALID_SPORT_DEFINITION',
          message: 'sportDefinitionCode must be active and match sportType',
        });
      }
    }

    const location = normalizedString(input.location);
    const notes = normalizedString(input.notes);
    if (location && location.length > 240) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_LOCATION',
        message: 'location cannot exceed 240 characters',
      });
    }
    if (notes && notes.length > 4000) {
      throw new BadRequestException({
        code: 'COMPETITION_EVENT_INVALID_NOTES',
        message: 'notes cannot exceed 4000 characters',
      });
    }

    return {
      title,
      sportType: input.sportType,
      sportDefinitionCode,
      distanceMeters,
      startDate,
      endDate,
      startTimeMinute,
      timezone,
      importance: input.importance,
      goalType: input.goalType,
      targetTimeSeconds,
      location,
      notes,
    };
  }

  private async findOwnedEvent(
    userId: string,
    eventId: string,
    tx?: CompetitionDb,
  ) {
    const event = await this.competitions.findEvent({
      where: { id: eventId, userId, deletedAt: null },
      include: eventInclude,
    }, tx);
    if (!event) this.notFound();
    return event;
  }

  private toResponse(event: CompetitionEventRow) {
    return {
      id: event.id,
      title: event.title,
      sportType: event.sportType,
      sportDefinitionCode: event.sportDefinitionCode,
      sportDefinition: event.sportDefinition,
      distanceMeters: event.distanceMeters,
      startDate: competitionDateToYmd(event.startDate),
      endDate: competitionDateToYmd(event.endDate),
      startTimeMinute: event.startTimeMinute,
      timezone: event.timezone,
      importance: event.importance,
      goalType: event.goalType,
      targetTimeSeconds: event.targetTimeSeconds,
      location: event.location,
      notes: event.notes,
      status: event.status,
      source: event.source,
      version: event.version,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }

  private toSnapshot(event: CompetitionEventRow): Prisma.InputJsonObject {
    return this.toResponse(event) as unknown as Prisma.InputJsonObject;
  }

  private versionConflict(event: CompetitionEventRow): never {
    throw new ConflictException({
      code: 'COMPETITION_EVENT_VERSION_CONFLICT',
      message: 'Competition event was changed by another request',
      data: { latest: this.toResponse(event) },
    });
  }

  private invalidDate(message: string): never {
    throw new BadRequestException({ code: 'COMPETITION_EVENT_INVALID_DATE', message });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'COMPETITION_EVENT_NOT_FOUND',
      message: 'Competition event was not found',
    });
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
