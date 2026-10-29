import { $Enums, SportType } from '@prisma/client';
import { resolveLthrForCalculation } from '@shared/lthr';

/**
 * 生成用户的心率区域
 * 逻辑为
 * 1. 根据用户配置的 heartRateZoneModel 来确定使用哪种模型
 * 2. 根据模型生成心率区域
 * 3. 如果模型生成失败，回退到 MHR 模型
 */
export const generateHeartRateZonesFromProfile = (
  userProfile: {
    maxHeartRate?: number;
    restingHeartRate?: number;
    lthr?: number;
    heartRateZoneModel?: $Enums.HeartRateZoneModel;
  },
  sportType: SportType,
): {
  zones: { min: number; max: number; name: string }[];
  benchmark: $Enums.ZoneBase;
  benchmarkSource: 'PROFILE' | 'ESTIMATED_MAX_HR';
} | null => {
  const { maxHeartRate, restingHeartRate, lthr, heartRateZoneModel } =
    userProfile;
  let benchmark: $Enums.ZoneBase | null = null;
  let zones: { min: number; max: number; name: string }[] = [];
  let benchmarkSource: 'PROFILE' | 'ESTIMATED_MAX_HR' | undefined;

  // 未设置模型时，默认按最大心率生成五区间。
  const model = heartRateZoneModel || $Enums.HeartRateZoneModel.MHR;

  // Helper to round
  const r = Math.round;

  // 1. Try to generate based on Model preference
  if (
    model === $Enums.HeartRateZoneModel.KARVONEN &&
    maxHeartRate &&
    maxHeartRate > 0 &&
    restingHeartRate &&
    restingHeartRate > 0
  ) {
    benchmark = $Enums.ZoneBase.HRR;
    benchmarkSource = 'PROFILE';
    const reserve = maxHeartRate - restingHeartRate;

    const z1Max = r(restingHeartRate + reserve * 0.6);
    const z2Max = r(restingHeartRate + reserve * 0.7);
    const z3Max = r(restingHeartRate + reserve * 0.8);
    const z4Max = r(restingHeartRate + reserve * 0.9);

    zones = [
      {
        min: r(restingHeartRate + reserve * 0.5),
        max: z1Max,
        name: 'Z1',
      },
      {
        min: z1Max + 1,
        max: z2Max,
        name: 'Z2',
      },
      {
        min: z2Max + 1,
        max: z3Max,
        name: 'Z3',
      },
      {
        min: z3Max + 1,
        max: z4Max,
        name: 'Z4',
      },
      {
        min: z4Max + 1,
        max: 250,
        name: 'Z5',
      },
    ];
  }
  const calculationLthr = resolveLthrForCalculation({
    lthr,
    maxHeartRate,
  });
  if (model === $Enums.HeartRateZoneModel.FRIEL && calculationLthr) {
    const resolvedLthr = calculationLthr.value;
    benchmark = $Enums.ZoneBase.LTHR;
    benchmarkSource = calculationLthr.source;
    if (sportType === SportType.RUN) {
      // Friel Running Zones (7 zones)
      zones = [
        { min: 0, max: r(resolvedLthr * 0.85), name: 'Z1 Recovery' },
        {
          min: r(resolvedLthr * 0.85),
          max: r(resolvedLthr * 0.89),
          name: 'Z2 Aerobic',
        },
        {
          min: r(resolvedLthr * 0.9),
          max: r(resolvedLthr * 0.94),
          name: 'Z3 Tempo',
        },
        {
          min: r(resolvedLthr * 0.95),
          max: r(resolvedLthr * 0.99),
          name: 'Z4 SubThreshold',
        },
        {
          min: r(resolvedLthr * 1.0),
          max: r(resolvedLthr * 1.02),
          name: 'Z5a SuperThreshold',
        },
        {
          min: r(resolvedLthr * 1.03),
          max: r(resolvedLthr * 1.06),
          name: 'Z5b AerobicCapacity',
        },
        {
          min: r(resolvedLthr * 1.07),
          max: 250,
          name: 'Z5c AnaerobicCapacity',
        },
      ];
    } else {
      // Friel Cycling Zones (7 zones)
      zones = [
        { min: 0, max: r(resolvedLthr * 0.81), name: 'Z1' },
        {
          min: r(resolvedLthr * 0.82),
          max: r(resolvedLthr * 0.89),
          name: 'Z2',
        },
        {
          min: r(resolvedLthr * 0.9),
          max: r(resolvedLthr * 0.93),
          name: 'Z3',
        },
        {
          min: r(resolvedLthr * 0.94),
          max: r(resolvedLthr * 0.99),
          name: 'Z4',
        },
        {
          min: r(resolvedLthr * 1.0),
          max: r(resolvedLthr * 1.02),
          name: 'Z5a',
        },
        {
          min: r(resolvedLthr * 1.03),
          max: r(resolvedLthr * 1.06),
          name: 'Z5b',
        },
        { min: r(resolvedLthr * 1.07), max: 250, name: 'Z5c' },
      ];
    }
  }

  // 2. Explicit/default MHR, or fallback when the selected model lacks inputs.
  if (
    zones.length === 0 &&
    Number.isFinite(maxHeartRate) &&
    maxHeartRate &&
    maxHeartRate > 0
  ) {
    // Fallback to MHR
    benchmark = $Enums.ZoneBase.MHR;
    benchmarkSource = 'PROFILE';

    const z1Max = r(maxHeartRate * 0.6);
    const z2Max = r(maxHeartRate * 0.7);
    const z3Max = r(maxHeartRate * 0.8);
    const z4Max = r(maxHeartRate * 0.9);

    zones = [
      {
        min: r(maxHeartRate * 0.5),
        max: z1Max,
        name: 'Z1',
      },
      {
        min: z1Max + 1,
        max: z2Max,
        name: 'Z2',
      },
      {
        min: z2Max + 1,
        max: z3Max,
        name: 'Z3',
      },
      {
        min: z3Max + 1,
        max: z4Max,
        name: 'Z4',
      },
      { min: z4Max + 1, max: 250, name: 'Z5' },
    ];
  }

  if (!benchmark || !benchmarkSource || zones.length === 0) {
    return null;
  }

  return {
    zones,
    benchmark,
    benchmarkSource,
  };
};
