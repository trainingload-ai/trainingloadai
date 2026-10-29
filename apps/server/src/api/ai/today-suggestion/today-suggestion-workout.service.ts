import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CoachActionRiskTier, CoachActionType, Prisma } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import type {
  TodaySuggestionIntent,
  TodaySuggestionV2,
  TodaySuggestionWorkoutExecutionResult,
} from '@shared/ai-today-suggestion-contract';
import { isTodaySuggestionWorkout } from '@shared/ai-today-suggestion-contract';
import { PrismaService } from '@/prisma/prisma.service';
import { PlanWorkoutCommandService } from '@/api/plan/application/plan-workout-command.service';
import { PlanWorkoutRepository } from '@/api/plan/persistence/plan-workout.repository';
import { CoachActionService } from '../core/coach-action.service';
import { TodaySuggestionConstraintProjector } from './today-suggestion-constraint.projector';
import { todaySuggestionProposalToken } from './today-suggestion-delivery-policy';

function parseV2(value: unknown): TodaySuggestionV2 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return row.version === 2 && typeof row.suggestionId === 'string'
    ? (row as unknown as TodaySuggestionV2)
    : null;
}

function createIntent(result: TodaySuggestionV2) {
  return [result.primaryIntent, ...result.secondaryIntents].find(
    (
      intent,
    ): intent is Extract<
      TodaySuggestionIntent,
      { type: 'CREATE_TODAY_WORKOUT' }
    > => intent?.type === 'CREATE_TODAY_WORKOUT',
  );
}

function constantEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function persistedTimezone(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const timezone = (value as Record<string, unknown>).timezone;
  return typeof timezone === 'string' && timezone.trim()
    ? timezone.trim()
    : undefined;
}

