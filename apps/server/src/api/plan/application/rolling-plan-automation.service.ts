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
import { addCalendarDays, calendarIsoWeekday } from '@shared/plan-calendar';
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
  async discover(now = new Date()) {
    const policies = await this.prisma.planAutomationPolicy.findMany({
      where: {
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
      const through = addCalendarDays(
        week,
        calendarIsoWeekday(today) >= 5 ? 13 : 6,
      );
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
            const evidence = await this.evidence(plan.id, from, through, tx);
            const months = new Set([from.slice(0, 7), through.slice(0, 7)]);
            if (today >= addCalendarDays(calendarMonthEnd(today), -7))
              months.add(
                addCalendarDays(calendarMonthEnd(today), 1).slice(0, 7),
              );
            let count = 0;
            for (const month of months) {
              const start = `${month}-01`;
              const currentMonth = await tx.rollingMonthStrategy.findFirst({
                where: {
                  planId: plan.id,
                  policyId: policy.id,
                  monthStart: date(start),
                  supersededAt: null,
                  appliedAt: { not: null },
                },
              });
              // A missing direction is required immediately. Existing directions re-evaluate only on external changes.
              const last = await tx.rollingPlanJob.findFirst({
                where: {
                  planId: plan.id,
                  policyId: policy.id,
                  kind: 'MONTH',
                  windowStart: date(start),
                  state: 'APPLIED',
                },
                orderBy: { createdAt: 'desc' },
              });
              if (currentMonth && !last)
                await tx.rollingPlanJob.createMany({
                  data: {
                    planId: plan.id,
                    policyId: policy.id,
                    kind: 'MONTH',
                    windowStart: date(start),
                    inputRevision: evidence.revision,
                    state: 'APPLIED',
                    receipt: json({
                      baseline: true,
                      semanticRevision: evidence.revision,
                    }),
                  },
                  skipDuplicates: true,
                });
              if (
                !currentMonth ||
                (last &&
                  ((last.receipt as { semanticRevision?: string })
                    ?.semanticRevision ?? last.inputRevision) !==
                    evidence.revision)
              )
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
              const covered = generations.some(
                (g) =>
                  ymd(g.generatedFrom) <= first &&
                  ymd(g.generatedThrough) >= end,
              );
              const deps = await tx.rollingMonthStrategy.findMany({
                where: {
                  planId: plan.id,
                  policyId: policy.id,
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
              const previous = await tx.rollingPlanJob.findFirst({
                where: {
                  planId: plan.id,
                  policyId: policy.id,
                  kind: { in: ['WEEK', 'ADJUST'] },
                  windowStart: date(start),
                  state: 'APPLIED',
                },
                orderBy: { createdAt: 'desc' },
              });
              if (covered && !previous && generations[0].policyId === policy.id)
                await tx.rollingPlanJob.createMany({
                  data: {
                    planId: plan.id,
                    policyId: policy.id,
                    kind: 'ADJUST',
                    windowStart: date(start),
                    inputRevision,
                    state: 'APPLIED',
                    receipt: json({ baseline: true, semanticRevision }),
                  },
                  skipDuplicates: true,
                });
              if (
                !covered ||
                (previous &&
                  ((previous.receipt as { semanticRevision?: string })
                    ?.semanticRevision ?? previous.inputRevision) !==
                    semanticRevision) ||
                (covered && generations[0].policyId !== policy.id)
              )
                count += await this.enqueue(
                  tx,
                  {
                    planId: plan.id,
                    policyId: policy.id,
                    kind: covered ? 'ADJUST' : 'WEEK',
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
    await tx.rollingPlanJob.updateMany({
      where: {
        planId: data.planId,
        kind: data.kind,
        policyId: data.policyId,
        windowStart: data.windowStart,
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
    // Only a same-input pause can resume a frozen candidate. Discovery has already
    // checked the active policy and current facts; prepare/apply revalidate them.
    const resumed = await tx.rollingPlanJob.updateMany({
      where: {
        planId: data.planId,
        kind: data.kind,
        policyId: data.policyId,
        windowStart: data.windowStart,
        inputRevision: data.inputRevision,
        state: 'CANCELLED',
        lastError: 'PAUSED',
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
      data: { ...data, receipt: json({ input }) },
      skipDuplicates: true,
    });
    return result.count + resumed.count;
  }

  /** Atomic competing-worker claim, including process-crash recovery and a fresh fencing token. */
  async claim() {
    return this.prisma.$transaction(async (tx) => {
      await tx.rollingPlanJob.updateMany({
        where: {
          state: 'RUNNING',
          attempts: { gte: MAX_ATTEMPTS },
          leaseUntil: { lte: new Date() },
        },
        data: {
          state: 'FAILED',
          claimToken: null,
          leaseUntil: null,
          lastError: 'ROLLING_RETRY_EXHAUSTED',
          availableAt: new Date(Date.now() + 86400000),
        },
      });
      const token = randomUUID();
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `WITH picked AS (SELECT id FROM t_rolling_plan_job WHERE ((state IN ('PENDING','RETRY') AND available_at <= now()) OR (state='RUNNING' AND lease_until <= now())) AND attempts < $1 ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE t_rolling_plan_job j SET state='RUNNING',claim_token=$2,lease_until=now()+interval '5 minutes',attempts=j.attempts+1,updated_at=now() FROM picked WHERE j.id=picked.id RETURNING j.id`,
        MAX_ATTEMPTS,
        token,
      );
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
            policyId: job.policyId,
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
            policyId: job.policyId,
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
          if (
            previous?.policyId === job.policyId &&
            hash(previous.strategy) === hash(strategy)
          )
            monthId = previous.id;
          else {
            changed = true;
            if (previous)
              await tx.rollingMonthStrategy.update({
                where: { id: previous.id },
                data: { supersededAt: new Date() },
              });
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
            if (previous)
              await tx.rollingPlanJob.updateMany({
                where: {
                  planId: job.planId,
                  policyId: job.policyId,
                  kind: { in: ['WEEK', 'ADJUST'] },
                  state: { in: ['PENDING', 'RUNNING', 'RETRY'] },
                  windowStart: {
                    gte: date(isoWeekStart(strategy.monthStart)),
                    lte: date(calendarMonthEnd(strategy.monthStart)),
                  },
                },
                data: {
                  state: 'CANCELLED',
                  claimToken: null,
                  leaseUntil: null,
                  lastError: 'ROLLING_MONTH_DEPENDENCY_CHANGED',
                },
              });
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
    const state = needsInput
      ? 'BLOCKED'
      : stale
        ? 'CANCELLED'
        : job.attempts >= MAX_ATTEMPTS
          ? 'FAILED'
          : 'RETRY';
    await this.prisma.rollingPlanJob.updateMany({
      where: { id: job.id, state: 'RUNNING', claimToken: job.claimToken },
      data: {
        state,
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
