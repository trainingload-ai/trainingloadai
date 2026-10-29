"use client";

type Primitive = string | number | boolean | null | undefined;

type ErrorPayload = {
  message?: unknown;
  data?: unknown;
  code?: unknown;
  errorCode?: unknown;
  path?: unknown;
};

export type ToolRequestErrorMeta = {
  bodyPreview?: string;
  clientTraceId?: string;
  contentType?: string;
  errorCategory?: string;
  errorOrigin?: string;
  path?: string;
  retryable?: boolean;
  serverCode?: string;
  serverRequestId?: string;
  status: number;
  suggestedAction?: string;
};

export class ToolRequestError extends Error {
  readonly meta: ToolRequestErrorMeta;

  constructor(message: string, meta: ToolRequestErrorMeta) {
    super(message);
    this.name = "ToolRequestError";
    this.meta = meta;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractMessage(maybe: unknown): string | null {
  if (typeof maybe === "string" && maybe.trim()) return maybe.trim();
  if (Array.isArray(maybe)) {
    const items = maybe
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    if (items.length > 0) return items.join("; ");
  }
  return null;
}

function normalizeServerCode(code: unknown): string | undefined {
  if (typeof code === "number" && Number.isFinite(code)) return String(code);
  if (typeof code === "string" && code.trim()) return code.trim();
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanPreview(text: string): string | undefined {
  const normalized = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 160);
}

function readServerRequestId(headers: Headers): string | undefined {
  return (
    headers.get("x-request-id") ||
    headers.get("x-correlation-id") ||
    headers.get("x-amzn-trace-id") ||
    undefined
  );
}

function randomToken() {
  const value = Math.random().toString(36).slice(2, 10);
  return value || Date.now().toString(36);
}

export function createClientTraceId(prefix: string) {
  const token =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().split("-")[0]
      : randomToken();
  return `${prefix}_${token}`;
}

export async function buildToolRequestError(
  res: Response,
  fallbackMessage: string,
  clientTraceId?: string,
): Promise<ToolRequestError> {
  const contentType = res.headers.get("content-type") || undefined;
  const raw = await res.text();
  const parsed = raw ? safeJsonParse(raw) : null;
  const payload =
    parsed && typeof parsed === "object" ? (parsed as ErrorPayload) : null;

  const message =
    extractMessage(payload?.message) ||
    extractMessage(
      (payload?.data as { message?: unknown } | undefined)?.message,
    ) ||
    fallbackMessage;

  const path =
    typeof payload?.path === "string" && payload.path.trim()
      ? payload.path
      : undefined;
  const data =
    payload?.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;

  return new ToolRequestError(message, {
    bodyPreview: cleanPreview(raw),
    clientTraceId,
    contentType,
    errorCategory: readString(data?.category),
    errorOrigin: readString(data?.origin),
    path,
    retryable:
      typeof data?.retryable === "boolean" ? data.retryable : undefined,
    serverCode:
      normalizeServerCode(payload?.errorCode) ??
      normalizeServerCode(payload?.code),
    serverRequestId: readServerRequestId(res.headers),
    status: res.status,
    suggestedAction: readString(data?.suggestedAction),
  });
}

export function appendErrorReference(message: string, ref?: string) {
  if (!ref) return message;
  return `${message} (ref: ${ref})`;
}

export function getToolRequestErrorMeta(error: unknown) {
  if (!(error instanceof ToolRequestError)) return {};

  const meta = error.meta;
  const payload: Record<string, Primitive> = {
    client_trace_id: meta.clientTraceId,
    http_status: meta.status,
    response_content_type: meta.contentType,
    error_category: meta.errorCategory,
    error_origin: meta.errorOrigin,
    error_retryable: meta.retryable,
    suggested_action: meta.suggestedAction,
    response_path: meta.path,
    server_code: meta.serverCode,
    server_request_id: meta.serverRequestId,
    response_preview: meta.bodyPreview,
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value != null),
  );
}

export function isFileInputToolRequestError(error: unknown) {
  return (
    error instanceof ToolRequestError &&
    error.meta.status >= 400 &&
    error.meta.status < 500 &&
    error.meta.errorCategory === "FILE_INPUT"
  );
}
