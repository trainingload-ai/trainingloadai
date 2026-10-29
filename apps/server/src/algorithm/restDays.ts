/**
 * Estimate needed rest days to reach a target TSB
 *
 * @version 0.0.1
 * @param atl Current Acute Training Load
 * @param ctl Current Chronic Training Load
 * @param tauATL Time constant for ATL (default: 7)
 * @param tauCTL Time constant for CTL (default: 42)
 * @param targetTSB Target Training Stress Balance to reach (default: -3)
 * @returns Estimated rest days
 */
function estimateRestDays({
  atl,
  ctl,
  tauATL = 7,
  tauCTL = 42,
  targetTSB = -3,
}: {
  atl: number;
  ctl: number;
  tauATL?: number;
  tauCTL?: number;
  targetTSB?: number;
}) {
  if (ctl <= 0) return 0;

  let t = 0;
  const dt = 0.05; // 0.05 day ≈ 1.2 hour
  const maxDays = 14;

  while (t <= maxDays) {
    const atl_t = atl * Math.exp(-t / tauATL);
    const ctl_t = ctl * Math.exp(-t / tauCTL);
    const tsb_t = ctl_t - atl_t;

    if (tsb_t >= targetTSB) {
      return Math.round(t * 10) / 10; //  0.1 day
    }

    t += dt;
  }

  return maxDays;
}

export default estimateRestDays;
