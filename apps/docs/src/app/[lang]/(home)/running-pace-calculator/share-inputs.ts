import {
  paceStateFromParams,
  type PaceCalculatorState,
} from "@/lib/running-pace";

export function readPaceCalculatorInputs(
  params: Record<string, string | string[] | undefined>,
): PaceCalculatorState {
  const values = Object.values(params).flatMap((value) =>
    typeof value === "string" ? [value] : [],
  );
  const totalLength = values.reduce((sum, value) => sum + value.length, 0);
  return paceStateFromParams((key) => {
    const value = params[key];
    return typeof value === "string" ? value : null;
  }, totalLength);
}
