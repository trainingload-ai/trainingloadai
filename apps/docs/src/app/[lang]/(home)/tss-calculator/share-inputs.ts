import type { PowerKind } from "@/lib/tss";
import { parseNonNegativeNumber } from "@/lib/tss";

export type TssInputs = {
  hours: string;
  minutes: string;
  power: string;
  ftp: string;
  kind: PowerKind;
};
export const EXAMPLE_TSS_INPUTS: TssInputs = {
  hours: "1",
  minutes: "30",
  power: "200",
  ftp: "250",
  kind: "normalized",
};
export function readTssInputs(
  params: Record<string, string | string[] | undefined>,
): TssInputs {
  const number = (key: string) => {
    const value = params[key];
    return typeof value === "string" &&
      value.length <= 16 &&
      parseNonNegativeNumber(value) != null
      ? value.trim()
      : "";
  };
  return {
    hours: number("hours"),
    minutes: number("minutes"),
    power: number("power"),
    ftp: number("ftp"),
    kind: params.kind === "average" ? "average" : "normalized",
  };
}
export function tssSearchParams(inputs: TssInputs) {
  return new URLSearchParams(inputs);
}
