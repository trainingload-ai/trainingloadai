import { vVo2MaxFromVDOT } from './vo2max';

export function computeTPaceSecPerKm(vo2max: number): number {
  if (!Number.isFinite(vo2max) || vo2max <= 0) return 0;
  const speedMmin = vVo2MaxFromVDOT(vo2max);
  if (!Number.isFinite(speedMmin) || speedMmin <= 0) return 0;
  return (1000.0 / speedMmin / 0.9) * 60.0;
}
