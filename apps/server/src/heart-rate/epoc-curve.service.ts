import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { detectSampleSec } from '@/algorithm/utils';
import { computeEPOCFromHR } from '@/algorithm/epoc';
import { round } from 'lodash';
import { readyActivityWhere } from '@/utils/activity-ready-where';

@Injectable()
export class EpocCurveService {
  private readonly logger = new Logger(EpocCurveService.name);

  /**
   * EPOC 曲线查询服务（对外 API 使用）。
   *
   * 职责：
   * - 校验活动归属（hashId + userId）
   * - 读取心率阈值（maxHR/restHR）作为计算参数
   * - 读取 parquet records 并计算 EPOC 曲线（用于图表展示）
   *
   * 设计取舍：
   * - 不落库，只做“查询型计算”，避免每次上传都强制写入曲线数据。
   * - 失败/缺参返回 null，调用方按“无数据”展示即可。
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly sensorDataService: SensorDataService,
  ) {}

  /**
   * 获取 EPOC 曲线（time/distance/epoc/hr）。
   * - activityHashId：对外暴露的活动标识
   * - userId：当前用户（鉴权后拿到）
   */
  async getEPOCCurve(
    activityHashId: string,
    userId: string,
  ): Promise<Array<{
    time: number;
    distance: number;
    epoc: number;
    hr: number;
  }> | null> {
    const activity = await this.prisma.activity.findFirst({
      where: readyActivityWhere({ hashId: activityHashId, userId }),
      select: { id: true, sportType: true, startTime: true, userId: true },
    });
    if (!activity) return null;

    this.logger.debug(
      `[EPOC 曲线] 开始计算，activityHashId=${activityHashId}, 用户ID=${userId}`,
    );

    const hrThreshold = await this.userService.getUserHeartRateThreshold(
      activity.userId,
      activity.sportType,
      activity.startTime ?? undefined,
      activity.id,
    );
    const maxHR = hrThreshold?.maxHeartRate;
    const restHR = hrThreshold?.restingHeartRate;
    if (!maxHR || !restHR) {
      this.logger.warn(
        `[EPOC 曲线] 缺少心率阈值参数，跳过计算，活动ID=${activity.id}`,
      );
      return null;
    }

    const rows =
      (await this.sensorDataService.getRecordSeriesMulti(activity.id, [
        'heartRate',
        'speed',
        'distance',
      ])) || [];
    if (!rows.length) return null;

    const sampleSec = detectSampleSec(rows);
    const usedMax =
      Number.isFinite(maxHR) && maxHR > 0 ? (maxHR as number) : undefined;
    const usedRest =
      Number.isFinite(restHR) && restHR > 0 ? (restHR as number) : undefined;
    if (!usedMax || !usedRest) return null;

    const hrRows = rows.map((r) => ({
      time: r.time,
      hr: r.heartRate,
      distance: Number(r.distance),
    }));
    const m = computeEPOCFromHR(hrRows, usedMax, usedRest);
    if (!m) return null;

    // 兼容历史输出：sampleSec 仍可用于 debug
    this.logger.debug(`[EPOC 曲线] sampleSec=${round(sampleSec, 0)}`);
    return m.curve ?? null;
  }
}
