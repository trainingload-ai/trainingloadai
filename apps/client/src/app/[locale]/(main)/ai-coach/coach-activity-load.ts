type ActivityLoadFields = {
  load?: unknown;
  tss?: unknown;
  trimp?: unknown;
};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * New tool payloads carry the same resolved load used by the activity feed.
 * The legacy fallback keeps persisted conversations useful while preventing a
 * zero-valued irrelevant metric from masking another available load metric.
 */
export function resolveCoachActivityLoad(
  item: ActivityLoadFields,
): number | undefined {
  const resolvedLoad = finiteNumber(item.load);
  if (resolvedLoad !== undefined) return Math.round(resolvedLoad);

  const legacyLoads = [finiteNumber(item.tss), finiteNumber(item.trimp)];
  const positiveLoad = legacyLoads.find(
    (value): value is number => value !== undefined && value > 0,
  );
  if (positiveLoad !== undefined) return Math.round(positiveLoad);

  return legacyLoads.some((value) => value === 0) ? 0 : undefined;
}
