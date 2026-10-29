import { Injectable, Logger } from '@nestjs/common';
import { round } from 'lodash';
import type { SensorData } from '../analyze.interface';
import {
  estimateVo2maxCycling,
  estimateVo2maxRunByHeartRate,
  getVdotFromRace,
  getVdotFromRecords,
} from '@/algorithm/vo2max';

@Injectable()
export class Vo2MaxEngineService {
  private readonly logger = new Logger(Vo2MaxEngineService.name);

  /**
   * 跑步 VO2Max 估算入口。
   *
   * 输出字段：
   * - vo2maxVdotByHr：基于平均速度 + 平均心率比例（相对 MHR）的估算
   * - vo2maxVdotByRace：基于表现（records 或 distance+time）的 VDOT
   * - vo2maxVdotByFactor：对 HR 估算乘以个体修正因子后的结果（用于收敛个体差异）
   *
   * 约束：
   * - 该方法是纯计算，不落库；落库由 activity metrics task/post 阶段完成。
   */
  calculateRunActivityVo2Max(
    effectiveDistance: number,
    durationSec: number,
    avgSpeed: number,
    avgHeartRate: number,
    records: SensorData[],
    context: {
      MHR?: number;
      vo2maxCorrectionFactor?: number;
    },
  ) {
    const vo2maxVdotByHr = this.estimateVo2MaxByHeartRate(
      avgSpeed,
      context?.MHR,
      avgHeartRate,
    );

    const vdotFromRecords =
      records && records.length > 0
        ? getVdotFromRecords(records)
        : getVdotFromRace(effectiveDistance, durationSec);
    const correctionFactor = context?.vo2maxCorrectionFactor ?? 1.0;
    const vo2maxVdotByFactor =
      vo2maxVdotByHr > 0 ? round(vo2maxVdotByHr * correctionFactor, 2) : 0;
    this.logger.log(
      `[vo2max]：估算结果为 hr: ${vo2maxVdotByHr} race: ${vdotFromRecords} factor: ${vo2maxVdotByFactor}`,
    );
    return {
      vo2maxVdotByHr,
      vo2maxVdotByRace: vdotFromRecords,
      vo2maxVdotByFactor,
      vo2maxCorrectionFactor: correctionFactor,
    };
  }

  /**
   * 骑行 VO2Max 估算入口（基于 MAP 与体重）。
   *
   * 注意：
   * - MAP 一般由活动 MMP5 推导（在 metrics 管道中保证取“当前活动”的 MMP5）。
   */
  calculateCyclingActivityVo2Max(map?: number, weight?: number) {
    return map && weight ? estimateVo2maxCycling(map, weight) : 0;
  }

  /**
   * 内部 helper：根据心率比例估算 VO2Max（跑步）。
   * - 需要 MHR 与 avgHR；缺失时返回 0（表示不可用）
   */
  private estimateVo2MaxByHeartRate(
    avgSpeed: number,
    maxHr?: number,
    avgHr?: number,
  ): number {
    if (maxHr && avgHr && avgSpeed > 0) {
      const speedMmin = avgSpeed * 60;
      const vo2max = estimateVo2maxRunByHeartRate({
        speedMmin,
        maxHrPercent: round(avgHr / maxHr, 2),
      });
      return vo2max || 0;
    }
    return 0;
  }
}
