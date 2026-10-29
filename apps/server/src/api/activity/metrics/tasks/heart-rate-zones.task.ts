import { Injectable } from '@nestjs/common';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { fillTimedValuesToZones } from '@/utils/zones';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import { UserService } from '@/api/user/user.service';

@Injectable()
export class HeartRateZonesTask implements MetricsTask {
  key = 'heartRateZones' as const;

  constructor(
    private readonly persistence: AnalyzePersistenceService,
    private readonly userService: UserService,
  ) {}

  async pre(ctx: MetricsContext) {
    const { activity, userId } = ctx.inputs;
    if (!userId || !activity?.id) return ctx;

    let next = ctx;

    if (!next.cache.heartRateZoneSetting) {
      const profile =
        next.cache.profile ??
        (await this.userService.getComposedUserProfile(
          userId,
          activity.sportType,
          activity.startTime ?? undefined,
        ));
      const zoneSetting = await this.userService.getHeartRateZoneSetting(
        userId,
        activity.sportType,
        profile,
      );
      next = {
        ...next,
        cache: {
          ...next.cache,
          profile: next.cache.profile ?? profile,
          heartRateZoneSetting: zoneSetting,
        },
      };
    }

    return next;
  }

  async exec(ctx: MetricsContext) {
    const zoneSetting = ctx.cache.heartRateZoneSetting;
    const rows = ctx.inputs.canonicalRecords ?? [];
    if (!zoneSetting?.zones?.length || !rows.length) return ctx;

    const zoneValues = fillTimedValuesToZones(
      rows.map((record) => ({
        tMs: record.tMs,
        value:
          typeof record.heartRate === 'number' &&
          Number.isFinite(record.heartRate) &&
          record.heartRate > 0
            ? record.heartRate
            : null,
      })),
      zoneSetting.zones,
    );
    if (!zoneValues.some((zone) => (zone.duration ?? 0) > 0)) return ctx;

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        heartRateZones: {
          zone: {
            benchmark: zoneSetting?.benchmark,
            zones: zoneValues || [],
          },
        },
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const zones = ctx.outputs.heartRateZones?.zone?.zones;
    if (!activity?.id || !zones?.length) return ctx;
    await this.persistence.saveActivityHeartRateZoneRows(activity.id, zones);
    return ctx;
  }
}
