import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { FitnessAssessmentFollowupService } from '@/api/ai/fitness-assessment-followup.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { RuntimeJobSupervisor } from '@/runtime-capabilities/runtime-job-supervisor.service';
@Injectable()
export class FitnessAssessmentWorker implements OnModuleInit, OnModuleDestroy {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unregister: (() => void) | null = null;

  constructor(
    private readonly followup: FitnessAssessmentFollowupService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
    private readonly jobSupervisor?: RuntimeJobSupervisor,
  ) {}

  onModuleInit() {
    this.unregister =
      this.jobSupervisor?.register({
        id: 'ai.fitness-assessment',
        enabled: () => this.capabilities?.isEnabled('ai') !== false,
        start: () => this.start(),
        stop: () => this.stop(),
      }) ?? null;
    if (!this.jobSupervisor && this.capabilities?.isEnabled('ai') !== false) {
      this.start();
    }
  }

  onModuleDestroy() {
    this.unregister?.();
    this.unregister = null;
    this.stop();
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref?.();
    void this.tick();
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.capabilities?.isEnabled('ai') === false) return;
    if (this.running) return;
    this.running = true;
    try {
      await this.followup.tick();
    } finally {
      this.running = false;
    }
  }
}
