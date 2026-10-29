export function parseComposePs(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

export function evaluateComposeState(rows, additionalRequiredServices = []) {
  const byService = new Map(rows.map((row) => [row.Service, row]));
  const failures = [];
  for (const name of ["permissions", "migrate"]) {
    const row = byService.get(name);
    if (row?.State === "exited" && Number(row.ExitCode) !== 0) {
      failures.push(`${name} exited with ${row.ExitCode}`);
    }
  }
  const waiting = [];
  for (const name of [
    "postgres",
    "server",
    "client",
    ...additionalRequiredServices,
  ]) {
    const row = byService.get(name);
    if (!row || row.State !== "running") {
      waiting.push(`${name}:not-running`);
      continue;
    }
    if (row.Health && row.Health !== "healthy") {
      waiting.push(`${name}:${row.Health}`);
    }
  }
  for (const name of ["permissions", "migrate"]) {
    const row = byService.get(name);
    if (!row || row.State !== "exited" || Number(row.ExitCode) !== 0) {
      waiting.push(`${name}:not-completed`);
    }
  }
  return { failures, waiting };
}

export function composeServiceSnapshots(rows) {
  return [...rows]
    .map((row) => ({
      name: String(row.Service ?? row.Name ?? "unknown"),
      state: String(row.State ?? "unknown"),
      health: row.Health ? String(row.Health) : null,
      exitCode:
        row.ExitCode === undefined || row.ExitCode === null
          ? null
          : Number(row.ExitCode),
      image: row.Image ? String(row.Image) : null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
