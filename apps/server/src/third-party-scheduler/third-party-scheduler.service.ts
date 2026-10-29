import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { ThirdPartyScheduledTaskRegistry } from './third-party-scheduled-task.registry';
import type { ThirdPartyScheduleContext } from './third-party-scheduled-task';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';

const JOB_NAME = 'third-party-scheduler';
const DEFAULT_CRON = '*/15 * * * *';

/**
 * The only cron owner for third-party integrations.
 * It owns timing and overlap protection, then dispatches provider tasks.
 */
@Injectable()
export class ThirdPartySchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ThirdPartySchedulerService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
    private readonly tasks: ThirdPartyScheduledTaskRegistry,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  onModuleInit() {
    if (
      this.capabilities?.isEnabled('third-party-sync') === false &&
      this.capabilities?.isEnabled('intervals-icu-api-key') === false
    ) {
      this.logger.log('[third-party-scheduler] capability disabled');
      return;
    }
    const expression =
      this.config.get<string>('thirdPartyScheduler.cron') ?? DEFAULT_CRON;
    const job = new CronJob(expression, () => {
      void this.runOnce().catch((error) => {
        this.logger.error(
          `[third-party-scheduler] 调度失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    });
    this.scheduler.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(
      `[third-party-scheduler] 注册表达式="${expression}" 任务=${this.tasks.taskNames().join(',')}`,
    );
  }
  // 模块销毁时停止定时任务
  onModuleDestroy() {
    try {
      this.scheduler.getCronJob(JOB_NAME).stop();
      this.scheduler.deleteCronJob(JOB_NAME);
    } catch {
      // Initialization may have failed before the shared job was registered.
    }
  }

  private scheduleContext(): ThirdPartyScheduleContext {
    return {
      startHourLocal:
        this.config.get<number>('thirdPartyScheduler.startHourLocal') ?? 2,
      staleStartedMinutes:
        this.config.get<number>('thirdPartyScheduler.staleStartedMinutes') ??
        60,
      batchSize: this.config.get<number>('thirdPartyScheduler.batchSize') ?? 20,
    };
  }

  // 运行一次调度
  async runOnce() {
    if (this.running) {
      this.logger.debug('[third-party-scheduler] 已经在运行中，跳过重叠调度');
      return [];
    }
    this.running = true;
    try {
      const results = await this.tasks.runAll(this.scheduleContext());
      for (const result of results) {
        if (result.status === 'FAILED') {
          this.logger.warn(
            `[third-party-scheduler] 任务=${result.name} 失败: ${result.error}`,
          );
        }
      }
      return results;
    } finally {
      this.running = false;
    }
  }
}
