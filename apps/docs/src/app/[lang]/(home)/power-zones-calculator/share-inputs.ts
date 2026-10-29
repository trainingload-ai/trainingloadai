import {
  parsePowerZonesPrefill,
  type PowerZonesPrefill,
} from "@/lib/zone-tool-links";

const SHARE_KEYS = ["model", "baseType", "base", "example"] as const;

/** Server-parsed share URL. Empty fields stay empty; the example is opt-in. */
export function readPowerZonesInputs(
  params: Record<string, string | string[] | undefined>,
): PowerZonesPrefill {
  const query = new URLSearchParams();
  for (const key of SHARE_KEYS) {
    const value = params[key];
    if (typeof value !== "string" || value.length > 32) continue;
    query.set(key, value);
  }
  return parsePowerZonesPrefill(query.toString());
}
