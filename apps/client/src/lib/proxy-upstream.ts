import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "./server-api-base-url";
import {
  buildBffProxyHeaders,
  buildBffProxyResponseHeaders,
} from "./bff-upstream-headers";

const MAX_BUFFERED_REQUEST_BYTES = 2 * 1024 * 1024;

function shouldBufferRequestBody(contentType: string | null): boolean {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" ||
    mediaType === "application/x-www-form-urlencoded"
  );
}

async function readBufferedRequestBody(
  request: NextRequest,
): Promise<ArrayBuffer> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_BUFFERED_REQUEST_BYTES
  ) {
    throw new RangeError("BUFFERED_REQUEST_BODY_TOO_LARGE");
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BUFFERED_REQUEST_BYTES) {
    throw new RangeError("BUFFERED_REQUEST_BODY_TOO_LARGE");
  }
  return body;
}

/** Stream uploads/SSE and propagate disconnects without buffering request data. */
export async function proxyUpstream(request: NextRequest, segments: string[]) {
  const url = new URL(
    `/${segments.map(encodeURIComponent).join("/")}`,
    getServerApiBaseUrl(),
  );
  url.search = request.nextUrl.search;
  const method = request.method.toUpperCase();
  const options: RequestInit & { duplex?: "half" } = {
    method,
    headers: buildBffProxyHeaders(request.headers),
    cache: "no-store",
    redirect: "manual",
    signal: request.signal,
  };
  if (method !== "GET" && method !== "HEAD" && request.body) {
    if (shouldBufferRequestBody(request.headers.get("content-type"))) {
      try {
        options.body = await readBufferedRequestBody(request);
      } catch (error) {
        if (
          error instanceof RangeError &&
          error.message === "BUFFERED_REQUEST_BODY_TOO_LARGE"
        ) {
          return NextResponse.json(
            {
              error_code: "REQUEST_BODY_TOO_LARGE",
              message: "Request body is too large",
            },
            { status: 413 },
          );
        }
        throw error;
      }
    } else {
      options.body = request.body;
      options.duplex = "half";
    }
  }
  try {
    const upstream = await fetch(url, options);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildBffProxyResponseHeaders(upstream.headers),
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    return NextResponse.json(
      {
        error_code: "UPSTREAM_UNAVAILABLE",
        message: "API server is unavailable",
      },
      { status: 502 },
    );
  }
}
