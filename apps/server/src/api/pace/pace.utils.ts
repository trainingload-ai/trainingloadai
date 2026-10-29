import { SportType, ZoneBase, PaceZoneModel } from '@prisma/client';
import { vVo2MaxFromVDOT } from '@/algorithm/vo2max';
import { UserZoneSetting } from '@/utils/zones';

export const generatePaceZonesFromProfile = (
  userProfile: {
    vo2max?: number;
    tp?: number;
    cs?: number;
    paceZoneModel?: PaceZoneModel;
  },
  sportType: SportType = SportType.RUN,
): UserZoneSetting | null => {
  const model = userProfile.paceZoneModel || PaceZoneModel.DANIELS;

  let benchmark: ZoneBase | null = null;
  let baseSpeedMps: number | undefined;
  if (model === PaceZoneModel.DANIELS) {
    // The model defines its benchmark; TP/CS must not replace Daniels' VDOT.
    const vdot = userProfile.vo2max;
    const speedMmin =
      Number.isFinite(vdot) && (vdot || 0) > 0
        ? vVo2MaxFromVDOT(vdot as number)
        : undefined;
    baseSpeedMps =
      Number.isFinite(speedMmin) && (speedMmin || 0) > 0
        ? (speedMmin as number) / 60
        : undefined;
    benchmark = ZoneBase.VO2MAX;
  } else if (model === PaceZoneModel.FRIEL) {
    const tpMps = userProfile.tp;
    baseSpeedMps =
      Number.isFinite(tpMps) && (tpMps || 0) > 0
        ? (tpMps as number)
        : undefined;
    benchmark = ZoneBase.TP;
  } else {
    const csMps = userProfile.cs;
    baseSpeedMps =
      Number.isFinite(csMps) && (csMps || 0) > 0
        ? (csMps as number)
        : undefined;
    benchmark = ZoneBase.CS;
  }
  if (
    !benchmark ||
    !Number.isFinite(baseSpeedMps) ||
    (baseSpeedMps || 0) <= 0
  ) {
    return null;
  }

  const percentages =
    model === PaceZoneModel.DANIELS
      ? [
          { order: 1, name: 'Z1 Easy (E)', min: 59, max: 74 },
          { order: 2, name: 'Z2 Marathon (M)', min: 75, max: 84 },
          { order: 3, name: 'Z3 Threshold (T)', min: 88, max: 92 },
          { order: 4, name: 'Z4 Interval (I)', min: 95, max: 100 },
          { order: 5, name: 'Z5 Repetition (R)', min: 105, max: 110 },
        ]
      : model === PaceZoneModel.FRIEL
        ? [
            { order: 1, name: 'Z1 Super Oxygen Run', min: 61, max: 64 },
            { order: 2, name: 'Z2 Slow Run', min: 65, max: 69 },
            { order: 3, name: 'Z3 Moderate Run', min: 70, max: 74 },
            { order: 4, name: 'Z4 Fast Run', min: 75, max: 80 },
            { order: 5, name: 'Z5 Competition/Sprint', min: 81, max: 120 },
          ]
        : [
            { order: 1, name: 'Z1 Recovery', min: 60, max: 80 },
            { order: 2, name: 'Z2 Aerobic', min: 80, max: 87 },
            { order: 3, name: 'Z3 Tempo', min: 87, max: 95 },
            { order: 4, name: 'Z4 Threshold', min: 95, max: 105 },
            { order: 5, name: 'Z5 VO2max', min: 105, max: 120 },
          ];

  const toGap = (percent?: number): number | undefined => {
    if (!Number.isFinite(percent) || (percent || 0) <= 0) return undefined;
    const speed = (baseSpeedMps as number) * ((percent as number) / 100);
    if (!Number.isFinite(speed) || speed <= 0) return undefined;
    return 1 / speed;
  };

  const zones = percentages.map((z) => ({
    name: z.name,
    order: z.order,
    // GAP（秒/米）左闭右开 [min,max)，须 min<max。% 越高速度越快、gap 越小，
    // 故较快端（较小 gap）= toGap(max%)，较慢端（较大 gap，排他上界）= toGap(min%)。
    min: toGap(z.max) as number,
    max: z.min != null ? (toGap(z.min) as number) : undefined,
  }));

  return { zones, benchmark };
};
