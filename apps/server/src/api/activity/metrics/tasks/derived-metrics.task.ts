import { Injectable } from '@nestjs/common';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { AlgorithmService } from '@/analyze/algorithm.service';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class DerivedMetricsTask implements MetricsTask {
  key = 'derivedMetrics' as const;
  constructor(
    private readonly algorithmService: AlgorithmService,
    private readonly sensorDataService: SensorDataService,
    private readonly prisma: PrismaService,
  ) {}
  async pre(ctx: MetricsContext) {
    return ctx;
  }
  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    // 根据上升、下降 来推算真实的 distance
    const { effectiveDistance } = this.algorithmService.computeDerivedMetrics({
      distance: activity.distance ?? 0,
      ascent: activity.ascent ?? 0,
      descent: activity.descent ?? 0,
    });

    // 计算左右平衡
    const avgLeftRightBalance =
      await this.sensorDataService.getAvgLeftRightBalance(
        activity.id,
        activity.sportType || undefined,
      );
    // 更新对应字段
    await this.prisma.activity.update({
      where: { id: activity.id },
      data: { effectiveDistance, avgLeftRightBalance },
    });
    return ctx;
  }
  async post(ctx: MetricsContext) {
    return ctx;
  }
}
