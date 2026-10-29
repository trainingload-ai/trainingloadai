import {
  GoneException,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { createHash, randomBytes } from 'node:crypto';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  PLAN_SHARE_MAX_PAYLOAD_BYTES,
  PLAN_SHARE_PAYLOAD_VERSION,
  PlanSharePayloadError,
  assertSafe,
  canonicalPayloadJson,
  fromPlan,
  isRenderablePreviewStructure,
  nextImportedTitle,
  payloadBytes,
  toCreatePlanDto,
  toPreview,
  withPreviewMetrics,
  type PlanSharePayloadV1,
  type PlanShareSourcePlan,
  type PlanShareWorkoutV1,
} from '@shared/plan-share';
import type { WorkoutStructure } from '@shared/workout-structure';
import { WorkoutDefinitionService } from '../../workout/workout-definition.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PlanService } from '../plan.service';
import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import { PlanShareRepository } from '../persistence/plan-share.repository';
import type { PlanDb } from '../persistence/plan-db';
import { PlanRepository } from '../persistence/plan.repository';
import {
  PLAN_DRAFT_CHANGED_EVENT,
  type PlanDraftChangedEvent,
} from '../events/plan.events';
import type { CreatePlanDto } from '../dto/create-plan.dto';

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

type NormalizedPlan = NonNullable<
  Awaited<ReturnType<PlanService['getPlanDetail']>>['plan']
>;

type PlanShareStatusLike = {
  status: string;
};

type PlanShareResultShare = PlanShareStatusLike & {
  publicId: string;
  version: number;
  payloadHash: string;
  title: string;
};

type PlanSharePreviewShare = PlanShareStatusLike & {
  publicId: string;
  version: number;
  payload: Prisma.JsonValue;
};

type PlanShareLineageLike = PlanShareStatusLike & {
  publicId: string;
  origin: string;
  visibility: string;
  parentLineageId?: string | null;
  catalogSlug?: string | null;
  headShareId?: string | null;
};

function hashPayload(payload: PlanSharePayloadV1): string {
  return createHash('sha256').update(canonicalPayloadJson(payload)).digest('hex');
}

function assertPublicId(publicId: string) {
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    throw new NotFoundException('Plan share not found');
  }
}

