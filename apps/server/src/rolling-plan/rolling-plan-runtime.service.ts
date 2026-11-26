import { I18nService } from 'nestjs-i18n';
import {
  Injectable,
  Optional,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CronJob } from 'cron';
import { addCalendarDays } from '@shared/plan-calendar';
import { findComparablePreviousMonth, isoWeekStart } from '@shared/rolling-plan';
import { activityCalendarYmdInZone } from '@/api/plan/plan-link-calendar.util';
import { PlanStartService } from '@/api/plan/application/plan-start.service';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { RollingPlanAutomationService } from '@/api/plan/application/rolling-plan-automation.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { ReviewModelDeferredError } from '@/review/review-model-call-guard';
import { RollingPlanCandidateService } from './rolling-plan-candidate.service';
import type {
  RollingPlanCandidateInput,
  RollingPlanCandidate,
} from './rolling-plan-candidate.types';

const DISCOVERY_INTERVAL_MS = 60 * 60_000;

/** Runs independently of app visits and review notification preferences. */
@Injectable()
export class RollingPlanRuntimeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RollingPlanRuntimeService.name);
  private cron?: CronJob;
  private unsubscribe?: () => void;
  private running = false;
  private lastDiscoveryHour?: number;
  constructor(
    private readonly queue: RollingPlanAutomationService,
    private readonly candidates: RollingPlanCandidateService,
    private readonly starts: PlanStartService,
    private readonly queries: PlanQueryService,
    private readonly capabilities: RuntimeCapabilityService,
    private readonly notifications: NotificationDomainService,
    @Optional() private readonly i18n?: I18nService,
  ) {}
  onModuleInit() {
    this.unsubscribe = this.capabilities.onChange(() => this.reconcile());
    this.reconcile();
  }
  private reconcile() {
    if (!this.capabilities.isEnabled('ai')) {
      this.cron?.stop();
      this.cron = undefined;
      return;
    }
    if (!this.cron)
      this.cron = CronJob.from({
        cronTime: '*/5 * * * *',
        onTick: () => void this.tick(),
        start: true,
      });
  }
  onModuleDestroy() {
    this.cron?.stop();
    this.unsubscribe?.();
  }
  private async deliverCommittedResults() {
    for (const job of await this.queue.notificationsDue()) {
      try {
        const { lang } = await this.queue.statusForNotification(job.id);
        await this.notifications.ensureNotification({
          userId: job.userId,
          kind: 'REVIEW_DIGEST',
          dedupeKey: `rolling:${job.id}:applied`,
          title: String(
            this.i18n?.t(
              `common.notification.rollingPlan.${job.kind === 'MONTH' ? 'titleMonthApplied' : 'titleWeekApplied'}`,
              { lang },
            ) ?? 'Continuous training updated',
          ),
          bodyMarkdown: (job.receipt as { reason?: string })?.reason,
          data: {
            planId: job.planId,
            jobId: job.id,
            executionSource: 'AUTOMATION_POLICY',
          },
        });
        await this.queue.markNotified(job.id);
      } catch (error) {
        this.logger.warn(
          `Rolling result notification deferred job=${job.id} error=${String(error)}`,
        );
      }
    }
  }
  async tick(now = new Date()) {
    if (this.running || !this.capabilities.isEnabled('ai')) return;
    this.running = true;
    try {
      await this.deliverCommittedResults();
      const hour = Math.floor(now.getTime() / DISCOVERY_INTERVAL_MS);
      if (this.lastDiscoveryHour !== hour) {
        await this.queue.discover(now);
        this.lastDiscoveryHour = hour;
      }
      for (let index = 0; index < 8; index++) {
        if (!this.capabilities.isEnabled('ai')) break;
        const job = await this.queue.claim();
        if (!job) break;
        const token = job.claimToken!;
        let leaseLost = false;
        const heartbeat = setInterval(
          () =>
            void this.queue.heartbeat(job.id, token).catch(() => {
              leaseLost = true;
            }),
          30000,
        );
        try {
          this.capabilities.require('ai');
          const prepared = await this.queue.prepare(job.id, token);
          let input = prepared.input as RollingPlanCandidateInput;
          const persisted = job.receipt as {
            candidate?: RollingPlanCandidate;
            runId?: string;
          } | null;
          let candidate = persisted?.candidate;
          if (!candidate) {
            const facts = input.facts as {
              plan: { activationTimezone?: string | null };
              loadObservation?: unknown;
              recentWeeks?: unknown;
            };
            if (!facts.loadObservation || !facts.recentWeeks) {
              const today =
                activityCalendarYmdInZone(
                  now,
                  facts.plan.activationTimezone ?? 'UTC',
                ) ?? now.toISOString().slice(0, 10);
              const beforeWindow = addCalendarDays(input.from, -1);
              const historyThrough =
                today < beforeWindow ? today : beforeWindow;
              const historyFrom = addCalendarDays(
                isoWeekStart(historyThrough),
                -21,
              );
              const [loadObservation, history] = await Promise.all([
                facts.loadObservation ??
                  this.queries.windowSnapshot(
                    input.userId,
                    input.planId,
                    input.from,
                    input.through,
                  ),
                this.queries.windowSnapshot(
                  input.userId,
                  input.planId,
                  historyFrom,
                  historyThrough,
                  {
                    includeWeeklyReview: true,
                  },
                ),
              ]);
              const previousMonthDirection =
                input.kind === 'MONTH'
                  ? findComparablePreviousMonth(
                      { monthStart: input.windowStart, effectiveFrom: input.from },
                      history.monthDirections,
                    )
                  : undefined;
              input = {
                ...input,
                facts: {
                  ...facts,
                  loadObservation,
                  recentWeeks: history.weeklyReview,
                  ...(previousMonthDirection ? { previousMonthDirection } : {}),
                },
              };
              await this.queue.freezeModelInput(job.id, token, input);
            }
            const result = await this.candidates.propose(input);
            candidate = result.result;
            await this.queue.saveCandidate(
              job.id,
              token,
              candidate,
              result.runId,
            );
          }
          if (leaseLost) throw new Error('ROLLING_LEASE_LOST');
          this.capabilities.require('ai');
          await this.queue.assertFresh(job.id, token);
          let changed = true;
          if (candidate.kind === 'MONTH')
            changed = (
              await this.queue.complete(
                job.id,
                token,
                candidate.strategy,
                candidate.reason,
              )
            ).changed;
          else {
            const request = candidate.schedule;
            if (
              job.kind === 'ADJUST' &&
              !request.changes.length &&
              !request.additions.length &&
              !request.deletions.length
            )
              changed = (
                await this.queue.complete(
                  job.id,
                  token,
                  undefined,
                  candidate.reason,
                )
              ).changed;
            else {
              await this.starts.createAutomationPreview(job.id, token, request);
              const applied = await this.starts.applyAutomation(job.id, token);
              changed = (applied as { changed?: boolean })?.changed !== false;
            }
          }
          if (changed) {
            await this.deliverCommittedResults();
            // A publication can unlock a dependent window for this plan.
            await this.queue.discover(now, job.planId);
          }
        } catch (error) {
          const state = await this.queue.fail(
            job,
            error,
            error instanceof ReviewModelDeferredError
              ? error.resumeAt
              : undefined,
          );
          if (state === 'BLOCKED') {
            try {
              const prepared = await this.queue.statusForNotification(job.id);
              await this.notifications.ensureNotification({
                userId: prepared.userId,
                kind: 'REVIEW_DIGEST',
                dedupeKey: `rolling:${job.planId}:${job.windowStart.toISOString().slice(0, 10)}:needs-input`,
                title: String(
                  this.i18n?.t('common.notification.rollingPlan.titleBlocked', {
                    lang: prepared.lang,
                  }) ?? 'Continuous training needs attention',
                ),
                bodyMarkdown: (error as { reason?: string })?.reason,
                data: { planId: job.planId, jobId: job.id, state: 'BLOCKED' },
              });
            } catch (notificationError) {
              this.logger.warn(
                `Rolling failure notification failed job=${job.id} error=${String(notificationError)}`,
              );
            }
          }
          this.logger.warn(
            `Rolling task deferred job=${job.id} error=${String(error)}`,
          );
        } finally {
          clearInterval(heartbeat);
        }
      }
    } catch (error) {
      this.logger.error(`Rolling runtime tick failed error=${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
