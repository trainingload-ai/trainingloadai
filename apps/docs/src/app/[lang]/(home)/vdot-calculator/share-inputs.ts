import { parseFlexibleTime } from "@/lib/vdot-time";

export const VDOT_PRESET_METERS = {
  "1500m": 1500,
  mile: 1609.344,
  "3k": 3000,
  "5k": 5000,
  "10k": 10000,
  "15k": 15000,
  half: 21097.5,
  full: 42195,
} as const;

export type VdotPreset = keyof typeof VDOT_PRESET_METERS | "custom";
export type VdotPaceUnit = "km" | "mi";

export type VdotShareInputs = {
  preset: VdotPreset;
  customKm: string;
  timeSec: number | null;
  unit: VdotPaceUnit;
  example: boolean;
};

const MAX_PARAM = 32;
const MAX_QUERY = 512;

export function emptyVdotInputs(): VdotShareInputs {
  return {
    preset: "5k",
    customKm: "",
    timeSec: null,
    unit: "km",
    example: false,
  };
}

export function exampleVdotInputs(unit: VdotPaceUnit = "km"): VdotShareInputs {
  return {
    preset: "5k",
    customKm: "",
    timeSec: 25 * 60,
    unit,
    example: true,
  };
}

function readText(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const raw = params[key];
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > MAX_PARAM) return null;
  return text;
}

function readDistanceMeters(raw: string | null) {
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return null;
  const meters = Number(raw);
  if (!Number.isFinite(meters) || meters <= 0 || meters > 500_000) return null;
  return meters;
}

function readTimeSeconds(raw: string | null) {
  if (!raw) return null;
  if (raw.includes(":") || /[hms]/i.test(raw)) return parseFlexibleTime(raw);
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 60 * 60) return null;
  return seconds;
}

function presetForMeters(meters: number): VdotPreset {
  const match = (
    Object.entries(VDOT_PRESET_METERS) as Array<[VdotPreset, number]>
  ).find(([, value]) => Math.abs(value - meters) < 1);
  return match?.[0] ?? "custom";
}

export function readVdotInputs(
  params: Record<string, string | string[] | undefined>,
): VdotShareInputs {
  const combined = Object.entries(params)
    .flatMap(([key, value]) => (typeof value === "string" ? [`${key}=${value}`] : []))
    .join("&");
  if (combined.length > MAX_QUERY) return emptyVdotInputs();

  const unit: VdotPaceUnit = readText(params, "unit") === "mi" ? "mi" : "km";
  const example = readText(params, "example") === "1";
  const distanceM = readDistanceMeters(readText(params, "d"));
  const timeSec = readTimeSeconds(readText(params, "t"));

  if (example && distanceM == null && timeSec == null) {
    return exampleVdotInputs(unit);
  }
  if (distanceM == null || timeSec == null) return { ...emptyVdotInputs(), unit };

  const preset = presetForMeters(distanceM);
  return {
    preset,
    customKm: preset === "custom" ? String(Math.round((distanceM / 1000) * 1000) / 1000) : "",
    timeSec,
    unit,
    example:
      example &&
      Math.abs(distanceM - VDOT_PRESET_METERS["5k"]) < 1 &&
      Math.abs(timeSec - 25 * 60) < 0.001,
  };
}
