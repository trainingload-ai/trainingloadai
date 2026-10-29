import { cogganZones } from "./ftp-field";

export const POWER_ZONE_MODELS = ["COGGAN", "FRIEL", "VANCE", "STRYD"] as const;
export type PowerZoneModel = (typeof POWER_ZONE_MODELS)[number];

export const POWER_ZONE_MODEL_NAMES: Record<PowerZoneModel, string> = {
  COGGAN: "Coggan",
  FRIEL: "Friel",
  VANCE: "Vance",
  STRYD: "Stryd",
};

type ZonePct = {
  order: number;
  name: string;
  min: number;
  max: number | null;
};

const MODEL_PRESETS: Record<
  Exclude<PowerZoneModel, "COGGAN">,
  { zones: ZonePct[]; zoneCount: number }
> = {
  STRYD: {
    zoneCount: 5,
    zones: [
      { order: 1, name: "Easy", min: 0, max: 81 },
      { order: 2, name: "Moderate", min: 81, max: 91 },
      { order: 3, name: "Threshold", min: 91, max: 101 },
      { order: 4, name: "Interval", min: 101, max: 116 },
      { order: 5, name: "Repetition", min: 116, max: null },
    ],
  },
  VANCE: {
    zoneCount: 7,
    zones: [
      { order: 1, name: "Recovery/Walking", min: 0, max: 81 },
      { order: 2, name: "Endurance", min: 81, max: 89 },
      { order: 3, name: "Tempo", min: 89, max: 96 },
      { order: 4, name: "Threshold", min: 96, max: 106 },
      { order: 5, name: "High Intensity", min: 106, max: 116 },
      { order: 6, name: "VO2", min: 116, max: 128 },
      { order: 7, name: "Anaerobic Capacity", min: 128, max: null },
    ],
  },
  FRIEL: {
    zoneCount: 7,
    zones: [
      { order: 1, name: "Active Recovery", min: 0, max: 56 },
      { order: 2, name: "Endurance", min: 56, max: 76 },
      { order: 3, name: "Tempo", min: 76, max: 91 },
      { order: 4, name: "Threshold", min: 91, max: 106 },
      { order: 5, name: "VO2 Max", min: 106, max: 121 },
      { order: 6, name: "Anaerobic", min: 121, max: 151 },
      { order: 7, name: "Neuromuscular", min: 151, max: null },
    ],
  },
};

/** One display rounding. The percent is applied to the raw reference first. */
export function roundZoneWatts(base: number, percent: number) {
  return Math.round((base * percent) / 100);
}

function zonePercentLabel(zone: ZonePct) {
  if (zone.max == null) return `≥ ${zone.min}%`;
  const maxInclusive = Math.max(zone.min, zone.max - 1);
  if (zone.order === 1) return `≤ ${maxInclusive}%`;
  return `${zone.min}%–${maxInclusive}%`;
}

export type PowerZoneBand = {
  order: number;
  name: string;
  percentLabel: string;
  wattLabel: string;
  /** Inclusive whole watts. Null when the zone is open below this row. */
  minWatts: number | null;
  /** Inclusive whole watts. Null when the zone is open above this row. */
  maxWatts: number | null;
};

function presetBand(zone: ZonePct, base: number): PowerZoneBand {
  const minW = roundZoneWatts(base, zone.min);
  if (zone.max == null) {
    return {
      order: zone.order,
      name: zone.name,
      percentLabel: zonePercentLabel(zone),
      wattLabel: `≥ ${minW}W`,
      minWatts: minW,
      maxWatts: null,
    };
  }
  const boundaryW = roundZoneWatts(base, zone.max);
  const maxInclusive = Math.max(minW, boundaryW - 1);
  if (zone.order === 1) {
    return {
      order: zone.order,
      name: zone.name,
      percentLabel: zonePercentLabel(zone),
      wattLabel: `≤ ${maxInclusive}W`,
      minWatts: null,
      maxWatts: maxInclusive,
    };
  }
  return {
    order: zone.order,
    name: zone.name,
    percentLabel: zonePercentLabel(zone),
    wattLabel: `${minW}–${maxInclusive}W`,
    minWatts: minW,
    maxWatts: maxInclusive,
  };
}

/**
 * Shared by the FTP scorecard and the power-zone calculator.
 * Coggan thresholds come from `cogganZones`, which rounds the reference once.
 * This detailed calculator then assigns every whole watt to one adjacent zone:
 * the first `<55%` edge belongs to Z2, later rounded upper edges stay in the
 * lower row, and Z7 begins one watt above the rounded 150% edge. Friel, Vance,
 * and Stryd keep the reference fractional and give each shared boundary watt
 * to the higher zone.
 */
export function calculatePowerZones(
  model: PowerZoneModel,
  base: number,
): PowerZoneBand[] | null {
  if (!Number.isFinite(base) || base <= 0) return null;
  if (model === "COGGAN") {
    const zones = cogganZones(base);
    if (!zones) return null;
    return zones.map((zone, index) => {
      const first = index === 0;
      const last = index === zones.length - 1;
      const previous = zones[index - 1];
      const minWatts = first
        ? null
        : index === 1
          ? (previous?.maxWatts ?? null)
          : previous?.maxWatts == null
            ? null
            : previous.maxWatts + 1;
      const maxWatts = first
        ? zone.maxWatts == null
          ? null
          : zone.maxWatts - 1
        : last
          ? null
          : zone.maxWatts;
      return {
        order: index + 1,
        name: MODEL_PRESETS.FRIEL.zones[index].name,
        percentLabel: `${zone.percentLabel}%`,
        wattLabel: first
          ? `≤ ${maxWatts}W`
          : last
            ? `≥ ${minWatts}W`
            : `${minWatts}–${maxWatts}W`,
        minWatts,
        maxWatts,
      };
    });
  }
  return MODEL_PRESETS[model].zones.map((zone) => presetBand(zone, base));
}
