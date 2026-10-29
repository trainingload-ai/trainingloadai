import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));

import {
  getAiTodaySuggestion,
  readAuthorizedWeatherLocation,
} from "./ai-today-suggestion";

describe("getAiTodaySuggestion", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts locale, timezone, and an ephemeral location", async () => {
    const location = {
      latitude: 31.23,
      longitude: 121.474,
      accuracyMeters: 350,
      capturedAt: "2026-08-15T06:10:00.000Z",
    };
    await getAiTodaySuggestion("zh", "Asia/Shanghai", location);

    expect(apiFetch).toHaveBeenCalledWith("/ai/today-suggestion", {
      method: "POST",
      body: JSON.stringify({
        locale: "zh",
        timezone: "Asia/Shanghai",
        location,
      }),
    });
  });

  it("omits blank optional query parameters", async () => {
    await getAiTodaySuggestion(" ", " ");

    expect(apiFetch).toHaveBeenCalledWith("/ai/today-suggestion", {
      method: "POST",
      body: JSON.stringify({}),
    });
  });

  it("does not read browser location while the public feature flag is disabled", async () => {
    const query = vi.fn();
    vi.stubGlobal("navigator", {
      permissions: { query },
      geolocation: { getCurrentPosition: vi.fn() },
    });

    await expect(readAuthorizedWeatherLocation()).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("silently reads and rounds an already-authorized browser location", async () => {
    vi.stubEnv("NEXT_PUBLIC_AI_TODAY_WEATHER_ENABLED", "true");
    const query = vi.fn().mockResolvedValue({ state: "granted" });
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 31.23049,
          longitude: 121.47351,
          accuracy: 350,
        },
        timestamp: Date.parse("2026-08-15T06:10:00.000Z"),
      } as GeolocationPosition),
    );
    vi.stubGlobal("navigator", {
      permissions: { query },
      geolocation: { getCurrentPosition },
    });

    await expect(readAuthorizedWeatherLocation()).resolves.toEqual({
      latitude: 31.23,
      longitude: 121.474,
      accuracyMeters: 350,
      capturedAt: "2026-08-15T06:10:00.000Z",
    });
    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
  });
});
