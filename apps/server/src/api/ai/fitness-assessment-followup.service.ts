import { UserQueryService } from '@/api/user/user-query.service';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  FitnessCalculationService,
  AssessmentContext,
} from '@/fitness-calculation/fitness-calculation.service';
import {
  EvidenceRequest,
  dateBoundary,
  fingerprint,
} from '@/fitness-calculation/fitness-input';
import { I18nService } from 'nestjs-i18n';
import { resolveSupportedLocale } from '@/utils/locale.util';
import {
  methodDisabled,
  fitnessMethod,
  normalizeFitnessMetric,
} from '@/fitness-calculation/fitness-methods';
import type {
  FitnessTrackingReply,
  FitnessAssessmentResult,
} from '@shared/fitness-assessment';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  emitUserFitnessInvalidated,
  UserFitnessInvalidatedEvent,
} from '@/api/user/events/user-fitness.events';
import { lockFitnessUser } from '@/prisma/fitness-write-lock';
import { Prisma, SportType, UserFitnessMetricType } from '@prisma/client';
import { buildStoredCoachUiMessageEnvelope } from './core/coach-history-messages';
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class FitnessAssessmentFollowupService {
  private readonly logger = new Logger(FitnessAssessmentFollowupService.name);
  private schemaUnavailableLogged = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculations: FitnessCalculationService,
    private readonly consent: AiDataConsentService,
    private readonly notifications: NotificationDomainService,
    private readonly events: EventEmitter2,
    private readonly users: UserQueryService,
    private readonly plans: PlanQueryService,
    private readonly i18n: I18nService,
  ) {}
  async track(
    ctx: AssessmentContext,
    input: {
      taskId: string;
      action: 'START' | 'STOP' | 'OFFER';
      workoutId?: string;
    },
    text: string,
    reply?: FitnessTrackingReply,
  ) {
    await this.consent.assertGranted(ctx.userId);
    await this.calculations.task(ctx, input.taskId);
    const structured =
      reply?.taskId === input.taskId &&
      reply.action === input.action &&
      (input.action === 'STOP' || reply.workoutId === input.workoutId);
    const natural =
      input.action === 'STOP'
        ? /^(?:请)?(?:取消|停止)跟踪[。！!\s]*$/.test(text.trim())
        : /^(?:请)?(?:帮我)?跟踪(?:这次|这个)?测试(?:训练)?[。！!\s]*$/.test(
            text.trim(),
          );
    if (input.action !== 'OFFER' && !structured && !natural)
      throw new ConflictException('CONFIRMATION_REQUIRED');
    if (input.action === 'STOP') {
      await this.prisma.$transaction(async (tx) => {
        await lockFitnessUser(tx, ctx.userId);
        await tx.fitnessAssessmentTask.update({
          where: { id: input.taskId },
          data: { tracking: false, stage: 'CLOSED' },
        });
      });
      return { tracking: false };
    }
    const workout = await this.plans.findFitnessTestWorkout(
      ctx.userId,
      input.workoutId ?? '',
    );
    if (!workout || ['SKIPPED', 'MOVED'].includes(workout.status))
      throw new ConflictException('Workout not available');
    const date =
      workout.scheduledDate ??
      (workout.plan?.startDate
        ? new Date(
            workout.plan.startDate.getTime() + workout.dayOffset * 86400000,
          )
        : null);
    if (!date) throw new ConflictException('Workout date required');
    const timezone = await this.calculations.timezone(ctx.userId);
    if (!timezone) throw new ConflictException('TIMEZONE_REQUIRED');
    const expiryDay = new Date(date.getTime() + 14 * 86400000)
      .toISOString()
      .slice(0, 10);
    const expires = dateBoundary(expiryDay, timezone).to;
    if (expires <= ctx.now)
      throw new ConflictException('Workout tracking expired');
    const task = await this.calculations.task(ctx, input.taskId);
    const request = task.request as unknown as EvidenceRequest;
    if (fitnessMethod(request.methodId)?.recipe !== 'HR_TEST_SEGMENT')
      throw new ConflictException(
        'Test tracking protocol not available for this method',
      );
    if (workout.sportType !== request.sport)
      throw new ConflictException('Sport mismatch');
    if (input.action === 'OFFER') {
      await this.prisma.$transaction(async (tx) => {
        await lockFitnessUser(tx, ctx.userId);
        const latest = await tx.fitnessAssessmentTask.findUniqueOrThrow({
          where: { id: task.id },
        });
        await tx.fitnessAssessmentTask.update({
          where: { id: task.id },
          data: {
            facts: json({
              ...(latest.facts as object),
              trackingOffer: {
                workoutId: workout.id,
                offeredAt: ctx.now.toISOString(),
                revision: latest.revision,
                expiresAt: expires.toISOString(),
              },
            }),
          },
        });
      });
      return {
        kind: 'fitness_tracking_offer',
        taskId: task.id,
        workoutId: workout.id,
        workoutName: workout.name,
        expiresAt: expires.toISOString(),
      };
    }
    await this.prisma.$transaction(async (tx) => {
      await lockFitnessUser(tx, ctx.userId);
      const latest = await tx.fitnessAssessmentTask.findUniqueOrThrow({
        where: { id: task.id },
      });
      const offer = (
        latest.facts as {
          trackingOffer?: {
            workoutId: string;
            offeredAt: string;
            revision: number;
          };
        }
      ).trackingOffer;
      if (
        !offer ||
        offer.workoutId !== workout.id ||
        offer.revision !== latest.revision ||
        Date.parse(offer.offeredAt) >= ctx.now.getTime()
      )
        throw new ConflictException('CONFIRMATION_REQUIRED');
      await tx.fitnessAssessmentTask.update({
        where: { id: task.id },
        data: {
          tracking: true,
          linkedWorkoutId: workout.id,
          trackingExpiresAt: expires,
          nextCheckAt: ctx.now,
          stage: 'WAITING_ACTIVITY',
        },
      });
    });
    return {
      tracking: true,
      taskId: task.id,
      workoutId: workout.id,
      expiresAt: expires.toISOString(),
      protocol: `${request.methodId}@1`,
      requiresActualProtocolValidation: true,
    };
  }
  async wakeUser(userId: string) {
    await this.prisma.fitnessAssessmentTask.updateMany({
      where: { userId, tracking: true },
      data: { nextCheckAt: new Date() },
    });
  }
  async tick() {
    // Code can start before the expand migration. Probe the catalog rather
    // than querying missing tables (Prisma logs those errors before a catch).
    // Check again each tick so migration completion needs no process restart.
    // Connectivity/permission failures must still reach the scheduler.
    const schema = await this.prisma.$queryRaw<Array<{ ready: boolean }>>(
      Prisma.sql`
        SELECT to_regclass('t_fitness_calculation') IS NOT NULL
          AND to_regclass('t_fitness_assessment_task') IS NOT NULL
          AND to_regclass('t_fitness_evidence_revision') IS NOT NULL AS ready
      `,
    );
    if (!schema[0]?.ready) {
      if (!this.schemaUnavailableLogged) {
        this.logger.warn(
          'Fitness assessment worker paused: database migration 20260925000000_fitness_assessment is not ready. Apply the migration to the intended database; the worker will resume automatically.',
        );
        this.schemaUnavailableLogged = true;
      }
      return;
    }
    if (this.schemaUnavailableLogged) {
      this.logger.log('Fitness assessment worker resumed after migration');
      this.schemaUnavailableLogged = false;
    }
    // Already committed adoption must finish invalidation even after feature rollback.
    await this.retryPostProcessing();
    if (process.env.FITNESS_ASSESSMENT_ENABLED !== 'true') return;
    await this.retryNotifications();
    const now = new Date();
    const tasks = await this.prisma.fitnessAssessmentTask.findMany({
      where: {
        tracking: true,
        nextCheckAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      take: 10,
      orderBy: { nextCheckAt: 'asc' },
    });
    for (const task of tasks) {
      const claimed = await this.prisma.fitnessAssessmentTask.updateMany({
        where: {
          id: task.id,
          tracking: true,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: { leaseUntil: new Date(now.getTime() + 120000) },
      });
      if (!claimed.count) continue;
      try {
        const consent = await this.consent.getStatus(task.userId);
        const workout = task.linkedWorkoutId
          ? await this.plans.findFitnessTestWorkout(
              task.userId,
              task.linkedWorkoutId,
            )
          : null;
        if (
          !consent.granted ||
          !workout ||
          ['SKIPPED', 'MOVED'].includes(workout.status) ||
          !task.trackingExpiresAt ||
          task.trackingExpiresAt <= now
        ) {
          await this.prisma.fitnessAssessmentTask.update({
            where: { id: task.id },
            data: { tracking: false, stage: 'CLOSED', facts: {} },
          });
          continue;
        }
        const activities = workout.links
          .map((l) => l.activity)
          .filter(
            (a) => a.userId === task.userId && a.processingStatus === 'READY',
          );
        if (activities.length !== 1) continue;
        const activity = activities[0];
        const hash = fingerprint(activity);
        if (task.lastProcessedEvidenceHash === hash) continue;
        const ctx = {
          userId: task.userId,
          sessionId: task.sessionId,
          branchId: task.branchId,
          now,
        };
        const prior = task.request as unknown as EvidenceRequest;
        if (methodDisabled(prior.methodId)) continue;
        const request: EvidenceRequest = {
          ...prior,
          taskId: task.id,
          scope: { kind: 'ACTIVITY', activityHashId: activity.hashId },
          segment: undefined,
        };
        let result = await this.calculations.prepare(ctx, request);
        if (!result.reasonCode && result.status !== 'WAITING_DATA')
          result = await this.calculations.calculate(ctx, result.calculationId);
        // Cancellation/consent may have changed while the sensor read was running.
        const still = await this.prisma.fitnessAssessmentTask.findUnique({
          where: { id: task.id },
        });
        if (
          !still?.tracking ||
          !(await this.consent.getStatus(task.userId)).granted
        )
          continue;
        await this.publish(ctx, result, hash);
      } catch (e) {
        this.logger.warn(
          `Fitness follow-up failed: ${e instanceof Error ? e.name : 'unknown'}`,
        );
      } finally {
        await this.prisma.fitnessAssessmentTask.updateMany({
          where: { id: task.id, leaseUntil: new Date(now.getTime() + 120000) },
          data: {
            leaseUntil: null,
            nextCheckAt: new Date(Date.now() + 300000),
          },
        });
      }
    }
    await this.prisma.fitnessCalculation.deleteMany({
      where: {
        appliedAt: null,
        createdAt: { lt: new Date(Date.now() - 7 * 86400000) },
        postProcessState: { in: ['NONE', 'DONE'] },
        notificationPending: false,
      },
    });
  }
  /** Message, processed cursor and notification outbox commit together. */
  private async publish(
    ctx: AssessmentContext,
    result: FitnessAssessmentResult,
    evidenceHash: string,
  ) {
    const message = {
      content: [
        {
          type: 'tool_use' as const,
          id: result.calculationId,
          name: 'FitnessAssessment',
          input: result,
        },
      ],
    };
    await this.prisma.$transaction(async (tx) => {
      await lockFitnessUser(tx, ctx.userId);
      const task = await tx.fitnessAssessmentTask.findUniqueOrThrow({
        where: { id: result.taskId },
      });
      if (
        !task.tracking ||
        task.lastProcessedEvidenceHash === evidenceHash ||
        task.revision !== result.taskRevision
      )
        return;
      const c = await tx.fitnessCalculation.findUniqueOrThrow({
        where: { id: result.calculationId },
      });
      const session = await tx.aiCoachSession.upsert({
        where: { userId_id: { userId: ctx.userId, id: ctx.sessionId } },
        create: { id: ctx.sessionId, userId: ctx.userId, nextSequence: 2 },
        update: { nextSequence: { increment: 1 } },
      });
      const row = await tx.aiCoachMessage.create({
        data: {
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          sequence: session.nextSequence - 1,
          role: 'ASSISTANT',
          content: '',
          message: json(
            buildStoredCoachUiMessageEnvelope({
              role: 'assistant',
              content: '',
              message,
            }),
          ),
        },
      });
      const messageId = row.id;
      if (ctx.branchId) {
        const branch = await tx.coachBranch.findFirst({
          where: { id: ctx.branchId, context: { userId: ctx.userId } },
        });
        if (!branch) return;
        const thread = await tx.coachThread.update({
          where: { id: branch.threadId },
          data: { headMsgSeq: { increment: 1 } },
          select: { headMsgSeq: true },
        });
        const row = await tx.coachBranchMessage.create({
          data: {
            threadId: branch.threadId,
            branchId: branch.id,
            msgSeq: thread.headMsgSeq,
            role: 'assistant',
            content: json(message),
          },
        });
        await tx.coachBranch.update({
          where: { id: branch.id },
          data: { headMsgSeq: thread.headMsgSeq },
        });
      }
      await tx.fitnessCalculation.update({
        where: { id: c.id },
        data: {
          presentedAt: new Date(),
          presentedMessageId: messageId,
          notificationPending: true,
          notificationKey: `fitness:${task.id}:${evidenceHash}:${result.status}:${result.reasonCode ?? ''}`,
        },
      });
      await tx.fitnessAssessmentTask.update({
        where: { id: task.id },
        data: { lastProcessedEvidenceHash: evidenceHash },
      });
    });
    await this.retryNotifications();
  }
  private async retryNotifications() {
    const pending = await this.prisma.fitnessCalculation.findMany({
      where: { notificationPending: true },
      take: 10,
      orderBy: { createdAt: 'asc' },
    });
    for (const item of pending) {
      try {
        const granted = (await this.consent.getStatus(item.userId)).granted;
        await this.prisma.$transaction(async (tx) => {
          await lockFitnessUser(tx, item.userId);
          const c = await tx.fitnessCalculation.findUnique({
            where: { id: item.id },
            include: { task: true },
          });
          if (!c?.notificationPending) return;
          if (granted && c.task.tracking) {
            const result = c.result as unknown as FitnessAssessmentResult;
            const locale = resolveSupportedLocale(
              (
                await this.users.users(tx).findUnique({
                  where: { id: c.userId },
                  select: { preferredLocale: true },
                })
              )?.preferredLocale,
            );
            await this.notifications.ensureNotification(
              {
                userId: c.userId,
                kind: 'FITNESS_ASSESSMENT',
                dedupeKey: c.notificationKey!,
                title: this.i18n.t('fitnessAssessment.notification.title', {
                  lang: locale,
                }),
                bodyMarkdown: this.i18n.t(
                  result.status === 'ESTIMATED'
                    ? 'fitnessAssessment.notification.estimated'
                    : result.reasonCode
                      ? `fitnessAssessment.reasons.${result.reasonCode}`
                      : 'fitnessAssessment.notification.available',
                  { lang: locale },
                ),
                data: json({
                  sessionId: c.task.sessionId,
                  branchId: c.task.branchId,
                  taskId: c.taskId,
                  calculationId: c.id,
                  messageId: c.presentedMessageId,
                }),
              },
              tx,
            );
          }
          await tx.fitnessCalculation.update({
            where: { id: c.id },
            data: { notificationPending: false },
          });
        });
      } catch {
        this.logger.warn('Fitness notification delivery deferred');
      }
    }
  }
  private async retryPostProcessing() {
    const pending = await this.prisma.fitnessCalculation.findMany({
      where: {
        postProcessState: 'PENDING',
        nextAttemptAt: { lte: new Date() },
      },
      take: 10,
    });
    for (const c of pending) {
      const result = c.result as unknown as FitnessAssessmentResult;
      const option = result.applyOptions.find(
        (o) => o.id === c.appliedOptionId,
      );
      if (!option) continue;
      try {
        for (const change of option.changes) {
          const metric = normalizeFitnessMetric(
            change.metric,
          ) as UserFitnessMetricType;
          await emitUserFitnessInvalidated(
            this.events,
            new UserFitnessInvalidatedEvent(
              c.userId,
              metric,
              metric === UserFitnessMetricType.VO2_MAX
                ? SportType.UNKNOWN
                : (option.sport as SportType),
              [Date.parse(`${option.effectiveDate}T00:00:00Z`)],
              'MANUAL',
            ),
          );
        }
        await this.prisma.fitnessCalculation.updateMany({
          where: { id: c.id, postProcessState: 'PENDING' },
          data: { postProcessState: 'DONE' },
        });
      } catch {
        await this.prisma.fitnessCalculation.updateMany({
          where: { id: c.id, postProcessState: 'PENDING' },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(
              Date.now() +
                Math.min(3600000, 60000 * 2 ** Math.min(c.attempts, 6)),
            ),
          },
        });
      }
    }
  }
}
