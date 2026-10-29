import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { GET, POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("docs public API proxy", () => {
  it("rejects every backend namespace except public", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://docs.local/api/proxy/auth/session"),
      { params: Promise.resolve({ path: ["auth", "session"] }) },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects dot segments before URL resolution", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://docs.local/api/proxy/public/%2e%2e/auth/session"),
      {
        params: Promise.resolve({
          path: ["public", "..", "auth", "session"],
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies public requests to the runtime internal API", async () => {
    vi.stubEnv("DOCS_INTERNAL_API_URL", "http://server:3001");
    const fetchMock = vi.fn(
      async () =>
        new Response("converted", {
          status: 201,
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": 'attachment; filename="result.fit"',
            "set-cookie": "private=1",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new NextRequest("http://docs.local/api/proxy/public/convert?format=fit", {
        method: "POST",
        body: "payload",
        headers: {
          "content-type": "text/plain",
          cookie: "must-not-forward=1",
          "x-client-trace-id": "trace-1",
        },
      }),
      { params: Promise.resolve({ path: ["public", "convert"] }) },
    );

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("converted");
    expect(response.headers.get("content-disposition")).toContain("result.fit");
    expect(response.headers.get("set-cookie")).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.toString()).toBe("http://server:3001/public/convert?format=fit");
    const headers = new Headers(init.headers);
    expect(headers.get("x-client-trace-id")).toBe("trace-1");
    expect(headers.get("cookie")).toBeNull();
  });

  it("rejects oversized requests before contacting the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new NextRequest("http://docs.local/api/proxy/public/convert", {
        method: "POST",
        body: "x",
        headers: { "content-length": String(33 * 1024 * 1024) },
      }),
      { params: Promise.resolve({ path: ["public", "convert"] }) },
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
