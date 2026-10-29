import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLastCoachSession,
  readLastCoachRoute,
  readLastProductRoute,
  rememberLastProductRoute,
} from "./app-space-memory";

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
});

describe("app space navigation memory", () => {
  it("remembers only safe product routes", () => {
    rememberLastProductRoute("/calendar");
    expect(readLastProductRoute()).toBe("/calendar");

    rememberLastProductRoute("/ai-coach");
    rememberLastProductRoute("//example.com");
    expect(readLastProductRoute()).toBe("/calendar");
  });

  it("opens coach as a new chat instead of restoring the last sid", () => {
    window.localStorage.setItem("ai_coach_sid", "session with spaces");
    expect(readLastCoachRoute()).toBe("/ai-coach");

    clearLastCoachSession();
    expect(window.localStorage.getItem("ai_coach_sid")).toBeNull();
    expect(readLastCoachRoute()).toBe("/ai-coach");
  });
});
