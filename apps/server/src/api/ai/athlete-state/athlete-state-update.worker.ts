import {
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RuntimeJobSupervisor } from '@/runtime-capabilities/runtime-job-supervisor.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { AthleteStateFeatureFlags } from '@/athlete-state/athlete-state-feature-flags.service';
import { AthleteStateUpdateQueue } from '@/athlete-state/updates/athlete-state-update-queue.service';
import {
  AthleteStateUpdates,
  ATHLETE_STATE_UPDATE_WAKE,
} from '@/athlete-state/updates/athlete-state-updates.service';
import { withAthleteStateLease } from '@/athlete-state/updates/athlete-state-execution-context';
import { AthleteStateUpdateSkipReason } from '@/athlete-state/updates/athlete-state-update.types';
import { CoachAssessmentOrchestratorService } from './coach-assessment-orchestrator.service';

@Injectable()
export class AthleteStateUpdateWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AthleteStateUpdateWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private unregister?: () => void;
  private running = false;
  constructor(
    private readonly supervisor: RuntimeJobSupervisor,
    private readonly capabilities: RuntimeCapabilityService,
    private readonly flags: AthleteStateFeatureFlags,
    private readonly queue: AthleteStateUpdateQueue,
    private readonly updates: AthleteStateUpdates,
    private readonly orchestrator: CoachAssessmentOrchestratorService,
  ) {}
  private enabled() {
    return this.capabilities.isEnabled('ai') && this.flags.evidenceEnabled();
  }
  onModuleInit() {
    this.unregister = this.supervisor.register({
      id: 'athlete-state-updates',
      enabled: () => this.enabled(),
      start: () => {
        this.timer ??= setInterval(
          () =>
            void this.tick().catch((e) =>
              this.logger.error(
                `Athlete State queue poll failed: ${e instanceof Error ? e.name : 'Error'}`,
              ),
            ),
          1_000,
        );
        this.timer.unref();
      },
      stop: () => {
        clearInterval(this.timer);
        this.timer = undefined;
      },
    });
  }
  onModuleDestroy() {
    this.unregister?.();
  }
  @OnEvent(ATHLETE_STATE_UPDATE_WAKE, { suppressErrors: false })
  wake(input: { userId: string }) {
    return this.tick(input.userId);
  }

  async tick(userId?: string) {
    if (this.running || !this.enabled()) return;
    this.running = true;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const job = await this.queue.claim(userId);
      if (!job) return;
      const started = Date.now();
      let leaseLost = false;
      heartbeat = setInterval(
        () =>
          void this.queue.heartbeat(job).catch(() => {
            leaseLost = true;
          }),
        15_000,
      );
      heartbeat.unref();
      try {
        const eligible = [];
        let lastReason: string | undefined;
        for (const trigger of job.running_triggers) {
          const reason = await this.updates.eligibility(
            job.user_id,
            trigger.explicit === true,
          );
          if (reason) {
            lastReason = reason;
            continue;
          }
          eligible.push(trigger);
        }
        let completed = 0;
        await withAthleteStateLease(job, async () => {
          if (eligible.length) {
            if (leaseLost) throw new Error('ATHLETE_STATE_UPDATE_LEASE_LOST');
            await this.queue.heartbeat(job);
            const trigger = eligible[eligible.length - 1];
            const result = await this.orchestrator.assess({
              userId: job.user_id,
              triggerType: trigger.triggerType,
              triggerRef: trigger.triggerRef,
              explicit: eligible.some((item) => item.explicit === true),
              requestVersion: job.running_version,
            });
            if (result && 'skipped' in result && result.skipped)
              lastReason = result.reason;
            else completed += 1;
          }
        });
        await this.queue.finish(
          job,
          completed
            ? undefined
            : (lastReason ?? AthleteStateUpdateSkipReason.NO_ELIGIBLE_REQUESTS),
        );
        this.logger.debug(
          `Athlete State update completed task=${job.user_id} version=${job.running_version} triggers=${job.running_triggers.length} elapsedMs=${Date.now() - started}`,
        );
      } catch (error) {
        const response =
          error instanceof HttpException ? error.getResponse() : null;
        const code =
          response && typeof response === 'object' && 'code' in response
            ? String(response.code)
            : null;
        if (
          code === 'AI_DATA_CONSENT_REQUIRED' ||
          code === 'AI_ACCESS_REQUIRED' ||
          Object.values(AthleteStateUpdateSkipReason).includes(
            code as AthleteStateUpdateSkipReason,
          )
        ) {
          await this.queue.finish(job, code);
          this.logger.debug(
            `Athlete State update skipped task=${job.user_id} reason=${code}`,
          );
        } else {
          const reason =
            error instanceof Error &&
            error.message === 'ATHLETE_STATE_UPDATE_LEASE_LOST'
              ? error.message
              : 'ASSESSMENT_FAILED';
          await this.queue.fail(job, reason);
          this.logger.warn(
            `Athlete State update failed task=${job.user_id} version=${job.running_version} reason=${reason}`,
          );
        }
      }
    } finally {
      clearInterval(heartbeat);
      this.running = false;
    }
  }
}
