import { listRollingWorkoutDays } from '../persistence/plan-workout.repository';
import { PlanRepository } from '../persistence/plan.repository';
import { UserService } from '@/api/user/user.service';
import {
  Injectable,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type RollingPlanJob } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { sha256Hex, stableJson } from '@/api/ai/core/ai-common.util';
import { addCalendarDays } from '@shared/plan-calendar';
import {
  calendarMonthEnd,
  isoWeekStart,
  parseRollingStartSettings,
  type RollingMonthDraft,
  type RollingPlanAutomationStatus,
  type RollingPlanAutomationJob,
} from '@shared/rolling-plan';
import { activityCalendarYmdInZone } from '../plan-link-calendar.util';
import type { PlanDb } from '../persistence/plan-db';
import { PlanStartService } from './plan-start.service';
import { RollingPlanAuthorizationService } from './rolling-plan-authorization.service';

const date = (s: string) => new Date(`${s}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const hash = (v: unknown) => sha256Hex(stableJson(v));
const fail = (code: string): never => {
  throw new UnprocessableEntityException(code);
};
const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60_000;
const WINDOW_NOT_DUE = 'ROLLING_WINDOW_NOT_DUE';

function lastTrainingDayFinished(
  workouts: { scheduledDate: Date | null; status: string }[],
  from: string,
  through: string,
  today: string,
) {
  const lastDate = workouts.find(({ scheduledDate }) => {
    const day = scheduledDate && ymd(scheduledDate);
    return day && day >= from && day <= through;
  })?.scheduledDate;
  if (!lastDate) return today > through;
  const lastDay = ymd(lastDate);
  return today > lastDay ||
    (today === lastDay && workouts.every(({ scheduledDate, status }) =>
      !scheduledDate || ymd(scheduledDate) !== lastDay || status === 'DONE',
    ));
}

/** Durable domain queue. Model calls never run inside these short transactions. */
@Injectable()
export class RollingPlanAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly starts: PlanStartService,
    private readonly access: RollingPlanAuthorizationService,
    private readonly plans: PlanRepository,
    @Optional() private readonly users?: UserService,
  ) {}

  private async evidence(
    planId: string,
    from: string,
    through: string,
    tx: PlanDb,
  ) {
    const plan = await this.plans.findUnique({ where: { id: planId } }, tx);
    if (!plan) fail('ROLLING_PLAN_NOT_FOUND');
    return this.starts.automationSnapshot(
      plan.userId,
      planId,
      from,
      through,
      tx,
    );
  }

  /** Scan the current/following ISO window, never backfill a past pause gap. */
  async discover(now = new Date(), planId?: string) {
    const policies = await this.prisma.planAutomationPolicy.findMany({
      where: {
        ...(planId ? { planId } : {}),
        revokedAt: null,
        plan: { planningMode: 'ROLLING', status: 'ACTIVE' },
      },
      include: { plan: true },
    });
    let enqueued = 0;
    for (const policy of policies) {
      const plan = policy.plan;
      const today = activityCalendarYmdInZone(
        now,
        plan.activationTimezone ?? 'UTC',
      );
      if (!today || !plan.startDate) continue;
      const from = today > ymd(plan.startDate) ? today : ymd(plan.startDate);
      const week = isoWeekStart(from);
      const weekEnd = addCalendarDays(week, 6);
      try {
        enqueued += await this.prisma.$transaction(
          async (tx) => {
            await acquireHashtextAdvisoryXactLock(tx, plan.userId);
            await this.access.assertAllowed(plan.userId, tx);
            const current = await tx.planAutomationPolicy.findFirst({
              where: { planId: plan.id, revokedAt: null },
            });
            const live = await this.plans.findUnique(
              { where: { id: plan.id } },
              tx,
            );
            if (current?.id !== policy.id || live?.status !== 'ACTIVE')
              return 0;
            const monthStart = `${today.slice(0, 7)}-01`;
            const monthEnd = calendarMonthEnd(today);
            const workouts = await listRollingWorkoutDays(
              tx,
              plan.id,
              date(monthStart < week ? monthStart : week),
              date(monthEnd > weekEnd ? monthEnd : weekEnd),
            );
            const published = await tx.rollingWeekGeneration.findMany({
              where: {
                planId: plan.id,
                supersededAt: null,
                appliedAt: { not: null },
                OR: [weekEnd, monthEnd].map((day) => ({
                  generatedFrom: { lte: date(day) },
                  generatedThrough: { gte: date(day) },
                })),
              },
              select: { generatedFrom: true, generatedThrough: true },
            });
            const nextWeekDue =
              from === today &&
              published.some((generation) =>
                ymd(generation.generatedFrom) <= from &&
                ymd(generation.generatedThrough) >= weekEnd,
              ) &&
              lastTrainingDayFinished(workouts, week, weekEnd, today);
            const through = nextWeekDue ? addCalendarDays(weekEnd, 7) : weekEnd;
            const months = new Set([from.slice(0, 7)]);
            const nextMonthStart = addCalendarDays(monthEnd, 1);
            if (
              lastTrainingDayFinished(workouts, monthStart, monthEnd, today) &&
              (through >= nextMonthStart ||
                published.some((generation) =>
                  ymd(generation.generatedFrom) <= monthEnd &&
                  ymd(generation.generatedThrough) >= monthEnd,
                ))
            ) {
              months.add(nextMonthStart.slice(0, 7));
            }
            await tx.rollingPlanJob.updateMany({
              where: {
                planId: plan.id,
                policyId: policy.id,
                state: { in: ['PENDING', 'RETRY'] },
                OR: [
                  {
                    kind: { in: ['WEEK', 'ADJUST'] },
                    windowStart: { gt: date(through) },
                  },
                  {
                    kind: 'MONTH',
                    windowStart: {
                      gt: date(monthStart),
                      notIn: [...months].map((month) => date(`${month}-01`)),
                    },
                  },
                ],
              },
              data: { state: 'CANCELLED', lastError: WINDOW_NOT_DUE },
            });
            const evidence = await this.evidence(plan.id, from, through, tx);
            const completedWindows: Prisma.RollingPlanJobWhereInput[] = [];
            let count = 0;
            for (const month of months) {
              const start = `${month}-01`;
              const currentMonth = await tx.rollingMonthStrategy.findFirst({
                where: {
                  planId: plan.id,
                  monthStart: date(start),
                  supersededAt: null,
                  appliedAt: { not: null },
                },
              });
              if (currentMonth) {
                completedWindows.push({ kind: 'MONTH', windowStart: date(start) });
              } else {
                count += await this.enqueue(
                  tx,
                  {
                    planId: plan.id,
                    policyId: policy.id,
                    kind: 'MONTH',
                    windowStart: date(start),
                    inputRevision: hash({
                      semantic: evidence.revision,
                      from: start < from ? from : start,
                    }),
                  },
                  {
                    semanticRevision: evidence.revision,
                    from: start < from ? from : start,
                    through: calendarMonthEnd(start),
                    evidenceRevision: evidence.revision,
                    scanFrom: from,
                    scanThrough: through,
                  },
                );
              }
            }
            for (
              let start = week;
              start <= through;
              start = addCalendarDays(start, 7)
            ) {
              const end = addCalendarDays(start, 6),
                first = from > start ? from : start;
              const generations = await tx.rollingWeekGeneration.findMany({
                where: {
                  planId: plan.id,
                  weekStart: date(start),
                  supersededAt: null,
                  appliedAt: { not: null },
                },
              });
              const coverage = generations.find(
                (g) =>
                  ymd(g.generatedFrom) <= first &&
                  ymd(g.generatedThrough) >= end,
              );
              if (coverage) {
                completedWindows.push({
                  kind: { in: ['WEEK', 'ADJUST'] },
                  windowStart: date(start),
                });
                continue;
              }
              const deps = await tx.rollingMonthStrategy.findMany({
                where: {
                  planId: plan.id,
                  supersededAt: null,
                  appliedAt: { not: null },
                  monthStart: { lte: date(end) },
                  monthEnd: { gte: date(first) },
                },
                orderBy: { monthStart: 'asc' },
              });
              const required = new Set([first.slice(0, 7), end.slice(0, 7)]);
              if (deps.length !== required.size) continue;
              const semanticRevision = hash({
                external: evidence.revision,
                months: deps.map((m) => m.id),
              });
              const inputRevision = hash({ semanticRevision, from: first });
              count += await this.enqueue(
                  tx,
                  {
                    planId: plan.id,
                    policyId: policy.id,
                    kind: 'WEEK',
                    windowStart: date(start),
                    inputRevision,
                  },
                  {
                    semanticRevision,
                    from: first,
                    through: end,
                    evidenceRevision: evidence.revision,
                    scanFrom: from,
                    scanThrough: through,
                    monthStrategyIds: deps.map((m) => m.id),
                  },
              );
            }
            if (completedWindows.length) await tx.rollingPlanJob.updateMany({
              where: {
                planId: plan.id,
                policyId: policy.id,
                state: { in: ['PENDING', 'RETRY'] },
                OR: completedWindows,
              },
              data: { state: 'CANCELLED', lastError: 'ROLLING_WINDOW_ALREADY_PUBLISHED' },
            });
            return count;
          },
          { timeout: 60000 },
        );
      } catch {
        /* Access/provider failures retain all published training; a later scan can resume. */
      }
    }
    return enqueued;
  }
  private async enqueue(
    tx: PlanDb,
    data: Prisma.RollingPlanJobUncheckedCreateInput,
    input: unknown,
  ) {
    const window = {
      planId: data.planId,
      kind: data.kind,
      policyId: data.policyId,
      windowStart: data.windowStart,
    };
    if (await tx.rollingPlanJob.findFirst({
      where: { ...window, state: 'RUNNING', leaseUntil: { gt: new Date() } },
      select: { id: true },
    })) return 0;
    await tx.rollingPlanJob.updateMany({
      where: {
        ...window,
        inputRevision: { not: data.inputRevision },
        state: { in: ['PENDING', 'RUNNING', 'RETRY'] },
      },
      data: {
        state: 'CANCELLED',
        claimToken: null,
        leaseUntil: null,
        lastError: 'ROLLING_INPUT_SUPERSEDED',
      },
    });
    // Resume a frozen candidate only after the current scan confirms the same input is due.
    const resumed = await tx.rollingPlanJob.updateMany({
      where: {
        ...window,
        inputRevision: data.inputRevision,
        state: 'CANCELLED',
        lastError: { in: ['PAUSED', WINDOW_NOT_DUE] },
      },
      data: {
        state: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        claimToken: null,
        leaseUntil: null,
        lastError: null,
      },
    });
    // Exhaust a bounded burst, then re-admit on the next day; blocked personal settings need new input.
    await tx.rollingPlanJob.updateMany({
      where: {
        planId: data.planId,
        kind: data.kind,
        windowStart: data.windowStart,
        policyId: data.policyId,
        inputRevision: data.inputRevision,
        state: 'FAILED',
        availableAt: { lte: new Date() },
      },
      data: { state: 'RETRY', attempts: 0, lastError: null },
    });
    const result = await tx.rollingPlanJob.createMany({
      data: {
        ...data,
        availableAt: data.availableAt ?? new Date(),
        receipt: json({ input }),
      },
      skipDuplicates: true,
    });
    return result.count + resumed.count;
  }

  /** Atomic competing-worker claim, including process-crash recovery and a fresh fencing token. */
  async claim() {
    return this.prisma.$transaction(async (tx) => {
      const claimAt = new Date();
      await tx.rollingPlanJob.updateMany({
        where: {
          state: 'RUNNING',
          attempts: { gte: MAX_ATTEMPTS },
          leaseUntil: { lte: claimAt },
        },
        data: {
          state: 'FAILED',
          claimToken: null,
          leaseUntil: null,
          lastError: 'ROLLING_RETRY_EXHAUSTED',
          availableAt: new Date(claimAt.getTime() + 86_400_000),
        },
      });
      const token = randomUUID();
      // Queue dates are stored as UTC timestamps and compared by Prisma elsewhere.
      const claimTimestamp = claimAt.toISOString().slice(0, -1);
      const leaseTimestamp = new Date(claimAt.getTime() + LEASE_MS)
        .toISOString()
        .slice(0, -1);
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        WITH picked AS (
          SELECT id FROM t_rolling_plan_job
          WHERE (
            (state IN ('PENDING', 'RETRY') AND available_at <= ${claimTimestamp}::timestamp)
            OR (state = 'RUNNING' AND lease_until <= ${claimTimestamp}::timestamp)
          ) AND attempts < ${MAX_ATTEMPTS}
          ORDER BY available_at, created_at
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE t_rolling_plan_job j
        SET state = 'RUNNING', claim_token = ${token},
            lease_until = ${leaseTimestamp}::timestamp,
            attempts = j.attempts + 1, updated_at = ${claimTimestamp}::timestamp
        FROM picked WHERE j.id = picked.id RETURNING j.id
      `;
      if (!rows.length) return null;
      return tx.rollingPlanJob.findUniqueOrThrow({ where: { id: rows[0].id } });
    });
  }
  async heartbeat(jobId: string, token: string) {
    const r = await this.prisma.rollingPlanJob.updateMany({
      where: {
        id: jobId,
        state: 'RUNNING',
        claimToken: token,
        leaseUntil: { gt: new Date() },
      },
      data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
    });
    if (r.count !== 1) fail('ROLLING_LEASE_LOST');
  }
  private async authorized(jobId: string, token: string, tx: PlanDb) {
    const before = await tx.rollingPlanJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { plan: true, policy: true },
    });
    await acquireHashtextAdvisoryXactLock(tx, before.plan.userId);
    const job = await tx.rollingPlanJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { plan: true, policy: true },
    });
    if (
      job.state !== 'RUNNING' ||
      job.claimToken !== token ||
      !job.leaseUntil ||
      job.leaseUntil.getTime() <= Date.now()
    )
      fail('ROLLING_LEASE_LOST');
    if (
      job.plan.status !== 'ACTIVE' ||
      job.plan.planningMode !== 'ROLLING' ||
      job.policy.revokedAt ||
      job.policy.userId !== job.plan.userId
    )
      fail('ROLLING_POLICY_REVOKED');
    await this.access.assertAllowed(job.plan.userId, tx);
    return job;
  }
  async prepare(jobId: string, token: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const job = await this.authorized(jobId, token, tx);
        const input = (
          job.receipt as {
            input?: {
              from: string;
              through: string;
              evidenceRevision: string;
              scanFrom?: string;
              scanThrough?: string;
              monthStrategyIds?: string[];
            };
          }
        )?.input;
        if (!input) fail('ROLLING_INPUT_MISSING');
        if (
          input.scanFrom &&
          input.scanThrough &&
          (
            await this.evidence(
              job.planId,
              input.scanFrom,
              input.scanThrough,
              tx,
            )
          ).revision !== input.evidenceRevision
        )
          fail('ROLLING_FACTS_CHANGED');
        const { plan, external, revision } = await this.evidence(
          job.planId,
          input.from,
          input.through,
          tx,
        );
        // Scan and submission both use a stable horizon, stored below for future revalidation.
        const months = await tx.rollingMonthStrategy.findMany({
          where: {
            id: { in: input.monthStrategyIds ?? [] },
            supersededAt: null,
            planId: job.planId,
            appliedAt: { not: null },
          },
        });
        if (months.length !== (input.monthStrategyIds ?? []).length)
          fail('ROLLING_MONTH_DEPENDENCY_CHANGED');
        const frozen = (job.receipt as { frozen?: unknown })?.frozen;
        const prepared = {
          jobId: job.id,
          userId: plan.userId,
          lang: this.users
            ? await this.users.getPreferredLocale(plan.userId)
            : 'en',
          inputRevision: job.inputRevision,
          kind: job.kind,
          windowStart: ymd(job.windowStart),
          from: input.from,
          through: input.through,
          planId: job.planId,
          policy: job.policy.settings,
          monthStrategies: months,
          facts: { plan, external },
        };
        if (frozen) return { input: frozen, revision };
        await tx.rollingPlanJob.update({
          where: { id: job.id },
          data: {
            receipt: json({
              input,
              frozen: prepared,
              preparedRevision: revision,
            }),
          },
        });
        return { input: prepared, revision };
      },
      { timeout: 60000 },
    );
  }
  async assertFresh(jobId: string, token: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const job = await this.authorized(jobId, token, tx);
        const receipt = job.receipt as {
          input: { from: string; through: string; monthStrategyIds?: string[] };
          preparedRevision: string;
        };
        if (
          (
            await this.evidence(
              job.planId,
              receipt.input.from,
              receipt.input.through,
              tx,
            )
          ).revision !== receipt.preparedRevision
        )
          fail('ROLLING_FACTS_CHANGED');
        const count = await tx.rollingMonthStrategy.count({
          where: {
            id: { in: receipt.input.monthStrategyIds ?? [] },
            supersededAt: null,
            planId: job.planId,
            appliedAt: { not: null },
          },
        });
        if (count !== (receipt.input.monthStrategyIds ?? []).length)
          fail('ROLLING_MONTH_DEPENDENCY_CHANGED');
      },
      { timeout: 60000 },
    );
  }
  async freezeModelInput(jobId: string, token: string, input: unknown) {
    await this.prisma.$transaction(async (tx) => {
      const job = await this.authorized(jobId, token, tx);
      await tx.rollingPlanJob.update({
        where: { id: jobId },
        data: { receipt: json({ ...(job.receipt as object), frozen: input }) },
      });
    });
  }
  async saveCandidate(
    jobId: string,
    token: string,
    candidate: unknown,
    runId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const job = await this.authorized(jobId, token, tx);
      await tx.rollingPlanJob.update({
        where: { id: jobId },
        data: {
          receipt: json({ ...(job.receipt as object), candidate, runId }),
        },
      });
    });
  }
  async complete(
    jobId: string,
    token: string,
    strategy?: RollingMonthDraft,
    reason?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const job = await this.authorized(jobId, token, tx);
        const receipt = job.receipt as {
          input: { from: string; through: string };
          preparedRevision: string;
          runId?: string;
        };
        if (
          (
            await this.evidence(
              job.planId,
              receipt.input.from,
              receipt.input.through,
              tx,
            )
          ).revision !== receipt.preparedRevision
        )
          fail('ROLLING_FACTS_CHANGED');
        let monthId: string | undefined;
        let changed = false;
        if (strategy) {
          if (
            job.kind !== 'MONTH' ||
            strategy.monthStart !== ymd(job.windowStart) ||
            (job.policy.settings as { autoPlanMonths?: boolean })
              .autoPlanMonths !== true
          )
            fail('ROLLING_MONTH_INVALID');
          parseRollingStartSettings(
            { policy: job.policy.settings, monthStrategies: [strategy] },
            strategy.monthStart,
          );
          const previous = await tx.rollingMonthStrategy.findFirst({
            where: {
              planId: job.planId,
              monthStart: job.windowStart,
              supersededAt: null,
              appliedAt: { not: null },
            },
          });
          if (previous) {
            monthId = previous.id;
          } else {
            changed = true;
            const latest = await tx.rollingMonthStrategy.aggregate({
              where: { planId: job.planId, monthStart: job.windowStart },
              _max: { revision: true },
            });
            const month = await tx.rollingMonthStrategy.create({
              data: {
                planId: job.planId,
                policyId: job.policyId,
                monthStart: job.windowStart,
                monthEnd: date(calendarMonthEnd(strategy.monthStart)),
                effectiveFrom: date(receipt.input.from),
                revision: (latest._max.revision ?? 0) + 1,
                strategy: json(strategy),
                evidenceRevision: receipt.preparedRevision,
                appliedAt: new Date(),
              },
            });
            monthId = month.id;
          }
        }
        await this.authorized(jobId, token, tx);
        const context = await tx.coachContext.findUniqueOrThrow({
          where: { planId: job.planId },
        });
        const commit = await tx.coachCommit.create({
          data: {
            contextId: context.id,
            commitMessage: strategy
              ? 'Automatic calendar month direction evaluated'
              : 'Automatic schedule unchanged',
          },
        });
        const result = {
          semanticRevision: (
            job.receipt as { input?: { semanticRevision?: string } }
          )?.input?.semanticRevision,
          executionSource: 'AUTOMATION_POLICY',
          jobId,
          policyRevision: job.policy.revision,
          monthStrategyId: monthId,
          changed,
          reason,
          runId: receipt.runId,
          commitId: commit.id,
          readbackVerified: true,
        };
        await tx.rollingPlanJob.update({
          where: { id: jobId },
          data: { state: 'APPLIED', receipt: json(result) },
        });
        return result;
      },
      { timeout: 60000 },
    );
  }
  async fail(job: RollingPlanJob, error: unknown, resumeAt?: Date) {
    const reason = error instanceof Error ? error.message : String(error);
    const needsInput = reason === 'ROLLING_CANDIDATE_NEEDS_INPUT';
    const stale =
      /ROLLING_(FACTS|MONTH_DEPENDENCY|POLICY)_|changed|reassess/i.test(reason);
    const state = resumeAt
      ? 'RETRY'
      : needsInput
        ? 'BLOCKED'
        : stale
          ? 'CANCELLED'
          : job.attempts >= MAX_ATTEMPTS
            ? 'FAILED'
            : 'RETRY';
    const updated = await this.prisma.rollingPlanJob.updateMany({
      where: { id: job.id, state: 'RUNNING', claimToken: job.claimToken },
      data: {
        state,
        ...(resumeAt ? { attempts: { decrement: 1 } } : {}),
        lastError: [reason, (error as { reason?: string })?.reason]
          .filter(Boolean)
          .join(': ')
          .slice(0, 500),
        leaseUntil: null,
        availableAt:
          resumeAt ??
          new Date(
            Date.now() +
              (state === 'FAILED'
                ? 86400000
                : Math.min(3600000, 60000 * 2 ** job.attempts)),
          ),
      },
    });
    return updated.count ? state : null;
  }
  async configure(
    userId: string,
    planId: string,
    enabled: boolean,
    settings?: unknown,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await acquireHashtextAdvisoryXactLock(tx, userId);
      const plan = await this.plans.findFirst(
        {
          where: {
            id: planId,
            userId,
            planningMode: 'ROLLING',
            status: { in: ['ACTIVE', 'PAUSED'] },
          },
        },
        tx,
      );
      if (!plan) fail('ROLLING_PLAN_NOT_FOUND');
      const latest = await tx.planAutomationPolicy.findFirst({
        where: { planId },
        orderBy: { revision: 'desc' },
      });
      if (!latest) fail('ROLLING_INITIAL_CONSENT_REQUIRED');
      const policySettings = settings ?? latest.settings;
      parseRollingStartSettings(
        {
          policy: policySettings,
          monthStrategies: [
            {
              monthStart: '2000-01-01',
              objective: 'validation',
              loadRange: null,
              durationMinutesRange: null,
              weekFocus: [],
            },
          ],
        },
        '2000-01-01',
      );
      if (
        enabled === (latest.revokedAt === null) &&
        (!enabled || hash(policySettings) === hash(latest.settings))
      ) {
        return { enabled, revision: latest.revision };
      }
      await tx.rollingPlanJob.updateMany({
        where: { planId, state: { in: ['PENDING', 'RUNNING', 'RETRY'] } },
        data: {
          state: 'CANCELLED',
          claimToken: null,
          leaseUntil: null,
          lastError: 'SETTINGS_CHANGED',
        },
      });
      await tx.planAutomationPolicy.updateMany({
        where: { planId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const policy = enabled
        ? await tx.planAutomationPolicy.create({
            data: {
              planId,
              userId,
              revision: latest.revision + 1,
              settings: json(policySettings),
              confirmedDecisionId: latest.confirmedDecisionId,
              effectiveFrom: date(
                activityCalendarYmdInZone(
                  new Date(),
                  plan.activationTimezone ?? 'UTC',
                )!,
              ),
            },
          })
        : null;
      if (enabled)
        await this.plans.update(
          {
            where: { id: planId },
            data: { goal: (policySettings as { goal: string }).goal },
          },
          tx,
        );
      const context = await tx.coachContext.findUniqueOrThrow({
        where: { planId },
      });
      await tx.coachCommit.create({
        data: {
          contextId: context.id,
          commitMessage: enabled
            ? 'User saved continuous training settings'
            : 'User disabled continuous training automation',
        },
      });
      return { enabled, revision: policy?.revision ?? latest.revision };
    });
  }
  async notificationsDue() {
    const pending = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM t_rolling_plan_job
       WHERE state = 'APPLIED' AND receipt IS NOT NULL
         AND receipt->>'baseline' IS DISTINCT FROM 'true'
         AND receipt->>'notifiedAt' IS NULL
         AND receipt->>'changed' IS DISTINCT FROM 'false'
       ORDER BY updated_at, id LIMIT 20`,
    );
    const jobs = await this.prisma.rollingPlanJob.findMany({
      where: { id: { in: pending.map((job) => job.id) }, state: 'APPLIED' },
      include: { plan: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    });
    return jobs.map((j) => ({
      id: j.id,
      planId: j.planId,
      userId: j.plan.userId,
      kind: j.kind,
      receipt: j.receipt,
    }));
  }
  async markNotified(jobId: string) {
    const job = await this.prisma.rollingPlanJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    if (job.state === 'APPLIED')
      await this.prisma.rollingPlanJob.update({
        where: { id: jobId },
        data: {
          receipt: json({
            ...(job.receipt as object),
            notifiedAt: new Date().toISOString(),
          }),
        },
      });
  }
  async statusForNotification(jobId: string) {
    const job = await this.prisma.rollingPlanJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { plan: true },
    });
    return {
      userId: job.plan.userId,
      lang: this.users
        ? await this.users.getPreferredLocale(job.plan.userId)
        : 'en',
    };
  }
  async status(
    userId: string,
    planId: string,
  ): Promise<RollingPlanAutomationStatus> {
    const plan = await this.plans.findFirst({
      where: { id: planId, userId },
    });
    if (!plan) fail('ROLLING_PLAN_NOT_FOUND');
    const jobs = await this.prisma.rollingPlanJob.findMany({
      where: { planId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 60,
    });
    const latest = await this.prisma.planAutomationPolicy.findFirst({
      where: { planId },
      orderBy: { revision: 'desc' },
    });
    let blockedReason: string | null = null;
    if (latest && !latest.revokedAt) {
      try {
        await this.prisma.$transaction((tx) =>
          this.access.assertAllowed(userId, tx),
        );
      } catch {
        blockedReason = 'ROLLING_AI_ACCESS_REQUIRED';
      }
    }
    return {
      enabled: Boolean(latest && !latest.revokedAt),
      revision: latest?.revision ?? null,
      hasAuthorization: Boolean(latest),
      blockedReason,
      jobs: jobs
        .filter((j) => !(j.receipt as { baseline?: boolean })?.baseline)
        .map((j) => ({
          id: j.id,
          kind: j.kind as RollingPlanAutomationJob['kind'],
          windowStart: ymd(j.windowStart),
          state: j.state as RollingPlanAutomationJob['state'],
          attempts: j.attempts,
          lastError: j.lastError,
          availableAt: j.availableAt.toISOString(),
        })),
    };
  }
}
