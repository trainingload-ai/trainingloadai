import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ActivityProcessingStatus,
  ActivityStatus,
  Prisma,
  SportType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { WorkoutPersistenceService } from '@/api/plan/workout-persistence.service';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { summarizeStrengthWorkout } from '@/api/workout/strength/strength-dsl';
import { generateRandomDights } from '@/utils';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitPmcInvalidate } from '@/training-load/events/pmc.events';
import { isActivityWithinGlobalRefreshWindow } from '@/utils/activity-global-refresh-window';
import type { StrengthLoadV1 } from '../../../../../packages/shared/strength-workout-ir';
import {
  strengthLoadFromColumns,
  strengthLoadToColumns,
} from '@/api/workout/strength/strength-load-columns';
import type { StrengthWorkoutIrV1 } from '../../../../../packages/shared/strength-workout-ir';
import type {
  ActivityStrengthActualSummary,
  ActivityStrengthExerciseV1,
  ActivityStrengthResponse,
  StrengthActualSetSource,
} from '../../../../../packages/shared/strength-activity';

function publicStrengthSetSource(source: string): StrengthActualSetSource {
  return source === 'APP' || source === 'FIT' || source === 'MANUAL'
    ? source
    : 'EXTERNAL';
}
import type {
  AddActivityStrengthExerciseDto,
  CompleteActivityStrengthSetDto,
  FinishStrengthActivityDto,
  ReplaceActivityStrengthDto,
  StartStrengthActivityDto,
  StrengthActualLoadDto,
} from './dto/strength-activity.dto';

/**
 * 力量训练会话：开始、记组、改动作、结束。
 *
 * 不走 FIT/GPX 导入。数据写在 Activity + ActivityStrengthExercise + ActivityStrengthSet。
 * 可从进行中的力量课次开练（复制预定组），也可自由开练。
 * 未结束（PADDING）才能改；结束后标 READY，若挂了计划则课次标 DONE。
 */
