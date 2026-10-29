import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getApiBaseUrl,
  getAppConfig,
  getBaseUrl,
  getMarketingSiteOrigin,
} from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API origin selection", () => {
  it.each([
    ["development", undefined, "http://localhost:3001"],
    ["development", "localhost", "http://localhost:3002/api/proxy"],
    ["test", undefined, "http://localhost:3001"],
    ["production", undefined, "https://api.trainingload.ai"],
    ["production", "trainingload.ai", "https://trainingload.ai/api/proxy"],
    [
      "production",
      "app.trainingload.ai",
      "https://app.trainingload.ai/api/proxy",
    ],
    ["production", "localhost", "http://localhost:3002/api/proxy"],
  ])("%s / %s defaults to %s", (mode, hostname, expected) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
    vi.stubGlobal(
      "window",
      hostname
        ? {
            location: {
              hostname,
              origin: hostname.includes("trainingload.ai")
                ? `https://${hostname}`
                : "http://localhost:3002",
            },
          }
        : undefined,
    );

    expect(getApiBaseUrl()).toBe(expected);
  });

  it("uses the explicit API origin only during server-side execution", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3999");
    vi.stubGlobal("window", undefined);

    expect(getAppConfig()).toEqual({
      apiBaseUrl: "http://localhost:3999",
      region: "international",
    });
  });

  it("ignores the public API origin in browser runtime", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    vi.stubGlobal("window", {
      location: {
        hostname: "app.example.com",
        origin: "https://app.example.com",
      },
    });

    expect(getAppConfig()).toEqual({
      apiBaseUrl: "https://app.example.com/api/proxy",
      region: "international",
    });
  });

  it("prefers the private API origin for server-side rendering", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_INTERNAL_API_URL", "http://server:3001");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://training.example.com");
    vi.stubGlobal("window", undefined);

    expect(getApiBaseUrl()).toBe("http://server:3001");
  });

  it("uses an absolute same-origin proxy URL on the local Demo host", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_HOST", "localhost:3002");
    vi.stubGlobal("window", {
      location: {
        host: "localhost:3002",
        hostname: "localhost",
        origin: "http://localhost:3002",
      },
    });

    expect(getAppConfig()).toEqual({
      apiBaseUrl: "http://localhost:3002/api/proxy",
      region: "international",
    });
    expect(getApiBaseUrl()).toBe("http://localhost:3002/api/proxy");
  });

  it("keeps a self-host browser image relocatable with a same-origin proxy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SELF_HOST_MODE", "core-local");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://build-time.invalid");
    vi.stubGlobal("window", {
      location: {
        host: "training.home.arpa",
        hostname: "training.home.arpa",
        origin: "https://training.home.arpa",
      },
    });

    expect(getAppConfig()).toEqual({
      apiBaseUrl: "https://training.home.arpa/api/proxy",
      region: "international",
    });
    expect(getBaseUrl()).toBe("https://training.home.arpa");
    expect(getMarketingSiteOrigin()).toBe("https://training.home.arpa");
  });

  it("uses the runtime public origin during self-host server rendering", () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_HOST_MODE", "core-local");
    vi.stubEnv("CLIENT_PUBLIC_URL", "https://training.example.com/");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://build-time.invalid");
    vi.stubGlobal("window", undefined);

    expect(getBaseUrl()).toBe("https://training.example.com");
    expect(getMarketingSiteOrigin()).toBe("https://training.example.com");
  });
});
