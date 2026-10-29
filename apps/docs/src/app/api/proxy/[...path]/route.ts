import { type NextRequest, NextResponse } from "next/server";
import { getDocsServerApiBaseUrl } from "@/lib/docs-server-api-base-url";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "x-client-trace-id",
  "x-lang",
]);
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function proxyError(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

function upstreamHeaders(request: NextRequest) {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("accept-encoding", "identity");
  return headers;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  if (
    path[0] !== "public" ||
    path.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return proxyError(404, "DOCS_PROXY_PATH_NOT_ALLOWED");
  }

  const declaredLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return proxyError(413, "DOCS_PROXY_BODY_TOO_LARGE");
  }

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? null : await request.arrayBuffer();
  if (body && body.byteLength > MAX_REQUEST_BYTES) {
    return proxyError(413, "DOCS_PROXY_BODY_TOO_LARGE");
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `/${path.map(encodeURIComponent).join("/")}`,
    `${getDocsServerApiBaseUrl()}/`,
  );
  upstreamUrl.search = requestUrl.search;

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders(request),
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      const normalized = key.toLowerCase();
      if (
        HOP_BY_HOP_HEADERS.has(normalized) ||
        normalized === "content-encoding" ||
        normalized === "content-length" ||
        normalized === "set-cookie"
      ) {
        return;
      }
      responseHeaders.set(key, value);
    });
    responseHeaders.set("cache-control", "no-store");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return proxyError(502, "DOCS_PROXY_UPSTREAM_UNAVAILABLE");
  }
}

export const GET = proxy;
export const POST = proxy;
