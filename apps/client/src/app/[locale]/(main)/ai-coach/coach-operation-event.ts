import type { AiOperationResult } from "@/api/ai-operations";

export function readAiOperationFromSse(raw: string): AiOperationResult | null {
  let latest: AiOperationResult | null = null;

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.operation && typeof record.operation === "object") {
      latest = record.operation as AiOperationResult;
    }
    if (record.data && typeof record.data === "object") visit(record.data);
  };

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    try {
      visit(JSON.parse(trimmed.slice(5).trim()));
    } catch {
      // Partial and non-JSON SSE frames do not contain operation metadata.
    }
  }

  return latest;
}
