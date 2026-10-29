import {
  buildFrielZones,
  buildKarvonenZones,
  buildMhrZones,
  parseHeartRateBpm,
} from "@/lib/heart-rate-zones";
import {
  parseHeartRateZonesPrefill,
  type HeartRateZoneModel,
} from "@/lib/zone-tool-links";

export type HeartRateZonesInputs = {
  model: HeartRateZoneModel;
  maxHr: string;
  restHr: string;
  lthr: string;
  example: boolean;
};

const PARAM_KEYS = ["model", "maxHr", "restHr", "lthr", "example"] as const;
const MAX_PARAM_LENGTH = 32;
const MAX_TOTAL_LENGTH = 160;

const EMPTY: HeartRateZonesInputs = {
  model: "KARVONEN",
  maxHr: "",
  restHr: "",
  lthr: "",
  example: false,
};

function ready(model: HeartRateZoneModel, maxHr: string, restHr: string, lthr: string) {
  if (model === "FRIEL") return buildFrielZones(parseHeartRateBpm(lthr) ?? Number.NaN) != null;
  if (model === "MHR") return buildMhrZones(parseHeartRateBpm(maxHr) ?? Number.NaN) != null;
  const max = parseHeartRateBpm(maxHr);
  const rest = parseHeartRateBpm(restHr);
  return max != null && rest != null && buildKarvonenZones(max, rest) != null;
}

/** Server-side share params. Invalid or oversized input becomes an empty form. */
export function readHeartRateZonesInputs(
  params: Record<string, string | string[] | undefined>,
): HeartRateZonesInputs {
  const search = new URLSearchParams();
  let total = 0;
  for (const key of PARAM_KEYS) {
    const raw = params[key];
    if (typeof raw !== "string" || raw.length > MAX_PARAM_LENGTH) continue;
    total += raw.length;
    if (total > MAX_TOTAL_LENGTH) continue;
    search.set(key, raw);
  }
  const prefill = parseHeartRateZonesPrefill(search.toString());
  const model = prefill.model ?? "KARVONEN";
  const maxHr = prefill.maxHr ?? "";
  const restHr = prefill.restHr ?? "";
  const lthr = prefill.lthr ?? "";
  if (!ready(model, maxHr, restHr, lthr)) return EMPTY;
  return {
    model,
    maxHr: model === "FRIEL" ? "" : maxHr,
    restHr: model === "KARVONEN" ? restHr : "",
    lthr: model === "FRIEL" ? lthr : "",
    example: params.example === "1",
  };
}
