import { bodyMassToKilograms, kilogramsToPounds } from "./ftp-field";
import { KM_PER_MILE } from "./running-pace";
import type { Vo2Draft } from "./vo2-field";

export type Vo2Units = "metric" | "imperial";

function display(
  value: string,
  transform: (number: number) => number,
  decimals: number,
) {
  if (!value.trim() || !Number.isFinite(Number(value))) return "";
  return String(Number(transform(Number(value)).toFixed(decimals)));
}

// Unit changes only format the input; the calculation keeps the original metric values.
export function vo2DistanceDisplay(draft: Vo2Draft, units: Vo2Units) {
  return display(
    draft.cooperDistance,
    (value) => {
      const metres = draft.cooperUnit === "km" ? value * 1000 : value;
      return units === "imperial" ? metres / (KM_PER_MILE * 1000) : metres;
    },
    units === "imperial" ? 4 : 2,
  );
}
export function vo2WeightDisplay(draft: Vo2Draft, units: Vo2Units) {
  return display(
    draft.weightKg,
    (kg) => (units === "imperial" ? kilogramsToPounds(kg) : kg),
    2,
  );
}
export function vo2DistanceFromInput(value: string, units: Vo2Units) {
  if (!value.trim() || !Number.isFinite(Number(value))) return "";
  return String(
    Number(value) * (units === "imperial" ? KM_PER_MILE * 1000 : 1),
  );
}
export function vo2WeightFromInput(value: string, units: Vo2Units) {
  if (!value.trim() || !Number.isFinite(Number(value))) return "";
  return String(bodyMassToKilograms(Number(value), units));
}
