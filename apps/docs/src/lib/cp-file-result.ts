import {
  CP_DURATION_MAX_S,
  CP_POWER_MAX_W,
  fitCriticalPower,
  type CpEffortDraft,
} from "./critical-power";

/** Read the power windows, not the endpoint's FTP = CP × 0.95 estimate. */
export function cpDraftsFromFileResponse(
  payload: unknown,
): [CpEffortDraft, CpEffortDraft, CpEffortDraft] | null {
  const wrapped =
    payload && typeof payload === "object"
      ? (payload as { code?: unknown; data?: unknown })
      : null;
  if (wrapped?.code != null && wrapped.code !== 200) return null;
  const data = Array.isArray(payload) ? payload : wrapped?.data;
  if (!Array.isArray(data) || data.length !== 1) return null;
  const derived = data[0]?.derived;
  if (!derived || typeof derived !== "object") return null;
  const { p3m, pLong, longDurationSec } = derived;
  if (
    ![p3m, pLong, longDurationSec].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    )
  )
    return null;
  if (
    p3m <= 0 ||
    pLong <= 0 ||
    p3m > CP_POWER_MAX_W ||
    pLong > CP_POWER_MAX_W ||
    longDurationSec <= 180 ||
    longDurationSec > CP_DURATION_MAX_S
  )
    return null;
  const fit = fitCriticalPower([
    { seconds: 180, watts: p3m },
    { seconds: longDurationSec, watts: pLong },
  ]);
  if (!fit || fit.cpWatts <= 0 || fit.wPrimeJoules <= 0) return null;
  return [
    { preset: "180", minutes: "", watts: String(p3m) },
    {
      preset: "custom",
      minutes: String(longDurationSec / 60),
      watts: String(pLong),
    },
    { preset: "unset", minutes: "", watts: "" },
  ];
}
