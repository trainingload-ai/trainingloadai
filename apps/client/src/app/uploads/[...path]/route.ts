import type { NextRequest } from "next/server";
import { proxyUpstream } from "@/lib/proxy-upstream";

type Context = { params: Promise<{ path: string[] }> };
async function proxy(request: NextRequest, context: Context) {
  return proxyUpstream(request, ["uploads", ...(await context.params).path]);
}
export const GET = proxy;
export const HEAD = proxy;
