import { existsSync, readFileSync } from "node:fs";
import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import proxy from "./proxy";

vi.mock("fumadocs-core/i18n/middleware", () => ({
  createI18nMiddleware: () => () => new Response(null, { status: 200 }),
}));

const PROXY_MATCHER =
  "/((?!api|monitoring|_next/static|_next/image|favicon.ico).*)";
const proxyMatcher = new RegExp(`^${PROXY_MATCHER}$`);
const event = {} as NextFetchEvent;

describe("locale proxy", () => {
  it("suggests browser languages on the client without redirecting an English URL", () => {
    const response = proxy(
      new NextRequest("https://www.trainingload.ai/docs", {
        headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" },
      }),
      event,
    ) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://www.trainingload.ai/en/docs",
    );
  });

  it("honors a language the user already chose explicitly", () => {
    const response = proxy(
      new NextRequest("https://www.trainingload.ai/docs?source=directory", {
        headers: { cookie: "NEXT_LOCALE=zh" },
      }),
      event,
    ) as Response;
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.trainingload.ai/zh/docs?source=directory",
    );
  });

  it("keeps the statically analyzable proxy config in sync", () => {
    const source = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");
    const i18nSource = readFileSync(
      new URL("./lib/i18n.ts", import.meta.url),
      "utf8",
    );

    expect(existsSync(new URL("../proxy.ts", import.meta.url))).toBe(false);
    expect(source).toContain(JSON.stringify(PROXY_MATCHER));
    expect(source).toContain("publicHtmlPathFromMarkdown");
    expect(source).toContain("INTERNAL_LOCALE_REWRITE_HEADER");
    expect(i18nSource).toContain('hideLocale: "default-locale"');
  });

  it("matches page routes while excluding APIs and framework assets", () => {
    expect(proxyMatcher.test("/")).toBe(true);
    expect(proxyMatcher.test("/docs")).toBe(true);
    expect(proxyMatcher.test("/zh/docs/guide/product-tour.mdx")).toBe(true);
    expect(proxyMatcher.test("/api/search")).toBe(false);
    expect(proxyMatcher.test("/monitoring")).toBe(false);
    expect(proxyMatcher.test("/_next/static/chunk.js")).toBe(false);
    expect(proxyMatcher.test("/favicon.ico")).toBe(false);
  });

  it("rewrites an unprefixed English URL once without redirecting it to itself", () => {
    const response = proxy(
      new NextRequest("https://www.trainingload.ai/docs"),
      event,
    ) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://www.trainingload.ai/en/docs",
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets the marked internal locale rewrite reach the App Router", () => {
    const response = proxy(
      new NextRequest("https://www.trainingload.ai/en/docs", {
        headers: {
          "x-trainingload-internal-locale-rewrite": "1",
        },
      }),
      event,
    ) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("canonicalizes an external /en URL to the unprefixed form", () => {
    const response = proxy(
      new NextRequest("https://www.trainingload.ai/en/docs"),
      event,
    ) as Response;

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.trainingload.ai/docs",
    );
  });
});
