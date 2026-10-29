function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Shared by web and native cards. Show every verified diff, never raw internal IDs. */
export function coachDecisionPreviewRows(input: unknown) {
  const payload = record(input);
  const changes = payload.verifiedChanges ?? payload.changes;
  if (!Array.isArray(changes)) return [];
  return changes.flatMap((item, index) => {
    const change = record(item);
    const snapshot = record(change.after ?? change.dto);
    const fields = change.diff ?? change.fields;
    if (!Array.isArray(fields)) return [];
    const position = [
      snapshot.weekIndex,
      snapshot.dayIndex,
      snapshot.sessionIndex ?? 1,
    ]
      .filter((v) => typeof v === "number")
      .join(" · ");
    return fields.flatMap((entry, fieldIndex) => {
      const field = record(entry);
      if (
        typeof field.field !== "string" ||
        ![
          "weekIndex",
          "dayIndex",
          "sessionIndex",
          "sportType",
          "sportDefinitionCode",
          "name",
          "text",
          "notes",
          "scheduledDate",
        ].includes(field.field)
      )
        return [];
      const display = (value: unknown) =>
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : "—";
      return [
        {
          key: `${index}:${fieldIndex}`,
          position,
          field: field.field,
          value: `${display(field.before)} → ${display(field.after)}`,
        },
      ];
    });
  });
}
