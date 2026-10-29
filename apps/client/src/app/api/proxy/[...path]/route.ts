import { NextRequest, NextResponse } from "next/server";
import { proxyUpstream } from "@/lib/proxy-upstream";
import {
  PUBLIC_DEMO_READ_ONLY_CODE,
  PUBLIC_DEMO_TOKEN_COOKIE,
} from "@shared/public-demo-policy";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const method = request.method.toUpperCase();
  if (
    request.cookies.has(PUBLIC_DEMO_TOKEN_COOKIE) &&
    path[0] === "auth" &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    return NextResponse.json(
      {
        code: 403,
        error_code: PUBLIC_DEMO_READ_ONLY_CODE,
        message: PUBLIC_DEMO_READ_ONLY_CODE,
        data: null,
      },
      { status: 403 },
    );
  }
  return proxyUpstream(request, path);
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
