import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxyUpstream } from "./proxy-upstream";

vi.mock("./server-api-base-url", () => ({
  getServerApiBaseUrl: () => "http://server:3001",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("same-origin upstream proxy", () => {
  it("buffers small JSON requests instead of forwarding a fragile request stream", async () => {
    const request = new NextRequest(
      "http://localhost:3002/api/proxy/auth/sign-in/email",
      {
        method: "POST",
        body: JSON.stringify({
          email: "athlete@example.com",
          password: "example-password",
        }),
        headers: { "content-type": "application/json" },
      },
    );
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "INVALID_EMAIL_OR_PASSWORD" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const result = await proxyUpstream(request, ["auth", "sign-in", "email"]);
    const options = fetcher.mock.calls[0][1];

    expect(options.body).toBeInstanceOf(ArrayBuffer);
    expect(options.duplex).toBeUndefined();
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ code: "INVALID_EMAIL_OR_PASSWORD" });
  });

  it("rejects oversized buffered request bodies before contacting the API", async () => {
    const request = new NextRequest(
      "http://localhost:3002/api/proxy/auth/sign-in/email",
      {
        method: "POST",
        body: "{}",
        headers: {
          "content-type": "application/json",
          "content-length": String(2 * 1024 * 1024 + 1),
        },
      },
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const result = await proxyUpstream(request, ["auth", "sign-in", "email"]);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.status).toBe(413);
    expect(await result.json()).toEqual({
      error_code: "REQUEST_BODY_TOO_LARGE",
      message: "Request body is too large",
    });
  });

  it("streams the request and response and forwards disconnect cancellation", async () => {
    const request = new NextRequest(
      "http://localhost:43210/api/proxy/api/import?locale=zh",
      {
        method: "POST",
        body: "activity-file",
        headers: { "content-type": "application/octet-stream" },
      },
    );
    const response = new Response("event: progress\ndata: done\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
    const fetcher = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetcher);
    const result = await proxyUpstream(request, ["api", "import"]);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("http://server:3001/api/import?locale=zh");
    expect(options.body).toBe(request.body);
    expect(options.duplex).toBe("half");
    expect(options.signal).toBe(request.signal);
    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(await result.text()).toContain("event: progress");
  });
  it("does not trust Client-IP headers in the direct self-host topology", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_HOST_MODE", "core-local");
    const request = new NextRequest("http://localhost:43210/api/health/ready", {
      headers: {
        "x-trainingload-ingress-client-ip": "198.51.100.1",
        "x-trainingload-client-ip": "198.51.100.2",
      },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetcher);
    await proxyUpstream(request, ["api", "health", "ready"]);
    expect(
      fetcher.mock.calls[0][1].headers.has("x-trainingload-client-ip"),
    ).toBe(false);
    expect(
      fetcher.mock.calls[0][1].headers.has("x-trainingload-ingress-client-ip"),
    ).toBe(false);
  });
  it("returns a stable 502 when the API process is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private-internal-address")),
    );
    const result = await proxyUpstream(
      new NextRequest("http://localhost/api/health"),
      ["api", "health"],
    );
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({
      error_code: "UPSTREAM_UNAVAILABLE",
      message: "API server is unavailable",
    });
  });
});
