import { Injectable } from '@nestjs/common';
import type { Gender, SportType } from '@prisma/client';
import {
  calculateCaloriesFromHeartRate,
  calculateCaloriesFromPower,
  calculateFatCalories,
} from '@/algorithm/calories';
import { calculateEffectiveDistance } from '@/algorithm/distance';

@Injectable()
export class AlgorithmService {
  /**
   * 统一热量估算入口（用于活动落库字段 `calories/fatCalories`）。
   *
   * 设计目标：
   * - 尽量做到“可用即算”：优先使用功率（更稳定），否则在用户画像完整时回退到心率模型。
   * - 输出只包含最终可落库的整型值，避免业务层重复 round/guard。
   *
   * 注意：
   * - 这里不读数据库，不依赖请求上下文，便于在 task / worker / 复算中复用。
   */
  calculateCalories(
    avgPower: number | undefined | null,
    avgHeartRate: number | undefined | null,
    durationSec: number,
    userProfile: {
      weight?: number | null;
      age?: number | null;
      gender?: Gender | null;
      maxHeartRate?: number | null;
    },
  ) {
    let totalCalories = 0;
    let totalFatCalories = 0;

    // 策略：优先用功率，其次用心率
    if (avgPower && avgPower > 0 && durationSec > 0) {
      totalCalories = calculateCaloriesFromPower(avgPower, durationSec);
    } else if (
      avgHeartRate &&
      avgHeartRate > 0 &&
      durationSec > 0 &&
      userProfile.age &&
      userProfile.weight &&
      userProfile.gender
    ) {
      const durationMin = durationSec / 60;
      totalCalories = calculateCaloriesFromHeartRate(
        avgHeartRate,
        userProfile.age,
        userProfile.weight,
        durationMin,
        userProfile.gender,
      );
    }

    // 脂肪消耗热量
    if (
      totalCalories > 0 &&
      avgHeartRate &&
      userProfile.maxHeartRate &&
      userProfile.maxHeartRate > 0
    ) {
      totalFatCalories = calculateFatCalories(
        totalCalories,
        avgHeartRate,
        userProfile.maxHeartRate,
      );
    }

    return {
      calories: totalCalories > 0 ? Math.round(totalCalories) : 0,
      fatCalories: totalFatCalories > 0 ? Math.round(totalFatCalories) : 0,
    };
  }

  /**
   * 计算“派生指标”（目前仅 effectiveDistance）。
   *
   * effectiveDistance 用于对爬升/下降带来的体感成本做距离等效化，
   * 方便后续 VDOT/配速等算法使用更合理的输入。
   */
  computeDerivedMetrics(context: {
    distance?: number;
    ascent?: number;
    descent?: number;
  }) {
    const effectiveDistance = calculateEffectiveDistance(
      context?.distance ?? 0,
      context?.ascent ?? 0,
      context?.descent ?? 0,
    );
    return { effectiveDistance };
  }
}