@Injectable()
export class PlanShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: PlanService,
    private readonly workoutDefinitionService: WorkoutDefinitionService,
    private readonly loadEstimator: PlanLoadEstimatorService,
    private readonly shares: PlanShareRepository,
    private readonly plans: PlanRepository,
  ) {}

  @OnEvent(PLAN_DRAFT_CHANGED_EVENT)
  async handleDraftChanged(event: PlanDraftChangedEvent) {
    await this.maybeSnapshotDraftPlan(event.userId, event.planId);
  }

  async createFromPlan(
    userId: string,
    planId: string,
    options?: {
      tx?: PlanDb;
      normalizedPlan?: NormalizedPlan;
    },
  ) {
    const run = async (tx: PlanDb) => {
      const plan =
        options?.normalizedPlan && options.normalizedPlan.id === planId
          ? options.normalizedPlan
          : (await this.planService.getPlanDetail(userId, planId, tx))
              .plan;
      if (!plan || plan.userId !== userId) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan not found',
        });
      }

      const payload = this.snapshotFromPlan(plan);
      const bytes = payloadBytes(payload);
      if (bytes > PLAN_SHARE_MAX_PAYLOAD_BYTES) {
        throw new PayloadTooLargeException('Plan share payload is too large');
      }
      const digest = hashPayload(payload);
      const sportTypes: $Enums.SportType[] = [
        ...new Set(
          payload.workouts.map((workout) => workout.sportType),
        ),
      ];
      const trainingDaysPerWeek = new Set(
        payload.workouts.map((workout) => workout.dayIndex),
      ).size;

      const existingLineage = await this.shares.findLineageFirst({
        where: {
          ownerUserId: userId,
          headPlanId: plan.id,
          status: 'ACTIVE',
        },
        include: {
          shares: {
            orderBy: { version: 'desc' },
          },
        },
      }, tx);

      if (existingLineage) {
        const activeShares = existingLineage.shares.filter(
          (share) => share.status === 'ACTIVE',
        );
        const head =
          activeShares.find(
            (share) => share.id === existingLineage.headShareId,
          ) ?? activeShares[0];
        if (head && head.payloadHash === digest) {
          return this.toShareResult(existingLineage, head, true);
        }
        const nextVersion = (existingLineage.shares[0]?.version ?? 0) + 1;
        const share = await this.insertShare(tx, {
          lineageId: existingLineage.id,
          version: nextVersion,
          sourcePlanId: plan.id,
          payload,
          digest,
          bytes,
          sportTypes,
          trainingDaysPerWeek,
        });
        await this.shares.updateLineage({
          where: { id: existingLineage.id },
          data: {
            title: payload.title,
            description: payload.description,
            goal: payload.goal,
            sportTypes,
            locale: payload.locale,
            headShareId: share.id,
            headPlanId: plan.id,
          },
        }, tx);
        return this.toShareResult(
          { ...existingLineage, headShareId: share.id },
          share,
          false,
        );
      }

      const parentLineageId =
        typeof plan.derivedFromLineageId === 'string'
          ? plan.derivedFromLineageId
          : null;
      const parent = parentLineageId
        ? await this.shares.findLineageUnique({
            where: { id: parentLineageId },
            select: { id: true, rootLineageId: true },
          }, tx)
        : null;

      const lineagePublicId = await this.allocatePublicId(tx);
      const lineage = await this.shares.createLineage({
        data: {
          publicId: lineagePublicId,
          ownerUserId: userId,
          parentLineageId: parent?.id ?? null,
          rootLineageId: parent?.rootLineageId ?? lineagePublicId,
          visibility: 'UNLISTED',
          status: 'ACTIVE',
          origin: 'USER_SHARE',
          title: payload.title,
          description: payload.description,
          goal: payload.goal,
          sportTypes,
          locale: payload.locale,
          headPlanId: plan.id,
        },
      }, tx);
      if (!parent) {
        await this.shares.updateLineage({
          where: { id: lineage.id },
          data: { rootLineageId: lineage.id },
        }, tx);
        lineage.rootLineageId = lineage.id;
      }

      const share = await this.insertShare(tx, {
        lineageId: lineage.id,
        version: 1,
        sourcePlanId: plan.id,
        payload,
        digest,
        bytes,
        sportTypes,
        trainingDaysPerWeek,
      });
      await this.shares.updateLineage({
        where: { id: lineage.id },
        data: { headShareId: share.id },
      }, tx);
      return this.toShareResult(
        { ...lineage, headShareId: share.id },
        share,
        false,
      );
    };

    if (options?.tx) {
      return run(options.tx);
    }
    return this.prisma.$transaction((tx) => run(tx));
  }

  async maybeSnapshotDraftPlan(
    userId: string,
    planId: string,
    options?: {
      tx?: PlanDb;
      normalizedPlan?: NormalizedPlan;
    },
  ) {
    const run = async (tx: PlanDb) => {
      const plan =
        options?.normalizedPlan && options.normalizedPlan.id === planId
          ? options.normalizedPlan
          : (await this.planService.getPlanDetail(userId, planId, tx))
              .plan;
      if (!plan || plan.userId !== userId || plan.status !== 'DRAFT') {
        return null;
      }
      const lineage = await this.shares.findLineageFirst({
        where: {
          ownerUserId: userId,
          headPlanId: planId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }, tx);
      if (!lineage) return null;
      return this.createFromPlan(userId, planId, {
        tx,
        normalizedPlan: plan,
      });
    };

    if (options?.tx) {
      return run(options.tx);
    }
    return this.prisma.$transaction((tx) => run(tx));
  }

  async listMine(userId: string) {
    const lineages = await this.shares.findLineages({
      where: { ownerUserId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        parentLineage: { select: { publicId: true } },
        shares: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            publicId: true,
            version: true,
            status: true,
            payloadHash: true,
          },
        },
      },
    });
    return {
      lineages: lineages.map((lineage) => {
        const head =
          lineage.shares.find(
            (share) => share.id === lineage.headShareId,
          ) ?? lineage.shares.find((share) => share.status === 'ACTIVE');
        return {
          publicId: lineage.publicId,
          title: lineage.title,
          description: lineage.description,
          visibility: lineage.visibility,
          status: lineage.status,
          origin: lineage.origin,
          parentLineagePublicId: lineage.parentLineage?.publicId ?? null,
          headSharePublicId: head?.publicId ?? null,
          headVersion: head?.version ?? null,
          versions: lineage.shares.map((share) => ({
            publicId: share.publicId,
            version: share.version,
            status: share.status,
          })),
          updatedAt: lineage.updatedAt,
        };
      }),
    };
  }

  async revokeShare(userId: string, publicId: string) {
    assertPublicId(publicId);
    return this.prisma.$transaction(async (tx) => {
      const share = await this.shares.findShareUnique({
        where: { publicId },
        include: { lineage: true },
      }, tx);
      if (!share || share.lineage.ownerUserId !== userId) {
        throw new NotFoundException('Plan share not found');
      }
      if (share.status === 'REVOKED') {
        return this.toShareResult(share.lineage, share, true);
      }
      const revokedAt = new Date();
      await this.shares.updateShare({
        where: { id: share.id },
        data: { status: 'REVOKED', revokedAt },
      }, tx);
      if (share.lineage.headShareId === share.id) {
        const previous = await this.shares.findShare({
          where: {
            lineageId: share.lineageId,
            status: 'ACTIVE',
            id: { not: share.id },
          },
          orderBy: { version: 'desc' },
        }, tx);
        await this.shares.updateLineage({
          where: { id: share.lineageId },
          data: { headShareId: previous?.id ?? null },
        }, tx);
        share.lineage.headShareId = previous?.id ?? null;
      }
      return this.toShareResult(share.lineage, { ...share, status: 'REVOKED' });
    });
  }

  async revokeLineage(userId: string, publicId: string) {
    assertPublicId(publicId);
    return this.prisma.$transaction(async (tx) => {
      const lineage = await this.shares.findLineageUnique({
        where: { publicId },
      }, tx);
      if (!lineage || lineage.ownerUserId !== userId) {
        throw new NotFoundException('Plan share lineage not found');
      }
      const revokedAt = new Date();
      await this.shares.updateShareMany({
        where: { lineageId: lineage.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt },
      }, tx);
      await this.shares.updateLineage({
        where: { id: lineage.id },
        data: { status: 'REVOKED', revokedAt, headShareId: null },
      }, tx);
      return { publicId: lineage.publicId, status: 'REVOKED' as const };
    });
  }

  async importForUser(
    userId: string,
    publicId: string,
    options?: { share?: boolean },
  ) {
    assertPublicId(publicId);
    return this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolveActiveShare(publicId, tx);
      const payload = this.readPayload(resolved.share.payload);
      const existing = await this.plans.findMany(
        {
          where: {
            userId,
            derivedFromShareId: resolved.share.id,
          },
          select: { title: true },
        },
        tx,
      );
      const title = nextImportedTitle(
        payload.title,
        existing.map((row: { title: string }) => row.title),
      );
      const dto = toCreatePlanDto(payload, {
        title,
        metadata: {
          importedFrom: {
            sharePublicId: resolved.share.publicId,
            lineagePublicId: resolved.lineage.publicId,
            version: resolved.share.version,
            origin: resolved.lineage.origin,
            payloadVersion: PLAN_SHARE_PAYLOAD_VERSION,
            importedAt: new Date().toISOString(),
          },
        },
      });
      const created = await this.planService.createPlan(
        userId,
        dto as CreatePlanDto,
        {
          tx,
          lineage: {
            derivedFromShareId: resolved.share.id,
            derivedFromLineageId: resolved.lineage.id,
            rootLineageId: resolved.lineage.rootLineageId,
          },
        },
      );
      if (!options?.share) {
        return { plan: created.plan, share: null };
      }
      const share = await this.createFromPlan(userId, created.plan.id, {
        tx,
        normalizedPlan: created.plan,
      });
      return { plan: created.plan, share };
    });
  }

  async getPublicSharePreview(publicId: string) {
    assertPublicId(publicId);
    const share = await this.shares.findShareUnique({
      where: { publicId },
      include: { lineage: true },
    });
    if (!share) {
      throw new NotFoundException('Plan share not found');
    }
    this.assertPreviewable(share, share.lineage);
    return this.toPublicPreview(share, share.lineage);
  }

  async getViewerSharePreview(userId: string, publicId: string) {
    assertPublicId(publicId);
    const resolved = await this.resolveActiveShare(publicId);
    const preview = this.toPublicPreview(resolved.share, resolved.lineage);
    const payload = this.readPayload(resolved.share.payload);
    const estimates = await this.loadEstimator.estimateForViewerWorkouts(
      userId,
      payload.workouts.map((workout, index) => ({
        sportType: workout.sportType,
        structureKind: workout.structureKind,
        text: this.previewTextFromWorkout(workout),
        durationSeconds: preview.workouts[index]?.durationSeconds,
        plannedSessionRpe:
          workout.definition?.source === 'STRUCTURE' &&
          workout.definition.structure.kind === 'STRENGTH'
            ? workout.definition.structure.plannedSessionRpe
            : null,
      })),
    );
    return {
      ...preview,
      loadPersonalized: true,
      workouts: preview.workouts.map((workout, index) => {
        const estimatedLoad = estimates[index]?.estimatedLoad ?? null;
        return {
          ...workout,
          estimatedLoad,
          estimatedLoadSource: estimates[index]?.estimatedLoadSource ?? null,
          previewLoad: estimatedLoad ?? workout.previewLoad,
        };
      }),
    };
  }

  async getPublicLineagePreview(publicId: string, version?: number) {
    assertPublicId(publicId);
    const lineage = await this.shares.findLineageUnique({
      where: { publicId },
      include: {
        parentLineage: { select: { publicId: true } },
        shares: { orderBy: { version: 'desc' } },
      },
    });
    if (!lineage) {
      throw new NotFoundException('Plan share lineage not found');
    }
    if (lineage.status === 'REVOKED') {
      throw new GoneException('Plan share has been revoked');
    }
    const share =
      typeof version === 'number'
        ? lineage.shares.find((item) => item.version === version)
        : lineage.shares.find((item) => item.id === lineage.headShareId) ??
          lineage.shares.find((item) => item.status === 'ACTIVE');
    if (!share) {
      throw new NotFoundException('Plan share not found');
    }
    this.assertPreviewable(share, lineage);
    const head = lineage.shares.find((item) => item.status === 'ACTIVE');
    return {
      ...this.toPublicPreview(share, lineage),
      lineagePublicId: lineage.publicId,
      headVersion: head?.version ?? null,
      parentLineagePublicId: lineage.parentLineage?.publicId ?? null,
    };
  }

  async listCatalog() {
    const lineages = await this.shares.findLineages({
      where: {
        visibility: 'CATALOG',
        origin: 'OFFICIAL',
        status: 'ACTIVE',
      },
      include: {
        shares: {
          where: { status: 'ACTIVE' },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { publishedAt: 'desc' },
    });
    return {
      items: lineages
        .filter((lineage) => lineage.shares[0])
        .map((lineage) =>
          this.toPublicPreview(lineage.shares[0], lineage),
        ),
    };
  }

  async getCatalogBySlug(slug: string) {
    const lineage = await this.shares.findLineageUnique({
      where: { catalogSlug: slug },
      include: {
        parentLineage: { select: { publicId: true } },
        shares: { orderBy: { version: 'desc' } },
      },
    });
    if (
      !lineage ||
      lineage.visibility !== 'CATALOG' ||
      lineage.origin !== 'OFFICIAL' ||
      lineage.status !== 'ACTIVE'
    ) {
      throw new NotFoundException('Plan catalog item not found');
    }
    const head =
      lineage.shares.find((item) => item.id === lineage.headShareId) ??
      lineage.shares.find((item) => item.status === 'ACTIVE');
    if (!head) {
      throw new NotFoundException('Plan catalog item not found');
    }
    this.assertPreviewable(head, lineage);
    return {
      ...this.toPublicPreview(head, lineage),
      slug: lineage.catalogSlug,
      parentLineagePublicId: lineage.parentLineage?.publicId ?? null,
    };
  }

  private async insertShare(
    tx: PlanDb,
    input: {
      lineageId: string;
      version: number;
      sourcePlanId: string;
      payload: PlanSharePayloadV1;
      digest: string;
      bytes: number;
      sportTypes: $Enums.SportType[];
      trainingDaysPerWeek: number;
    },
  ) {
    return this.shares.createShare({
      data: {
        publicId: await this.allocatePublicId(tx),
        lineageId: input.lineageId,
        version: input.version,
        sourcePlanId: input.sourcePlanId,
        status: 'ACTIVE',
        title: input.payload.title,
        description: input.payload.description,
        goal: input.payload.goal,
        periodWeeks: input.payload.periodWeeks,
        sportTypes: input.sportTypes satisfies $Enums.SportType[],
        workoutCount: input.payload.workouts.length,
        trainingDaysPerWeek: input.trainingDaysPerWeek,
        locale: input.payload.locale,
        payloadHash: input.digest,
        payloadVersion: PLAN_SHARE_PAYLOAD_VERSION,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        payloadBytes: input.bytes,
      },
    }, tx);
  }

  private async allocatePublicId(tx: PlanDb) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const publicId = randomBytes(9).toString('base64url');
      const [share, lineage] = await Promise.all([
        this.shares.findShareUnique({
          where: { publicId },
          select: { id: true },
        }, tx),
        this.shares.findLineageUnique({
          where: { publicId },
          select: { id: true },
        }, tx),
      ]);
      if (!share && !lineage) return publicId;
    }
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.COMMON,
      message: 'Could not allocate a share id',
    });
  }

  private async resolveActiveShare(publicId: string, tx?: PlanDb) {
    const share = await this.shares.findShareUnique({
      where: { publicId },
      include: { lineage: true },
    }, tx);
    if (share) {
      this.assertPreviewable(share, share.lineage);
      return { share, lineage: share.lineage };
    }
    const lineage = await this.shares.findLineageUnique({
      where: { publicId },
      include: {
        shares: { orderBy: { version: 'desc' } },
      },
    }, tx);
    if (!lineage) {
      throw new NotFoundException('Plan share not found');
    }
    const head =
      lineage.shares.find((item) => item.id === lineage.headShareId) ??
      lineage.shares.find((item) => item.status === 'ACTIVE');
    if (!head) {
      throw new GoneException('Plan share has been revoked');
    }
    this.assertPreviewable(head, lineage);
    return { share: head, lineage };
  }

  private assertPreviewable(
    share: PlanShareStatusLike | null | undefined,
    lineage: PlanShareStatusLike | null | undefined,
  ) {
    if (!share || !lineage) {
      throw new NotFoundException('Plan share not found');
    }
    if (share.status === 'REVOKED' || lineage.status === 'REVOKED') {
      throw new GoneException('Plan share has been revoked');
    }
  }

  private snapshotFromPlan(plan: PlanShareSourcePlan): PlanSharePayloadV1 {
    try {
      return fromPlan(plan);
    } catch (error) {
      this.rethrowPayloadError(error);
    }
  }

  private readPayload(value: unknown): PlanSharePayloadV1 {
    try {
      assertSafe(value);
      return value;
    } catch (error) {
      this.rethrowPayloadError(error);
    }
  }

  private rethrowPayloadError(error: unknown): never {
    if (error instanceof PlanSharePayloadError) {
      if (error.message.includes('too large')) {
        throw new PayloadTooLargeException(error.message);
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: error.message,
      });
    }
    throw error;
  }

  private previewTextFromWorkout(workout: PlanShareWorkoutV1): string | null {
    const fromRow = workout.text?.trim();
    if (fromRow) return fromRow;
    if (workout.definition?.source === 'TEXT' && workout.definition.text?.trim()) {
      return workout.definition.text;
    }
    if (!workout.definition) return null;
    try {
      return this.workoutDefinitionService.resolve(workout.definition, {
        tolerateStoredInvalid: true,
      }).text;
    } catch {
      return null;
    }
  }

  private toShareResult(
    lineage: PlanShareLineageLike,
    share: PlanShareResultShare,
    reused = false,
  ) {
    return {
      reused,
      share: {
        publicId: share.publicId,
        version: share.version,
        status: share.status,
        payloadHash: share.payloadHash,
        title: share.title,
      },
      lineage: {
        publicId: lineage.publicId,
        origin: lineage.origin,
        visibility: lineage.visibility,
        status: lineage.status,
        parentLineageId: lineage.parentLineageId ?? null,
      },
    };
  }

  private toPublicPreview(
    share: PlanSharePreviewShare,
    lineage: PlanShareLineageLike,
  ) {
    const payload = this.readPayload(share.payload);
    const preview = toPreview(payload);
    return {
      publicId: share.publicId,
      lineagePublicId: lineage.publicId,
      slug: lineage.catalogSlug ?? undefined,
      origin: lineage.origin,
      visibility: lineage.visibility,
      version: share.version,
      title: preview.title,
      description: preview.description,
      goal: preview.goal,
      periodWeeks: preview.periodWeeks,
      locale: preview.locale,
      sportTypes: preview.sportTypes,
      workoutCount: preview.workoutCount,
      trainingDaysPerWeek: preview.trainingDaysPerWeek,
      workouts: preview.workouts.map((workout, index) =>
        withPreviewMetrics(
          workout,
          this.resolvePreviewStructure(
            payload.workouts[index],
            workout.structure,
          ),
        ),
      ),
    };
  }

  private resolvePreviewStructure(
    payloadWorkout: PlanShareWorkoutV1 | undefined,
    existing?: WorkoutStructure,
  ): WorkoutStructure | undefined {
    if (isRenderablePreviewStructure(existing)) return existing;
    const definition = payloadWorkout?.definition;
    if (!definition) return undefined;
    try {
      const resolved = this.workoutDefinitionService.resolve(definition, {
        tolerateStoredInvalid: true,
      });
      return isRenderablePreviewStructure(resolved.structure)
        ? resolved.structure
        : undefined;
    } catch {
      return undefined;
    }
  }
}
