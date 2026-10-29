import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SIDEBAR_WIDTH_LIMITS,
  usePersistedSidebarWidth,
} from "./use-persisted-sidebar-width";

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

describe("usePersistedSidebarWidth", () => {
  it("uses the shared default width", () => {
    const { result } = renderHook(() => usePersistedSidebarWidth());

    expect(result.current.width).toBe(SIDEBAR_WIDTH_LIMITS.default);
  });

  it("persists width changes and clamps them to the shared bounds", () => {
    const { result } = renderHook(() => usePersistedSidebarWidth());

    act(() => result.current.setWidth(288));
    expect(result.current.width).toBe(288);
    expect(window.localStorage.getItem("sidebar:width:v2")).toBe("288");

    act(() => result.current.setWidth(999));
    expect(result.current.width).toBe(SIDEBAR_WIDTH_LIMITS.max);
  });

  it("shares width changes across sidebar consumers", () => {
    const first = renderHook(() => usePersistedSidebarWidth());
    const second = renderHook(() => usePersistedSidebarWidth());

    act(() => first.result.current.setWidth(264));

    expect(first.result.current.width).toBe(264);
    expect(second.result.current.width).toBe(264);
  });
});
