export type AiOperationKind = "COACH_SESSION" | "ACTIVITY_REVIEW";

export type PendingAiOperation = {
  operationId: string;
  kind: AiOperationKind;
  entityId: string;
  requestFingerprint: string;
  createdAt: string;
};

const STORAGE_PREFIX = "trainingload:ai-operation:v1";

/** Stable non-cryptographic fingerprint; request content is never written to storage. */
export function aiOperationRequestFingerprint(value: unknown) {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function storageKey(kind: AiOperationKind, entityId: string) {
  return `${STORAGE_PREFIX}:${kind}:${entityId}`;
}

export function readPendingAiOperation(
  kind: AiOperationKind,
  entityId: string,
): PendingAiOperation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(kind, entityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAiOperation>;
    if (
      typeof parsed.operationId !== "string" ||
      parsed.kind !== kind ||
      parsed.entityId !== entityId ||
      typeof parsed.requestFingerprint !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      window.sessionStorage.removeItem(storageKey(kind, entityId));
      return null;
    }
    return parsed as PendingAiOperation;
  } catch {
    return null;
  }
}

export function rememberPendingAiOperation(operation: PendingAiOperation) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      storageKey(operation.kind, operation.entityId),
      JSON.stringify(operation),
    );
  } catch {
    // sessionStorage may be unavailable in private or restricted browsers.
  }
}

export function clearPendingAiOperation(
  kind: AiOperationKind,
  entityId: string,
  operationId?: string,
) {
  if (typeof window === "undefined") return;
  try {
    if (operationId) {
      const current = readPendingAiOperation(kind, entityId);
      if (current?.operationId !== operationId) return;
    }
    window.sessionStorage.removeItem(storageKey(kind, entityId));
  } catch {
    // Storage cleanup is best effort.
  }
}

export function operationIdForRequest(args: {
  kind: AiOperationKind;
  entityId: string;
  requestFingerprint: string;
}) {
  const existing = readPendingAiOperation(args.kind, args.entityId);
  if (existing?.requestFingerprint === args.requestFingerprint) {
    return existing.operationId;
  }
  const operationId = crypto.randomUUID();
  rememberPendingAiOperation({
    ...args,
    operationId,
    createdAt: new Date().toISOString(),
  });
  return operationId;
}
