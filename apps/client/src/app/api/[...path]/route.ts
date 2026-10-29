import type { NextRequest } from "next/server";
import { proxyUpstream } from "@/lib/proxy-upstream";

type Context = { params: Promise<{ path: string[] }> };
async function proxy(request: NextRequest, context: Context) {
  return proxyUpstream(request, ["api", ...(await context.params).path]);
}
export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