@Injectable()
export class StrengthActivityService {
  private readonly logger = new Logger(StrengthActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workoutPersistence: WorkoutPersistenceService,
    private readonly planQuery: PlanQueryService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * 开始力量会话。planId 与 workoutId 必须成对出现：都有走计划练，都没有走自由练。
   */
  async start(userId: string, input: StartStrengthActivityDto) {
    const planId = input.planId?.trim();
    const workoutId = input.workoutId?.trim();
    if (Boolean(planId) !== Boolean(workoutId)) {
      throw new UnprocessableEntityException(
        'planId and workoutId must be provided together',
      );
    }
    if (!planId || !workoutId) {
      return this.startFree(userId, input);
    }
    return this.startPlanned(userId, { ...input, planId, workoutId });
  }

  /**
   * 从 ACTIVE 计划里的 STRENGTH 课次开练。
   * 已有未解除的 PRIMARY 链接则直接返回，不重复建活动。
   * 新建时复制预定动作/组，课次标 IN_PROGRESS。
   */
  async startPlanned(
    userId: string,
    input: StartStrengthActivityDto & { planId: string; workoutId: string },
  ) {
    const workout = await this.planQuery.findWorkout({
      where: {
        id: input.workoutId,
        planId: input.planId,
        userId,
      },
      include: {
        plan: { select: { id: true, status: true } },
        strengthExercises: {
          orderBy: { orderIndex: 'asc' },
          include: { setGroups: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!workout || workout.structureKind !== 'STRENGTH') {
      this.throwWorkoutNotFound();
    }
    if (workout.plan?.status !== 'ACTIVE') {
      throw new UnprocessableEntityException(
        'Only a workout in an active plan can be started',
      );
    }
    if (workout.status !== 'PLANNED' && workout.status !== 'IN_PROGRESS') {
      throw new UnprocessableEntityException(
        'This strength workout cannot be started',
      );
    }

    const existingLink = await this.planQuery.findLink({
      where: {
        planWorkoutId: workout.id,
        role: 'PRIMARY',
        unlinkedAt: null,
      },
      include: { activity: { select: { id: true, hashId: true } } },
    });
    if (existingLink?.activity) {
      return {
        activityId: existingLink.activity.id,
        activityHashId: existingLink.activity.hashId,
        workoutId: workout.id,
        created: false,
      };
    }

    const startedAt = this.parseSessionDate(input.startedAt) ?? new Date();
    const activity = await this.prisma.$transaction(async (tx) => {
      const created = await tx.activity.create({
        data: {
          hashId: generateRandomDights(),
          userId,
          activityName: workout.name?.trim() || 'Strength Training',
          description: workout.notes?.trim() || null,
          sportType: SportType.UNKNOWN,
          sportDefinitionCode: 'STRENGTH_TRAINING',
          timestamp: startedAt,
          startTime: startedAt,
          timezone: input.timezone?.trim() || null,
          status: ActivityStatus.PADDING,
          processingStatus: ActivityProcessingStatus.MATERIALIZED,
          processingUpdatedAt: startedAt,
        },
      });

      await this.planQuery.createLink(
        {
          data: {
            planId: input.planId,
            planWorkoutId: workout.id,
            activityId: created.id,
            source: 'AUTO',
            role: 'PRIMARY',
          },
        },
        tx,
      );
      await this.planQuery.updateWorkout(
        {
          where: { id: workout.id },
          data: { status: 'IN_PROGRESS', completedAt: null, skippedAt: null },
        },
        tx,
      );

      for (const [
        exerciseIndex,
        exercise,
      ] of workout.strengthExercises.entries()) {
        const actualExercise = await tx.activityStrengthExercise.create({
          data: {
            activityId: created.id,
            orderIndex: exerciseIndex,
            exerciseCode: exercise.exerciseCode ?? null,
            name: exercise.name,
            equipmentCode: exercise.equipmentCode ?? null,
            notes: exercise.notes ?? null,
          },
        });
        let setIndex = 0;
        for (const group of exercise.setGroups) {
          for (let index = 0; index < Number(group.setCount); index += 1) {
            await tx.activityStrengthSet.create({
              data: {
                exerciseId: actualExercise.id,
                plannedSetGroupId: group.id,
                setIndex,
                setType: group.setType,
                ...strengthLoadToColumns(
                  strengthLoadFromColumns(group, 'ABSOLUTE'),
                ),
                source: 'APP',
              } satisfies Prisma.ActivityStrengthSetUncheckedCreateInput,
            });
            setIndex += 1;
          }
        }
      }
      return created;
    });

    return {
      activityId: activity.id,
      activityHashId: activity.hashId,
      workoutId: workout.id,
      created: true,
    };
  }

  /**
   * 自由力量练：建空的 STRENGTH_TRAINING 活动，动作之后再加。
   */
  private async startFree(userId: string, input: StartStrengthActivityDto) {
    const startedAt = this.parseSessionDate(input.startedAt) ?? new Date();
    const activity = await this.prisma.activity.create({
      data: {
        hashId: generateRandomDights(),
        userId,
        activityName: 'Strength Training',
        sportType: SportType.UNKNOWN,
        sportDefinitionCode: 'STRENGTH_TRAINING',
        timestamp: startedAt,
        startTime: startedAt,
        timezone: input.timezone?.trim() || null,
        status: ActivityStatus.PADDING,
        processingStatus: ActivityProcessingStatus.MATERIALIZED,
        processingUpdatedAt: startedAt,
      },
    });
    return {
      activityId: activity.id,
      activityHashId: activity.hashId,
      workoutId: null,
      created: true,
    };
  }

  /**
   * 结束会话：活动标 FINISHED + READY。
   * 若挂了计划课次，课次标 DONE。有 session RPE 时按窗口刷新 PMC。
   */
  async finish(
    activityHashId: string,
    userId: string,
    input: FinishStrengthActivityDto,
  ) {
    const activity = await this.prisma.activity.findFirst({
      where: { hashId: activityHashId, userId, state: 1 },
      include: {
        planWorkoutLinks: {
          where: { role: 'PRIMARY', unlinkedAt: null },
          include: { planWorkout: true },
        },
      },
    });
    const link = activity?.planWorkoutLinks?.[0];
    const strengthActivity =
      activity?.sportDefinitionCode === 'STRENGTH_TRAINING' ||
      link?.planWorkout?.structureKind === 'STRENGTH';
    if (!activity || !strengthActivity) {
      this.throwNotFound();
    }

    const finishedAt = new Date();
    const inferredDuration = activity.startTime
      ? Math.max(
          0,
          Math.round(
            (finishedAt.getTime() - new Date(activity.startTime).getTime()) /
              1000,
          ),
        )
      : 0;
    const durationSeconds = input.durationSeconds ?? inferredDuration;
    await this.prisma.$transaction(async (tx) => {
      await tx.activity.update({
        where: { id: activity.id },
        data: {
          endTime: finishedAt,
          timerTime: durationSeconds,
          elapsedTime: durationSeconds,
          ...(input.sessionRpe != null ? { sessionRpe: input.sessionRpe } : {}),
          status: ActivityStatus.FINISHED,
          processingStatus: ActivityProcessingStatus.READY,
          processingUpdatedAt: finishedAt,
          readyAt: finishedAt,
        },
      });
      if (link) {
        await this.planQuery.updateWorkout(
          {
            where: { id: link.planWorkoutId },
            data: { status: 'DONE', completedAt: finishedAt, skippedAt: null },
          },
          tx,
        );
        await this.planQuery.updateLink(
          {
            where: { id: link.id },
            data: { autoMarkedWorkoutDone: true },
          },
          tx,
        );
      }
    });
    if (
      input.sessionRpe != null &&
      isActivityWithinGlobalRefreshWindow(activity.startTime)
    ) {
      try {
        await emitPmcInvalidate(this.events, userId);
      } catch (error) {
        this.logger.warn(
          `Failed to recalculate PMC after strength activity ${activityHashId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      activityId: activity.id,
      activityHashId: activity.hashId,
      workoutId: link?.planWorkoutId ?? null,
      durationSeconds,
      finishedAt: finishedAt.toISOString(),
    };
  }

  /**
   * 读取实际完成情况；有计划链接时附带预定结构。
   */
  async get(
    activityHashId: string,
    userId: string,
  ): Promise<ActivityStrengthResponse> {
    const activity = await this.loadOwnedActivity(activityHashId, userId);
    const exercises = this.hydrateExercises(activity.strengthExercises);
    const planned = await this.loadPlanned(activity.id);
    return {
      activityId: activity.id,
      activityHashId: activity.hashId,
      exercises,
      summary: this.summarize(exercises),
      planned,
    };
  }

  /**
   * 覆盖写入整份力量记录。未结束的会话才能改（App 编辑）。
   */
  async replace(
    activityHashId: string,
    userId: string,
    input: ReplaceActivityStrengthDto,
  ): Promise<ActivityStrengthResponse> {
    return this.replaceInternal(activityHashId, userId, input, false);
  }

  /**
   * 导入/同步覆盖写入。已结束的活动也允许由外部适配器写入。
   */
  async replaceImported(
    activityHashId: string,
    userId: string,
    input: ReplaceActivityStrengthDto,
  ): Promise<ActivityStrengthResponse> {
    return this.replaceInternal(activityHashId, userId, input, true);
  }

  /**
   * 删除后整表重建动作和组。allowCompleted 为 true 时跳过「未结束才能改」。
   */
  private async replaceInternal(
    activityHashId: string,
    userId: string,
    input: ReplaceActivityStrengthDto,
    allowCompleted: boolean,
  ): Promise<ActivityStrengthResponse> {
    const activity = await this.loadOwnedActivity(activityHashId, userId);
    if (!allowCompleted) this.assertEditable(activity);
    const planned = await this.loadPlanned(activity.id);
    const exercises = this.attachPlannedSetGroupIds(
      input.exercises ?? [],
      planned?.structure,
    );
    this.validateExercises(exercises);
    await this.assertPlannedSetGroupsOwned(
      userId,
      exercises.flatMap((exercise) =>
        exercise.sets
          .map((set) => set.plannedSetGroupId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.activityStrengthExercise.deleteMany({
        where: { activityId: activity.id },
      });
      for (const [exerciseIndex, exercise] of exercises.entries()) {
        const created = await tx.activityStrengthExercise.create({
          data: {
            activityId: activity.id,
            orderIndex: exerciseIndex,
            exerciseCode: exercise.exerciseCode?.trim() || null,
            name: exercise.name.trim(),
            equipmentCode: exercise.equipmentCode?.trim() || null,
            notes: exercise.notes?.trim() || null,
          },
        });
        for (const set of exercise.sets) {
          await tx.activityStrengthSet.create({
            data: {
              exerciseId: created.id,
              plannedSetGroupId: set.plannedSetGroupId ?? null,
              setIndex: set.setIndex,
              setType: set.setType,
              completedReps: set.completedReps ?? null,
              completedDurationSeconds: set.completedDurationSeconds ?? null,
              ...strengthLoadToColumns(set.load as StrengthLoadV1),
              actualRpe: set.actualRpe ?? null,
              actualRir: set.actualRir ?? null,
              completedAt: this.parseCompletedAt(set.completedAt),
              source: set.source ?? 'MANUAL',
            } satisfies Prisma.ActivityStrengthSetUncheckedCreateInput,
          });
        }
      }
    });
    return this.get(activityHashId, userId);
  }

  /**
   * 记一组：次数、时长、负荷、RPE/RIR。RPE 与 RIR 不能同时有。
   * completed=false 会清掉完成时间。
   */
  async completeSet(
    activityHashId: string,
    setId: string,
    userId: string,
    input: CompleteActivityStrengthSetDto,
  ): Promise<ActivityStrengthResponse> {
    const row = await this.prisma.activityStrengthSet.findUnique({
      where: { id: setId },
      include: { exercise: { include: { activity: true } } },
    });
    if (
      !row ||
      row.exercise?.activity?.hashId !== activityHashId ||
      row.exercise?.activity?.userId !== userId
    ) {
      this.throwNotFound();
    }
    this.assertEditable(row.exercise.activity);
    if (input.actualRpe != null && input.actualRir != null) {
      throw new UnprocessableEntityException(
        'A set cannot have both actual RPE and actual RIR',
      );
    }
    if (input.load) this.validateLoad(input.load, 'load');

    await this.prisma.activityStrengthSet.update({
      where: { id: setId },
      data: {
        ...(input.completedReps !== undefined
          ? { completedReps: input.completedReps }
          : {}),
        ...(input.completedDurationSeconds !== undefined
          ? { completedDurationSeconds: input.completedDurationSeconds }
          : {}),
        ...(input.load
          ? strengthLoadToColumns(input.load as StrengthLoadV1)
          : {}),
        ...(input.actualRpe !== undefined
          ? { actualRpe: input.actualRpe, actualRir: null }
          : {}),
        ...(input.actualRir !== undefined
          ? { actualRir: input.actualRir, actualRpe: null }
          : {}),
        ...(input.source ? { source: input.source } : {}),
        completedAt: input.completed === false ? null : new Date(),
      } satisfies Prisma.ActivityStrengthSetUncheckedUpdateInput,
    });
    return this.get(activityHashId, userId);
  }

  /**
   * 在会话末尾追加一个动作及其组。
   */
  async addExercise(
    activityHashId: string,
    userId: string,
    input: AddActivityStrengthExerciseDto,
  ): Promise<ActivityStrengthResponse> {
    const activity = await this.loadOwnedActivity(activityHashId, userId);
    this.assertEditable(activity);
    this.validateExercises([input]);

    await this.prisma.$transaction(async (tx) => {
      const latest = await tx.activityStrengthExercise.findFirst({
        where: { activityId: activity.id },
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true },
      });
      const created = await tx.activityStrengthExercise.create({
        data: {
          activityId: activity.id,
          orderIndex: Number(latest?.orderIndex ?? -1) + 1,
          exerciseCode: input.exerciseCode?.trim() || null,
          name: input.name.trim(),
          equipmentCode: input.equipmentCode?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });
      for (const set of input.sets) {
        await tx.activityStrengthSet.create({
          data: {
            exerciseId: created.id,
            plannedSetGroupId: null,
            setIndex: set.setIndex,
            setType: set.setType,
            completedReps: set.completedReps ?? null,
            completedDurationSeconds: set.completedDurationSeconds ?? null,
            ...strengthLoadToColumns(set.load as StrengthLoadV1),
            actualRpe: set.actualRpe ?? null,
            actualRir: set.actualRir ?? null,
            completedAt: this.parseCompletedAt(set.completedAt),
            source: set.source ?? 'APP',
          } satisfies Prisma.ActivityStrengthSetUncheckedCreateInput,
        });
      }
    });
    return this.get(activityHashId, userId);
  }

  /**
   * 删除一个动作（级联删组）。
   */
  async removeExercise(
    activityHashId: string,
    exerciseId: string,
    userId: string,
  ): Promise<ActivityStrengthResponse> {
    const activity = await this.loadOwnedActivity(activityHashId, userId);
    this.assertEditable(activity);
    const exercise = activity.strengthExercises.find(
      (candidate: { id: string }) => candidate.id === exerciseId,
    );
    if (!exercise) this.throwNotFound();

    await this.prisma.activityStrengthExercise.delete({
      where: { id: exerciseId },
    });
    return this.get(activityHashId, userId);
  }

  /**
   * 加载当前用户的活动及力量动作/组。
   */
  private async loadOwnedActivity(activityHashId: string, userId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { hashId: activityHashId, userId, state: 1 },
      include: {
        strengthExercises: {
          orderBy: { orderIndex: 'asc' },
          include: { sets: { orderBy: { setIndex: 'asc' } } },
        },
      },
    });
    if (!activity) this.throwNotFound();
    return activity;
  }

  /**
   * 未结束（PADDING）才能改会话内容。
   */
  private assertEditable(activity: { status?: ActivityStatus | null }) {
    if (activity.status !== ActivityStatus.PADDING) {
      throw new UnprocessableEntityException(
        'A completed strength activity cannot be edited',
      );
    }
  }

  /**
   * 若活动挂了 STRENGTH 计划课次，返回预定结构与摘要。
   */
  private async loadPlanned(activityId: number) {
    const link = await this.planQuery.findLink({
      where: {
        activityId,
        role: 'PRIMARY',
        unlinkedAt: null,
        planWorkout: { structureKind: 'STRENGTH' },
      },
      orderBy: { linkedAt: 'desc' },
      include: {
        planWorkout: {
          include: {
            strengthExercises: {
              orderBy: { orderIndex: 'asc' },
              include: { setGroups: { orderBy: { orderIndex: 'asc' } } },
            },
          },
        },
      },
    });
    if (!link?.planWorkout) return null;
    const structure = this.workoutPersistence.buildStrengthStructure(
      link.planWorkout.strengthExercises,
      {
        durationSeconds: link.planWorkout.plannedDurationSeconds,
        plannedSessionRpe: link.planWorkout.plannedSessionRpe,
      },
    );
    return {
      workoutId: link.planWorkout.id,
      structure,
      summary: summarizeStrengthWorkout(structure),
    };
  }

  /**
   * 把库里的动作/组行转成 API 结构。
   */
  private hydrateExercises(
    rows: Prisma.ActivityStrengthExerciseGetPayload<{
      include: { sets: true };
    }>[],
  ): ActivityStrengthExerciseV1[] {
    return (Array.isArray(rows) ? rows : []).map((exercise) => ({
      id: exercise.id,
      ...(exercise.exerciseCode
        ? { exerciseCode: String(exercise.exerciseCode) }
        : {}),
      name: String(exercise.name),
      ...(exercise.equipmentCode
        ? { equipmentCode: String(exercise.equipmentCode) }
        : {}),
      ...(exercise.notes ? { notes: String(exercise.notes) } : {}),
      sets: (exercise.sets ?? []).map((set) => ({
        id: set.id,
        ...(set.plannedSetGroupId
          ? { plannedSetGroupId: String(set.plannedSetGroupId) }
          : {}),
        setIndex: Number(set.setIndex),
        setType: set.setType,
        ...(set.completedReps != null
          ? { completedReps: Number(set.completedReps) }
          : {}),
        ...(set.completedDurationSeconds != null
          ? {
              completedDurationSeconds: Number(set.completedDurationSeconds),
            }
          : {}),
        load: strengthLoadFromColumns(set, 'ABSOLUTE'),
        ...(set.actualRpe != null ? { actualRpe: Number(set.actualRpe) } : {}),
        ...(set.actualRir != null ? { actualRir: Number(set.actualRir) } : {}),
        completedAt:
          set.completedAt instanceof Date
            ? set.completedAt.toISOString()
            : (set.completedAt ?? null),
        source: publicStrengthSetSource(set.source),
      })),
    }));
  }

  /**
   * 汇总完成组数、次数、计时秒和重量容量。
   */
  private summarize(
    exercises: ActivityStrengthExerciseV1[],
  ): ActivityStrengthActualSummary {
    let setCount = 0;
    let completedSetCount = 0;
    let workingSetCount = 0;
    let completedReps = 0;
    let timedSetSeconds = 0;
    let volumeLoadKg = 0;
    let volumeLoadLb = 0;
    for (const exercise of exercises) {
      for (const set of exercise.sets) {
        setCount += 1;
        if (!set.completedAt) continue;
        completedSetCount += 1;
        if (set.setType !== 'WORK') continue;
        workingSetCount += 1;
        const reps = Math.max(0, Number(set.completedReps ?? 0));
        completedReps += reps;
        timedSetSeconds += Math.max(
          0,
          Number(set.completedDurationSeconds ?? 0),
        );
        if (
          set.load.kind === 'ABSOLUTE' ||
          set.load.kind === 'BODYWEIGHT_OFFSET'
        ) {
          const volume = Math.max(0, set.load.value) * reps;
          if (set.load.unit === 'KG') volumeLoadKg += volume;
          if (set.load.unit === 'LB') volumeLoadLb += volume;
        }
      }
    }
    return {
      kind: 'STRENGTH_ACTUAL',
      exerciseCount: exercises.length,
      setCount,
      completedSetCount,
      workingSetCount,
      completedReps,
      timedSetSeconds,
      volumeLoadKg: this.round2(volumeLoadKg),
      volumeLoadLb: this.round2(volumeLoadLb),
    };
  }

  /**
   * 校验动作名、组序号不重复、组数上限，以及负荷/RPE。
   */
  private validateExercises(
    exercises: ReplaceActivityStrengthDto['exercises'],
  ) {
    let totalSets = 0;
    for (const [exerciseIndex, exercise] of exercises.entries()) {
      if (!exercise.name?.trim()) {
        throw new UnprocessableEntityException(
          `exercises[${exerciseIndex}].name cannot be empty`,
        );
      }
      const indexes = new Set<number>();
      for (const [setIndex, set] of exercise.sets.entries()) {
        totalSets += 1;
        if (totalSets > 1000) {
          throw new UnprocessableEntityException('Too many strength sets');
        }
        if (indexes.has(set.setIndex)) {
          throw new UnprocessableEntityException(
            `Duplicate setIndex in exercise ${exerciseIndex}`,
          );
        }
        indexes.add(set.setIndex);
        if (set.actualRpe != null && set.actualRir != null) {
          throw new UnprocessableEntityException(
            `exercises[${exerciseIndex}].sets[${setIndex}] cannot contain both actualRpe and actualRir`,
          );
        }
        this.validateLoad(
          set.load,
          `exercises[${exerciseIndex}].sets[${setIndex}].load`,
        );
      }
    }
  }

  /**
   * 覆盖写入时，按动作编码/名称把实际组对上预定 setGroup。
   */
  private attachPlannedSetGroupIds(
    exercises: ReplaceActivityStrengthDto['exercises'],
    planned?: StrengthWorkoutIrV1,
  ): ReplaceActivityStrengthDto['exercises'] {
    if (!planned) return exercises;
    return exercises.map((exercise, exerciseIndex) => {
      const normalizedName = exercise.name.trim().toLowerCase();
      const plannedExercise =
        (exercise.exerciseCode
          ? planned.exercises.find(
              (candidate) => candidate.exerciseCode === exercise.exerciseCode,
            )
          : undefined) ??
        planned.exercises.find(
          (candidate) => candidate.name.trim().toLowerCase() === normalizedName,
        ) ??
        planned.exercises[exerciseIndex];
      if (!plannedExercise) return exercise;
      const expandedGroups = plannedExercise.setGroups.flatMap((group) =>
        Array.from({ length: group.setCount }, () => group),
      );
      const orderedSets = [...exercise.sets].sort(
        (left, right) => left.setIndex - right.setIndex,
      );
      const idBySetIndex = new Map<number, string>();
      let groupCursor = 0;
      orderedSets.forEach((set) => {
        const matchingOffset = expandedGroups
          .slice(groupCursor)
          .findIndex((group) => group.setType === set.setType);
        if (matchingOffset < 0) return;
        const groupIndex = groupCursor + matchingOffset;
        const group = expandedGroups[groupIndex];
        groupCursor = groupIndex + 1;
        if (!set.plannedSetGroupId && group?.id) {
          idBySetIndex.set(set.setIndex, group.id);
        }
      });
      return {
        ...exercise,
        sets: exercise.sets.map((set) => ({
          ...set,
          ...(set.plannedSetGroupId
            ? {}
            : idBySetIndex.has(set.setIndex)
              ? { plannedSetGroupId: idBySetIndex.get(set.setIndex) }
              : {}),
        })),
      };
    });
  }

  /**
   * 校验负荷：OPEN/BODYWEIGHT 无数值；%1RM、绝对重量、配重有各自约束。
   */
  private validateLoad(load: StrengthActualLoadDto, path: string) {
    if (!load || !load.kind) {
      throw new UnprocessableEntityException(`${path} is required`);
    }
    if (load.kind === 'OPEN' || load.kind === 'BODYWEIGHT') return;
    if (load.kind === 'PERCENT_1RM') {
      if (load.value == null || load.value <= 0 || load.value > 100) {
        throw new UnprocessableEntityException(`${path}.value is invalid`);
      }
      return;
    }
    if (load.value == null || load.value < 0 || !load.unit) {
      throw new UnprocessableEntityException(`${path} value/unit is invalid`);
    }
    if (load.kind === 'BODYWEIGHT_OFFSET' && !load.direction) {
      throw new UnprocessableEntityException(`${path}.direction is required`);
    }
  }

  private parseSessionDate(value?: string | null) {
    if (!value?.trim()) return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      throw new UnprocessableEntityException('startedAt is invalid');
    }
    return parsed;
  }

  private throwWorkoutNotFound(): never {
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.COMMON,
      message: 'Strength workout not found or access denied',
    });
  }

  private parseCompletedAt(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new UnprocessableEntityException('completedAt is invalid');
    }
    return parsed;
  }

  /**
   * 确认 plannedSetGroupId 都属于当前用户的计划组。
   */
  private async assertPlannedSetGroupsOwned(userId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const rows = await this.planQuery.findSetGroups({
      where: { id: { in: unique }, exercise: { workout: { userId } } },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new UnprocessableEntityException(
        'plannedSetGroupId does not belong to the current user',
      );
    }
  }

  private throwNotFound(): never {
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
      message: 'Activity not found or access denied',
    });
  }

  private round2(value: number) {
    return Math.round(value * 100) / 100;
  }
}
