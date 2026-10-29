import {
  coachUserMessageFromChatBody,
  parseLastUserPromptFromChatBody,
} from "@/lib/ai-coach-stream";
import { parseCoachRunCommand } from "@shared/ai-coach-run-contract";
import {
  PUBLIC_DEMO_READ_ONLY_CODE,
  PUBLIC_DEMO_TOKEN_COOKIE,
} from "@shared/public-demo-policy";
import { getServerApiBaseUrl } from "@/lib/server-api-base-url";
import { buildBffServiceHeaders } from "@/lib/bff-upstream-headers";

function getRegion(hostname: string | null): "china" | "international" {
  return hostname === "trainingload.ai" ||
    hostname?.endsWith(".trainingload.ai")
    ? "international"
    : "international";
}

export async function POST(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (
    cookies
      .split(";")
      .some((cookie) =>
        cookie.trim().startsWith(`${PUBLIC_DEMO_TOKEN_COOKIE}=`),
      )
  ) {
    return Response.json(
      {
        code: PUBLIC_DEMO_READ_ONLY_CODE,
        message: PUBLIC_DEMO_READ_ONLY_CODE,
      },
      { status: 403 },
    );
  }
  const requestUrl = new URL(request.url);
  let body: {
    id?: string;
    message?: unknown;
    messages?: unknown[];
    lang?: string;
    sid?: string;
    operationId?: string;
    purpose?: "DEFAULT" | "REASONING";
    branchId?: string;
    contextId?: string;
    planId?: string;
    openReason?: string;
    sourceNode?: unknown;
    protocolVersion?: number;
    runCommand?: unknown;
  } = {};
  const rawBody = await request.text();
  if (rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return new Response("Invalid request body", { status: 400 });
      }
      body = parsed as typeof body;
    } catch {
      return new Response("Invalid request body", { status: 400 });
    }
  }

  const hostHeader = request.headers.get("host");
  const hostname = hostHeader?.split(":")[0] || requestUrl.hostname || null;
  const prompt = parseLastUserPromptFromChatBody(
    body as Record<string, unknown>,
  );
  const coachUserMessage = coachUserMessageFromChatBody(
    body as Record<string, unknown>,
  );

  const sid = (
    requestUrl.searchParams.get("sid") ||
    body.sid ||
    body.id ||
    "default"
  ).trim();
  const lang = (
    requestUrl.searchParams.get("lang") ||
    body.lang ||
    request.headers.get("x-lang") ||
    "en"
  ).trim();
  const backendBaseUrl = getServerApiBaseUrl();
  const backendUrl = new URL("/ai/coach/ui", backendBaseUrl);

  const intent = requestUrl.searchParams.get("intent")?.trim();
  const branchId = (
    requestUrl.searchParams.get("branchId") ||
    body.branchId ||
    ""
  ).trim();
  const contextId = (
    requestUrl.searchParams.get("contextId") ||
    body.contextId ||
    ""
  ).trim();
  const planId = (
    requestUrl.searchParams.get("planId") ||
    body.planId ||
    ""
  ).trim();
  const openReason = (
    requestUrl.searchParams.get("openReason") ||
    body.openReason ||
    ""
  ).trim();
  const skipUserAppendRaw = requestUrl.searchParams.get("skip_user_append");
  const shouldSkipUserAppend =
    skipUserAppendRaw === "1" || skipUserAppendRaw === "true";
  const purpose =
    body.purpose === "REASONING" ||
    requestUrl.searchParams.get("purpose") === "REASONING"
      ? "REASONING"
      : "DEFAULT";
  const operationId =
    request.headers.get("idempotency-key")?.trim() ||
    body.operationId?.trim() ||
    crypto.randomUUID();

  const runCommand = parseCoachRunCommand(body.runCommand);
  if (body.protocolVersion === 2 && !runCommand)
    return new Response("Invalid run command", { status: 400 });
  if (!coachUserMessage && !prompt && runCommand?.kind !== "retry") {
    return new Response("Missing prompt", { status: 400 });
  }

  const backendResponse = await fetch(backendUrl, {
    method: "POST",
    headers: buildBffServiceHeaders(request.headers, {
      cookie: request.headers.get("cookie") || "",
      "content-type": "application/json",
      accept: "text/event-stream",
      "x-lang": lang,
      "x-region": getRegion(hostname),
      "idempotency-key": operationId,
    }),
    body: JSON.stringify({
      sid,
      protocolVersion: body.protocolVersion,
      runCommand,
      lang,
      ...(intent ? { intent } : {}),
      ...(branchId ? { branchId } : {}),
      ...(!branchId && contextId ? { contextId } : {}),
      ...(!branchId && planId ? { planId } : {}),
      ...(!branchId && openReason ? { openReason } : {}),
      ...(!branchId && body.sourceNode !== undefined
        ? { sourceNode: body.sourceNode }
        : {}),
      operationId,
      purpose,
      ...(shouldSkipUserAppend ? { skip_user_append: true } : {}),
      message: coachUserMessage ?? {
        content: [{ type: "text", text: prompt }],
      },
    }),
    signal: request.signal,
  });

  if (!backendResponse.ok || !backendResponse.body) {
    const errorText = await backendResponse
      .text()
      .catch(() => backendResponse.statusText);
    return new Response(errorText || "Upstream request failed", {
      status: backendResponse.status,
    });
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: {
      "x-vercel-ai-ui-message-stream": "v1",
      "content-type":
        backendResponse.headers.get("content-type") ||
        "text/event-stream; charset=utf-8",
      "cache-control":
        backendResponse.headers.get("cache-control") ||
        "no-cache, no-transform",
    },
  });
}
