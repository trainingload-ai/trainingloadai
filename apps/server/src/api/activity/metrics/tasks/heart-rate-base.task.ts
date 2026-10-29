import { Injectable } from '@nestjs/common';
import { Gender } from '@prisma/client';
import type { SportType } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { round } from 'lodash';
import { computeAerobicDecoupling } from '@/algorithm/AerobicDecoupling';
import {
  averageKnownValues,
  resampleObservedValues,
} from '@/algorithm/time-series-metrics';
import { calculateMaxHrDrop } from '@/algorithm/heart-rate';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import { UserService } from '@/api/user/user.service';

@Injectable()
export class HeartRateBaseTask implements MetricsTask {
  key = 'heartRateBase' as const;

  constructor(
    private readonly userService: UserService,
    private readonly persistence: AnalyzePersistenceService,
  ) {}

  private async loadHrInputs(args: {
    userId: string;
    sportType: SportType;
    startTime: Date;
  }) {
    const profile = await this.userService.getComposedUserProfile(
      args.userId,
      args.sportType,
      args.startTime,
    );
    const [hrThreshold, zoneSetting] = await Promise.all([
      this.userService.getUserHeartRateThreshold(
        args.userId,
        args.sportType,
        args.startTime,
      ),
      this.userService.getHeartRateZoneSetting(
        args.userId,
        args.sportType,
        profile,
      ),
    ]);

    return { profile, hrThreshold, zoneSetting };
  }

  async pre(ctx: MetricsContext) {
    const { activity, userId } = ctx.inputs;
    if (!userId || !activity?.id || !activity.startTime) return ctx;

    let next = ctx;

    if (
      !next.cache.profile ||
      !next.cache.hrThreshold ||
      !next.cache.heartRateZoneSetting
    ) {
      const loaded = await this.loadHrInputs({
        userId,
        sportType: activity.sportType,
        startTime: activity.startTime,
      });
      next = {
        ...next,
        cache: {
          ...next.cache,
          profile: next.cache.profile ?? loaded.profile,
          hrThreshold: next.cache.hrThreshold ?? loaded.hrThreshold,
          heartRateZoneSetting:
            next.cache.heartRateZoneSetting ?? loaded.zoneSetting,
        },
      };
    }

    const profile = next.cache.profile;
    if (profile && !profile.gender) {
      next = {
        ...next,
        cache: { ...next.cache, profile: { ...profile, gender: Gender.MALE } },
      };
    }

    return next;
  }

  async exec(ctx: MetricsContext) {
    const rows = ctx.inputs.canonicalRecords ?? [];
    if (!rows.length) return ctx;

    const sensorData = rows.map((r) => ({
      time: r.time,
      tMs: new Date(r.time).getTime(),
      distance: r.distance == null ? '' : String(r.distance),
      heartRate: r.heartRate,
      power: r.power,
      speed: r.enhancedSpeed ?? r.speed,
      enhancedSpeed: r.enhancedSpeed,
    }));
    const hrRecords = sensorData
      .map((r) => r.heartRate)
      .filter((v): v is number => v !== undefined && v !== null && v > 0);

    if (!sensorData.length || hrRecords.length < 2) return ctx;

    const avg = averageKnownValues(
      resampleObservedValues(
        sensorData.map((record) => ({
          tMs: record.tMs,
          value:
            typeof record.heartRate === 'number' &&
            Number.isFinite(record.heartRate) &&
            record.heartRate > 0
              ? record.heartRate
              : null,
        })),
      ).values,
    );
    if (!(avg > 0)) return ctx;
    const base = {
      avg,
      max: Math.max(...hrRecords),
      min: Math.min(...hrRecords),
      // 以配速为基准的配速/功率脱钩率
      paHr: computeAerobicDecoupling(sensorData, 'speed'),
      // 以功率为基准的心率脱钩率
      pwHr: computeAerobicDecoupling(sensorData, 'power'),
      // 最大心率下降值
      maxHrDrop: calculateMaxHrDrop(sensorData),
    };

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        heartRateBase: {
          avg: round(base.avg, 2),
          max: round(base.max, 2),
          min: round(base.min, 2),
          paHr: round(base.paHr, 2),
          pwHr: round(base.pwHr, 2),
          maxHrDrop: round(base.maxHrDrop, 2),
        },
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const base = ctx.outputs.heartRateBase;
    if (!activity?.id || !base) return ctx;
    await this.persistence.saveActivityHeartRateBaseFields(activity.id, base);
    return ctx;
  }
}
