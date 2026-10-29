import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePersistedSidebarCollapsed } from "./use-persisted-sidebar-collapsed";

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

describe("usePersistedSidebarCollapsed", () => {
  it("defaults compact widths to collapsed and persists an explicit toggle", () => {
    const { result } = renderHook(() =>
      usePersistedSidebarCollapsed({
        mode: "compact",
        defaultCollapsed: true,
      }),
    );

    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it("defaults wide desktops to expanded", () => {
    const { result } = renderHook(() =>
      usePersistedSidebarCollapsed({
        mode: "wide",
        defaultCollapsed: false,
      }),
    );

    expect(result.current.collapsed).toBe(false);
  });
});
