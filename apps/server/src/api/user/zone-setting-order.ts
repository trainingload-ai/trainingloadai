export type NormalizedZoneSettingRow = {
  order: number;
  min: number | null;
  max: number | null;
  name: string | null;
  color: string | null;
};

function finiteRoundedNumber(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value));
}

/**
 * Zone order is positional, not a client-controlled identifier. Rebuilding it
 * from the submitted array keeps drag-and-drop edits and imported settings
 * contiguous and guarantees uniqueness within one UserZoneSetting.
 */
export function normalizeZoneSettingRows(
  zones: unknown[],
): NormalizedZoneSettingRow[] {
  return zones.map((value, index) => {
    const zone =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};

    return {
      order: index + 1,
      min: finiteRoundedNumber(zone.min),
      max: finiteRoundedNumber(zone.max),
      name: zone.name != null ? String(zone.name) : null,
      color: zone.color != null ? String(zone.color) : null,
    };
  });
}