@Injectable()
export class TodaySuggestionWorkoutService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workouts: PlanWorkoutCommandService,
    private readonly planWorkouts: PlanWorkoutRepository,
    private readonly actions: CoachActionService,
    private readonly projector: TodaySuggestionConstraintProjector,
  ) {}

  onModuleInit() {
    this.actions.registerUndoHandler(
      CoachActionType.INDEPENDENT_WORKOUT_CREATE,
      async ({ prisma, userId, reverseData }) => {
        const snapshot =
          reverseData &&
          typeof reverseData === 'object' &&
          !Array.isArray(reverseData)
            ? (reverseData as Record<string, unknown>)
            : {};
        const workoutId = String(snapshot.workoutId ?? '');
        const generationToken = String(snapshot.generationToken ?? '');
        const revision = Number(snapshot.revision);
        const updatedAt = String(snapshot.updatedAt ?? '');
        const workout = await this.planWorkouts.findFirst(
          {
            where: { id: workoutId, userId, planId: null },
            select: {
              id: true,
              status: true,
              revision: true,
              createdAt: true,
              updatedAt: true,
              _count: { select: { links: true, externalMappings: true } },
            },
          },
          prisma,
        );
        if (!workout) throw new Error('TODAY_WORKOUT_NOT_FOUND');
        if (
          workout.status !== 'PLANNED' ||
          workout.revision !== revision ||
          workout.updatedAt.toISOString() !== updatedAt ||
          workout._count.links > 0 ||
          workout._count.externalMappings > 0
        ) {
          throw new Error('TODAY_WORKOUT_NO_LONGER_REVERSIBLE');
        }
        await this.planWorkouts.delete({ where: { id: workout.id } }, prisma);
        await prisma.todaySuggestionEngagementState.updateMany({
          where: { userId, generationToken, workoutId: workout.id },
          data: {
            workoutId: null,
            workoutActionId: null,
            resolvedAt: null,
            resolution: null,
            selectedIntent: null,
          },
        });
      },
    );
  }

  async create(args: {
    userId: string;
    generationToken: string;
  }): Promise<TodaySuggestionWorkoutExecutionResult> {
    const suggestion = await this.prisma.aiTodaySuggestion.findFirst({
      where: {
        userId: args.userId,
        generationToken: args.generationToken,
        validUntil: { gt: new Date() },
      },
    });
    if (!suggestion) throw new NotFoundException('TODAY_SUGGESTION_NOT_FOUND');
    const result = parseV2(suggestion.structuredResult);
    const intent = result ? createIntent(result) : null;
    if (!result || !intent) {
      throw new UnprocessableEntityException(
        'TODAY_SUGGESTION_WORKOUT_NOT_OFFERED',
      );
    }
    if (!isTodaySuggestionWorkout(intent.preview)) {
      throw new UnprocessableEntityException(
        'TODAY_SUGGESTION_WORKOUT_NOT_OFFERED',
      );
    }
    const projection = await this.projector.project({
      userId: args.userId,
      locale: suggestion.locale,
      timezone: persistedTimezone(suggestion.keyContext),
      allowAi: true,
    });
    if (
      projection.date !== suggestion.date ||
      projection.factHash !== suggestion.signatureHash ||
      projection.constraintHash !== suggestion.constraintHash ||
      projection.highConcern ||
      projection.pendingInquiry
    ) {
      throw new ConflictException({
        code: 'TODAY_SUGGESTION_FACTS_CHANGED',
        message: 'TODAY_SUGGESTION_FACTS_CHANGED',
      });
    }
    if (projection.newWorkoutWindowOpen === false) {
      throw new ConflictException({
        code: 'TODAY_SUGGESTION_TRAINING_WINDOW_CLOSED',
        message: 'TODAY_SUGGESTION_TRAINING_WINDOW_CLOSED',
      });
    }
    const expectedToken = todaySuggestionProposalToken({
      generationToken: args.generationToken,
      constraintHash: projection.constraintHash,
      proposal: intent.preview,
    });
    if (!constantEqual(expectedToken, intent.proposalToken)) {
      throw new ConflictException({
        code: 'TODAY_SUGGESTION_PROPOSAL_INVALID',
        message: 'TODAY_SUGGESTION_PROPOSAL_INVALID',
      });
    }
    if (
      projection.todayWorkouts.some((workout) =>
        ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
      )
    ) {
      throw new ConflictException({
        code: 'TODAY_WORKOUT_ALREADY_EXISTS',
        message: 'TODAY_WORKOUT_ALREADY_EXISTS',
      });
    }
    const dto = {
      scheduledDate: suggestion.date,
      sportType: intent.preview.sportType,
      sportDefinitionCode: intent.preview.sportDefinitionCode,
      name: intent.preview.name,
      notes: intent.preview.notes,
      definition: {
        kind: intent.preview.structureKind,
        version: intent.preview.dslVersion,
        source: 'STRUCTURE' as const,
        structure: intent.preview.structure,
      },
    };
    const action = await this.actions.run<{
      workoutId: string;
      scheduledDate: string;
      planId: null;
    }>({
      userId: args.userId,
      type: CoachActionType.INDEPENDENT_WORKOUT_CREATE,
      riskTier: CoachActionRiskTier.LOW,
      replay: async (tx) => {
        const state = await tx.todaySuggestionEngagementState.findUnique({
          where: { userId: args.userId },
        });
        if (
          state?.generationToken !== args.generationToken ||
          !state.workoutId ||
          !state.workoutActionId
        ) {
          return null;
        }
        const [workout, priorAction] = await Promise.all([
          this.planWorkouts.findFirst(
            {
              where: { id: state.workoutId, userId: args.userId, planId: null },
            },
            tx,
          ),
          tx.coachAction.findFirst({
            where: {
              id: state.workoutActionId,
              userId: args.userId,
              undoneAt: null,
            },
          }),
        ]);
        if (!workout || !priorAction) return null;
        return {
          actionId: priorAction.id,
          type: priorAction.type,
          riskTier: priorAction.riskTier,
          summary: priorAction.summary,
          undoUntil: priorAction.undoUntil,
          createdAt: priorAction.createdAt,
          payloadForUi: {
            workoutId: workout.id,
            scheduledDate: suggestion.date,
            planId: null,
          },
        };
      },
      exec: async (tx) => {
        const created =
          await this.workouts.createIndependentWorkoutInTransaction(
            args.userId,
            dto,
            tx,
          );
        const row = await this.planWorkouts.findUnique(
          {
            where: { id: created.workout.id },
            select: { id: true, updatedAt: true, revision: true },
          },
          tx,
        );
        if (!row) throw new Error('TODAY_WORKOUT_CREATE_NOT_PERSISTED');
        return {
          forwardData: {
            generationToken: args.generationToken,
            scheduledDate: suggestion.date,
            proposal: intent.preview,
          } as Prisma.InputJsonValue,
          reverseData: {
            generationToken: args.generationToken,
            workoutId: row.id,
            revision: row.revision,
            updatedAt: row.updatedAt.toISOString(),
          },
          summary: `Created today's independent workout: ${intent.preview.name}`,
          payloadForUi: {
            workoutId: row.id,
            scheduledDate: suggestion.date,
            planId: null,
          },
        };
      },
      finalize: async (tx, executed) => {
        await tx.todaySuggestionEngagementState.upsert({
          where: { userId: args.userId },
          create: {
            userId: args.userId,
            generationToken: args.generationToken,
            continuityHash: suggestion.continuityHash,
            suggestionDate: suggestion.date,
            workoutId: executed.payloadForUi.workoutId,
            workoutActionId: executed.actionId,
            selectedIntent: 'CREATE_TODAY_WORKOUT',
            resolvedAt: new Date(),
            resolution: 'INTENT:CREATE_TODAY_WORKOUT',
          },
          update: {
            workoutId: executed.payloadForUi.workoutId,
            workoutActionId: executed.actionId,
            selectedIntent: 'CREATE_TODAY_WORKOUT',
            resolvedAt: new Date(),
            resolution: 'INTENT:CREATE_TODAY_WORKOUT',
          },
        });
      },
    });
    return {
      workoutId: action.payloadForUi.workoutId,
      actionId: action.actionId,
      undoUntil: action.undoUntil?.toISOString() ?? null,
      intent: {
        type: 'OPEN_TODAY_WORKOUT',
        label: intent.label,
        workoutId: action.payloadForUi.workoutId,
        scheduledDate: suggestion.date,
        planId: null,
      },
    };
  }
}
