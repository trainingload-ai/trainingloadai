import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ConfigType } from '@/config/config';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ActivityWeatherService,
  type ClaimedActivityWeatherJob,
} from '@/weather/activity-weather.service';
import { WorkerDrainProgress } from '../worker-drain-progress';

@Injectable()
export class ActivityWeatherWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ActivityWeatherWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<ConfigType, true>,
    private readonly activityWeather: ActivityWeatherService,
  ) {}

  onModuleInit() {
    if (!this.activityWeather.isEnabled()) return;
    this.timer = setInterval(() => {
      void this.drain().catch(() => {
        this.logger.error('[活动天气队列] 拉取失败 code=QUEUE_DRAIN_FAILED');
      });
    }, this.settings().pollMs);
    void this.drain();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private settings() {
    return this.config.get('activityWeather', { infer: true });
  }

  private async claimBatch(): Promise<ClaimedActivityWeatherJob[]> {
    const lockToken = randomUUID();
    const { batchSize, leaseMs } = this.settings();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        activity_id: number;
        user_id: string;
        attempt_count: number;
      }>
    >`
      WITH picked AS (
        SELECT id
        FROM t_activity_weather_snapshot
        WHERE (
          status = 'PENDING'
          AND available_at <= NOW()
        ) OR (
          status = 'PROCESSING'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at <= NOW()
        )
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_activity_weather_snapshot snapshot
      SET
        status = 'PROCESSING',
        attempt_count = snapshot.attempt_count + 1,
        last_attempt_at = NOW(),
        lease_expires_at = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
        lock_token = ${lockToken},
        updated_at = NOW()
      FROM picked
      WHERE snapshot.id = picked.id
      RETURNING
        snapshot.id,
        snapshot.activity_id,
        snapshot.user_id,
        snapshot.attempt_count;
    `;
    return rows.map((row) => ({
      id: row.id,
      activityId: row.activity_id,
      userId: row.user_id,
      attemptCount: row.attempt_count,
      lockToken,
    }));
  }

  private async processJob(job: ClaimedActivityWeatherJob) {
    try {
      await this.activityWeather.processClaimed(job);
    } catch (error) {
      await this.activityWeather.handleFailure(job, error);
      this.logger.warn(
        `[活动天气队列] 处理失败 jobId=${job.id} activityId=${job.activityId} code=SNAPSHOT_ATTEMPT_FAILED`,
      );
    }
  }

  private async drain() {
    if (this.stopping || this.draining) return;
    this.draining = true;
    const progress = new WorkerDrainProgress(
      this.logger,
      '活动天气队列',
      async () => {
        const [waiting, running] = await Promise.all([
          this.prisma.activityWeatherSnapshot.count({
            where: { status: 'PENDING' },
          }),
          this.prisma.activityWeatherSnapshot.count({
            where: { status: 'PROCESSING' },
          }),
        ]);
        return { remaining: waiting + running, waiting, running };
      },
    );
    try {
      while (!this.stopping) {
        const batch = await this.claimBatch();
        if (!batch.length) return;
        let index = 0;
        const runners = Array.from(
          {
            length: Math.min(this.settings().concurrency, batch.length),
          },
          async () => {
            while (index < batch.length && !this.stopping) {
              const job = batch[index]!;
              const batchPosition = index + 1;
              index += 1;
              await progress.run({
                batchPosition,
                batchTotal: batch.length,
                details: `jobId=${job.id} activityId=${job.activityId}`,
                task: () => this.processJob(job),
              });
            }
          },
        );
        await Promise.all(runners);
      }
    } finally {
      this.draining = false;
    }
  }
}
