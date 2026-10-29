export function estimateWorkoutDurationSeconds(
  text: string | null | undefined,
) {
  if (!text) return null;

  const multipliers: number[] = [1];
  let total = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().toLowerCase();
    if (!line) continue;

    if (line.startsWith("}")) {
      if (multipliers.length > 1) multipliers.pop();
      continue;
    }

    const currentMultiplier = multipliers.reduce(
      (product, value) => product * value,
      1,
    );
    const durationMatches = line.matchAll(/(\d+(?:\.\d+)?)(h|m|s)\b/g);
    for (const match of durationMatches) {
      const value = Number(match[1]);
      if (!Number.isFinite(value) || value <= 0) continue;
      const unit = match[2];
      const seconds =
        unit === "h" ? value * 3600 : unit === "m" ? value * 60 : value;
      total += seconds * currentMultiplier;
    }

    const repeat = line.match(/^repeat\s+(\d+(?:\.\d+)?)\s*\{/);
    if (repeat) {
      const count = Number(repeat[1]);
      multipliers.push(Number.isFinite(count) && count > 0 ? count : 1);
    }
  }

  return total > 0 ? Math.round(total) : null;
}

export function formatWorkoutDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "--";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.round((rounded % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, minutes)}m`;
}
