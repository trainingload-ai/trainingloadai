import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CronJob } from 'cron';
import { PrismaService } from '@/prisma/prisma.service';
import { AthleteStateFeatureFlags } from '@/athlete-state/athlete-state-feature-flags.service';
import { CoachAssessmentOrchestratorService } from './coach-assessment-orchestrator.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';

@Injectable()
export class CoachAssessmentFollowupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CoachAssessmentFollowupService.name);
  private running = false;
  private job?: CronJob;
  private unsubscribeCapabilityChange?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: AthleteStateFeatureFlags,
    private readonly orchestrator: CoachAssessmentOrchestratorService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  onModuleInit() {
    this.unsubscribeCapabilityChange = this.capabilities?.onChange?.(() =>
      this.reconcileJob(),
    );
    this.reconcileJob();
  }

  onModuleDestroy() {
    this.unsubscribeCapabilityChange?.();
    this.stopJob();
  }

  private enabled() {
    return (
      this.capabilities?.isEnabled('ai') !== false &&
      this.flags.followupEnabled()
    );
  }

  private reconcileJob() {
    if (!this.enabled()) {
      this.stopJob();
      return;
    }
    if (this.job) return;
    this.job = CronJob.from({
      cronTime: '0 */5 * * * *',
      onTick: () => void this.poll(),
      start: true,
    });
  }

  private stopJob() {
    this.job?.stop();
    this.job = undefined;
  }

  async poll() {
    if (
      this.running ||
      !this.enabled()
    )
      return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.prisma.coachAssessmentCase.findMany({
        where: {
          OR: [
            { status: 'WAITING_FOR_DATA' },
            { status: 'DECISION_READY', decisionId: null },
            { status: 'RESOLVED' },
          ],
          followUpAt: { lte: now },
          expiresAt: { gt: now },
        },
        orderBy: { followUpAt: 'asc' },
        take: 20,
        select: { id: true, userId: true, revision: true, status: true },
      });
      for (const item of due) {
        const claimed = await this.prisma.coachAssessmentCase.updateMany({
          where: {
            id: item.id,
            revision: item.revision,
            followUpAt: { lte: now },
          },
          data: { followUpAt: null, revision: { increment: 1 } },
        });
        if (claimed.count !== 1) continue;
        try {
          await this.orchestrator.assess({
            userId: item.userId,
            triggerType: 'FOLLOW_UP',
            triggerRef: item.id,
            preserveCaseId: item.status === 'RESOLVED' ? undefined : item.id,
          });
        } catch (error) {
          this.logger.warn(
            `Athlete State follow-up failed case=${item.id} error=${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      const expired = await this.prisma.coachAssessmentCase.findMany({
        where: {
          status: {
            in: [
              'OPEN',
              'ASSESSING',
              'WAITING_FOR_DATA',
              'WAITING_FOR_USER',
              'DECISION_READY',
            ],
          },
          expiresAt: { lte: now },
        },
        select: { id: true },
      });
      if (expired.length) {
        await this.prisma.$transaction([
          this.prisma.coachAssessmentCase.updateMany({
            where: { id: { in: expired.map((item) => item.id) } },
            data: {
              status: 'EXPIRED',
              resolvedAt: now,
              revision: { increment: 1 },
            },
          }),
          this.prisma.coachAssessmentQuestion.updateMany({
            where: {
              caseId: { in: expired.map((item) => item.id) },
              status: 'PENDING',
            },
            data: { status: 'EXPIRED' },
          }),
        ]);
      }
    } finally {
      this.running = false;
    }
  }
}
