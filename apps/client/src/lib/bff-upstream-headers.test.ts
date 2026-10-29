import { afterEach, describe, expect, it } from "vitest";

import {
  BACKEND_CLIENT_IP_HEADER,
  BFF_INGRESS_CLIENT_IP_HEADER,
  DESKTOP_INTERNAL_CREDENTIAL_HEADER,
  buildBffInternalHeaders,
  buildBffProxyHeaders,
  buildBffProxyResponseHeaders,
  buildBffServiceHeaders,
} from "./bff-upstream-headers";

describe("BFF upstream header policy", () => {
  const previousDesktopCredential = process.env.DESKTOP_INTERNAL_CREDENTIAL;

  afterEach(() => {
    if (previousDesktopCredential === undefined) {
      delete process.env.DESKTOP_INTERNAL_CREDENTIAL;
    } else {
      process.env.DESKTOP_INTERNAL_CREDENTIAL = previousDesktopCredential;
    }
  });

  it("promotes only the gateway-owned ingress client IP", () => {
    const source = new Headers({
      [BACKEND_CLIENT_IP_HEADER]: "198.51.100.7",
      [BFF_INGRESS_CLIENT_IP_HEADER]: "203.0.113.9",
      cookie: "session=test",
    });

    const upstream = buildBffProxyHeaders(source);

    expect(upstream.get(BACKEND_CLIENT_IP_HEADER)).toBe("203.0.113.9");
    expect(upstream.has(BFF_INGRESS_CLIENT_IP_HEADER)).toBe(false);
    expect(upstream.get("cookie")).toBe("session=test");
  });

  it("does not trust a browser-supplied backend client IP", () => {
    const upstream = buildBffProxyHeaders(
      new Headers({ [BACKEND_CLIENT_IP_HEADER]: "198.51.100.7" }),
    );

    expect(upstream.has(BACKEND_CLIENT_IP_HEADER)).toBe(false);
  });

  it("removes hop-by-hop headers and disables upstream compression", () => {
    const upstream = buildBffProxyHeaders(
      new Headers({
        connection: "keep-alive",
        host: "app.example.com",
        "x-lang": "zh",
      }),
    );

    expect(upstream.has("connection")).toBe(false);
    expect(upstream.has("host")).toBe(false);
    expect(upstream.get("x-lang")).toBe("zh");
    expect(upstream.get("accept-encoding")).toBe("identity");
  });

  it("adds the trusted client IP to purpose-built BFF requests", () => {
    const upstream = buildBffServiceHeaders(
      new Headers({ [BFF_INGRESS_CLIENT_IP_HEADER]: "192.0.2.8" }),
      { "x-lang": "en" },
    );

    expect(upstream.get(BACKEND_CLIENT_IP_HEADER)).toBe("192.0.2.8");
    expect(upstream.get("x-lang")).toBe("en");
  });

  it("preserves the ingress-only identity across an internal BFF hop", () => {
    const upstream = buildBffInternalHeaders(
      new Headers({ [BFF_INGRESS_CLIENT_IP_HEADER]: "192.0.2.12" }),
      { [BACKEND_CLIENT_IP_HEADER]: "198.51.100.2" },
    );

    expect(upstream.get(BFF_INGRESS_CLIENT_IP_HEADER)).toBe("192.0.2.12");
    expect(upstream.has(BACKEND_CLIENT_IP_HEADER)).toBe(false);
  });

  it("replaces browser-provided desktop credentials with the process secret", () => {
    process.env.DESKTOP_INTERNAL_CREDENTIAL = "desktop-process-secret";

    const proxied = buildBffProxyHeaders(
      new Headers({ [DESKTOP_INTERNAL_CREDENTIAL_HEADER]: "browser-spoof" }),
    );
    const service = buildBffServiceHeaders(
      new Headers({ [DESKTOP_INTERNAL_CREDENTIAL_HEADER]: "browser-spoof" }),
    );

    expect(proxied.get(DESKTOP_INTERNAL_CREDENTIAL_HEADER)).toBe(
      "desktop-process-secret",
    );
    expect(service.get(DESKTOP_INTERNAL_CREDENTIAL_HEADER)).toBe(
      "desktop-process-secret",
    );
  });

  it("does not forward a browser desktop credential outside Desktop", () => {
    delete process.env.DESKTOP_INTERNAL_CREDENTIAL;

    const upstream = buildBffProxyHeaders(
      new Headers({ [DESKTOP_INTERNAL_CREDENTIAL_HEADER]: "browser-spoof" }),
    );

    expect(upstream.has(DESKTOP_INTERNAL_CREDENTIAL_HEADER)).toBe(false);
  });

  it("preserves multiple auth cookies as separate response headers", () => {
    const source = new Headers({
      "content-encoding": "gzip",
      "content-length": "123",
      "x-request-id": "request-1",
    });
    Object.defineProperty(source, "getSetCookie", {
      value: () => [
        "session=token; Path=/; HttpOnly; SameSite=Lax",
        "session_data=value; Expires=Sat, 25 Oct 2026 08:00:00 GMT; Path=/",
      ],
    });

    const response = buildBffProxyResponseHeaders(source);
    const cookieAwareResponse = response as Headers & {
      getSetCookie?: () => string[];
    };

    expect(cookieAwareResponse.getSetCookie?.()).toEqual([
      "session=token; Path=/; HttpOnly; SameSite=Lax",
      "session_data=value; Expires=Sat, 25 Oct 2026 08:00:00 GMT; Path=/",
    ]);
    expect(response.has("content-encoding")).toBe(false);
    expect(response.has("content-length")).toBe(false);
    expect(response.get("x-request-id")).toBe("request-1");
    expect(response.get("cache-control")).toBe("no-store");
  });
});
