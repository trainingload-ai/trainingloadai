import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityReadService } from './activity-read.service';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { buildActivityChartSeries } from './activity-chart-series';
import type { ExplorationQuery } from '@shared/training-exploration';
import {
  summarizeActivitySeries,
  type ActivitySeriesOptions,
} from './activity-series-summary';

/** Activity owns authorization and the sensor-data query; Coach only sees a bounded readout. */
@Injectable()
export class ActivitySeriesQueryService {
  constructor(
    private readonly activities: ActivityReadService,
    private readonly sensors: SensorDataService,
  ) {}

  async chart(
    userId: string,
    hashId: string,
    options: ExplorationQuery,
    timezone = 'UTC',
  ) {
    const activity = await this.activities.findReadyByHashId(userId, hashId);
    if (!activity) throw new NotFoundException('Activity not found');
    const cap = 120000;
    const rows = await this.sensors.getRecordSeriesMulti(
      activity.id,
      [
        'heartRate',
        'power',
        'enhancedSpeed',
        'speed',
        'cadence',
        'grade',
        'altitude',
        'enhancedAltitude',
      ],
      undefined,
      cap + 1,
    );
    return {
      sportType: activity.sportType,
      truncated: rows.length > cap,
      ...buildActivityChartSeries(
        rows.slice(0, cap),
        activity,
        options,
        timezone,
      ),
    };
  }

  async query(
    userId: string,
    hashId: string,
    options: ActivitySeriesOptions = {},
  ) {
    const activity = await this.activities.findReadyByHashId(userId, hashId);
    if (!activity) throw new NotFoundException('Activity not found');
    const rows = await this.sensors.getRecordSeriesMulti(activity.id, [
      'heartRate',
      'power',
      'enhancedSpeed',
      'speed',
      'cadence',
      'grade',
    ]);
    return {
      hashId,
      sportType: activity.sportType,
      ...summarizeActivitySeries(rows, options),
    };
  }
}
