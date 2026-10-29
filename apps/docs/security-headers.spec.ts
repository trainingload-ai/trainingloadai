import { describe, expect, it } from "vitest";
import {
  createSiteSecurityHeaders,
  SITE_SECURITY_HEADERS,
} from "./security-headers.mjs";

describe("site security headers", () => {
  const headers = new Map(
    SITE_SECURITY_HEADERS.map(({ key, value }) => [key.toLowerCase(), value]),
  );

  it("publishes the browser protections checked by the domain audit", () => {
    expect(headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("permissions-policy")).toBeTruthy();
  });

  it("keeps the CSP restrictive while allowing required production services", () => {
    const csp = headers.get("content-security-policy");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src 'self' https://demo.trainingload.ai");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://api.trainingload.ai");
    expect(csp).toContain("https://*.posthog.com");
    expect(csp).toContain("https://*.sentry.io");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("does not extend HSTS to unaudited subdomains or preload lists", () => {
    const hsts = headers.get("strict-transport-security");

    expect(hsts).not.toContain("includeSubDomains");
    expect(hsts).not.toContain("preload");
  });

  it("allows eval only when Next.js development diagnostics need it", () => {
    const developmentHeaders = new Map(
      createSiteSecurityHeaders({ allowDevelopmentEval: true }).map(
        ({ key, value }) => [key.toLowerCase(), value],
      ),
    );

    expect(developmentHeaders.get("content-security-policy")).toContain(
      "'unsafe-eval'",
    );
    expect(headers.get("content-security-policy")).not.toContain(
      "'unsafe-eval'",
    );
  });

  it("removes remote telemetry origins for self-host builds", () => {
    const selfHostHeaders = new Map(
      createSiteSecurityHeaders({
        allowDemoFrame: false,
        allowManagedApi: false,
        allowTelemetry: false,
      }).map(({ key, value }) => [key.toLowerCase(), value]),
    );
    const csp = selfHostHeaders.get("content-security-policy");

    expect(csp).not.toContain("googletagmanager.com");
    expect(csp).not.toContain("google-analytics.com");
    expect(csp).not.toContain("posthog.com");
    expect(csp).not.toContain("sentry.io");
    expect(csp).not.toContain("api.trainingload.ai");
    expect(csp).not.toContain("demo.trainingload.ai");
    expect(csp).toContain("frame-src 'self'");
  });

  it("allows an explicitly configured local Demo frame only in local development", () => {
    const developmentHeaders = new Map(
      createSiteSecurityHeaders({
        allowDevelopmentEval: true,
        demoFrameOrigin: "http://localhost:3002",
      }).map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(developmentHeaders.get("content-security-policy")).toContain(
      "frame-src 'self' http://localhost:3002",
    );
    expect(
      new Map(
        createSiteSecurityHeaders({
          demoFrameOrigin: "http://example.com:3002",
        }).map(({ key, value }) => [key.toLowerCase(), value]),
      ).get("content-security-policy"),
    ).toContain("frame-src 'self' https://demo.trainingload.ai");
  });
});
