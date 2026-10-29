import type { PowerZoneModel } from "./power-zones";
export type { PowerZoneModel } from "./power-zones";
export type HeartRateZoneModel = "KARVONEN" | "FRIEL" | "MHR";
export type PowerZoneBase = "FTP" | "CP";

export type HeartRateZonesPrefill = {
  model: HeartRateZoneModel | null;
  lthr: string | null;
  maxHr: string | null;
  restHr: string | null;
};

export type PowerZonesPrefill = {
  model: PowerZoneModel | null;
  baseType: PowerZoneBase | null;
  base: string | null;
  /** True only when the share URL explicitly asks for the labeled example. */
  example: boolean;
};

const HEART_RATE_MODELS: Record<string, HeartRateZoneModel> = {
  friel: "FRIEL",
  lthr: "FRIEL",
  karvonen: "KARVONEN",
  hrr: "KARVONEN",
  mhr: "MHR",
  max: "MHR",
};

const POWER_MODELS: Record<string, PowerZoneModel> = {
  coggan: "COGGAN",
  friel: "FRIEL",
  vance: "VANCE",
  stryd: "STRYD",
};

const POWER_BASES: Record<string, PowerZoneBase> = {
  ftp: "FTP",
  cp: "CP",
};

function searchParamsFrom(search: string) {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

function readBoundedInt(raw: string | null, max: number) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value <= 0 || value > max) return null;
  return String(value);
}

/** Shareable bpm text. Decimals stay intact so a .5 input is not pre-rounded. */
function readBoundedBpm(raw: string | null, max: number) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length > 32 || !/^\d{1,3}(\.\d{1,4})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > max) return null;
  return trimmed;
}

const HEART_RATE_MODEL_PARAM: Record<HeartRateZoneModel, string> = {
  KARVONEN: "karvonen",
  FRIEL: "friel",
  MHR: "mhr",
};

/** Shareable query for the zones calculator. Empty when the default model has no inputs. */
export function buildHeartRateZonesSearch(input: {
  model: HeartRateZoneModel;
  maxHr?: string | null;
  restHr?: string | null;
  lthr?: string | null;
  example?: boolean;
}) {
  const maxHr = readBoundedBpm(input.maxHr ?? null, 250);
  const restHr = readBoundedBpm(input.restHr ?? null, 220);
  const lthr = readBoundedBpm(input.lthr ?? null, 250);
  const ready =
    input.model === "FRIEL"
      ? lthr != null
      : input.model === "MHR"
        ? maxHr != null
        : maxHr != null &&
          restHr != null &&
          Number(maxHr) > Number(restHr);
  if (!ready) return "";

  const params = new URLSearchParams();
  params.set("model", HEART_RATE_MODEL_PARAM[input.model]);
  if (input.model === "FRIEL") {
    params.set("lthr", lthr!);
  } else {
    params.set("maxHr", maxHr!);
    if (input.model === "KARVONEN") params.set("restHr", restHr!);
  }
  if (input.example) params.set("example", "1");
  return params.toString();
}

export type HeartRateZoneLink = {
  model?: HeartRateZoneModel;
  lthr?: number;
  maxHr?: number;
  restHr?: number;
};

function appendRoundedBpm(
  params: URLSearchParams,
  key: string,
  value: number | undefined,
) {
  if (value == null || !Number.isFinite(value) || value <= 0) return;
  params.set(key, String(Math.round(value)));
}

export function heartRateZonesSearch(
  lthrOrInput: number | HeartRateZoneLink,
): string {
  if (typeof lthrOrInput === "number") {
    return new URLSearchParams({
      model: "friel",
      lthr: String(Math.round(lthrOrInput)),
    }).toString();
  }
  const model =
    lthrOrInput.model ?? (lthrOrInput.lthr != null ? "FRIEL" : "MHR");
  const params = new URLSearchParams();
  params.set("model", model.toLowerCase());
  appendRoundedBpm(params, "lthr", lthrOrInput.lthr);
  appendRoundedBpm(params, "maxHr", lthrOrInput.maxHr);
  appendRoundedBpm(params, "restHr", lthrOrInput.restHr);
  return params.toString();
}

export function heartRateZonesHref(
  prefix: string,
  lthrOrInput: number | HeartRateZoneLink,
) {
  return `${prefix}/heart-rate-zones-calculator?${heartRateZonesSearch(lthrOrInput)}`;
}

export function heartRateZonesMaxHrSearch(maxHr: number) {
  return new URLSearchParams({
    model: "mhr",
    maxHr: String(Math.round(maxHr)),
  }).toString();
}

export function heartRateZonesMaxHrHref(prefix: string, maxHr: number) {
  return `${prefix}/heart-rate-zones-calculator?${heartRateZonesMaxHrSearch(maxHr)}`;
}

export function powerZonesSearch(
  watts: number,
  model: PowerZoneModel = "FRIEL",
) {
  return new URLSearchParams({
    model: model.toLowerCase(),
    baseType: "ftp",
    base: String(Math.round(watts)),
  }).toString();
}

export function powerZonesHref(
  prefix: string,
  watts: number,
  model: PowerZoneModel = "FRIEL",
) {
  return `${prefix}/power-zones-calculator?${powerZonesSearch(watts, model)}`;
}

export function parseHeartRateZonesPrefill(
  search: string,
): HeartRateZonesPrefill {
  const params = searchParamsFrom(search);
  const lthr = readBoundedBpm(params.get("lthr"), 250);
  const modelRaw = params.get("model")?.trim().toLowerCase() ?? "";
  const model = HEART_RATE_MODELS[modelRaw] ?? (lthr ? "FRIEL" : null);
  return {
    model,
    lthr,
    maxHr: readBoundedBpm(params.get("maxHr"), 250),
    restHr: readBoundedBpm(params.get("restHr"), 220),
  };
}

const EMPTY_POWER_PREFILL: PowerZonesPrefill = {
  model: null,
  baseType: null,
  base: null,
  example: false,
};

export function parsePowerZonesPrefill(search: string): PowerZonesPrefill {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (raw.length > 256) return EMPTY_POWER_PREFILL;
  const params = searchParamsFrom(raw);
  for (const [key, value] of params) {
    if (key.length > 32 || value.length > 32) return EMPTY_POWER_PREFILL;
  }
  const modelRaw = params.get("model")?.trim().toLowerCase() ?? "";
  const baseRaw = params.get("baseType")?.trim().toLowerCase() ?? "";
  const base = readBoundedInt(params.get("base"), 2000);
  return {
    model: POWER_MODELS[modelRaw] ?? null,
    baseType: POWER_BASES[baseRaw] ?? null,
    base,
    example: params.get("example") === "1" && base != null,
  };
}
