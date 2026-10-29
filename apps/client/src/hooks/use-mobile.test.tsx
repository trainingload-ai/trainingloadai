import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BELOW_PC_MEDIA_QUERY,
  COMPACT_SIDEBAR_MEDIA_QUERY,
  MOBILE_MEDIA_QUERY,
  PC_MEDIA_QUERY,
  TABLET_MEDIA_QUERY,
  useMobileOnlyOpen,
} from "./use-mobile";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useMobileOnlyOpen", () => {
  it("closes an open mobile portal when the viewport switches to PC", async () => {
    let matches = true;
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    window.matchMedia = vi.fn((query: string) => {
      expect(query).toBe(MOBILE_MEDIA_QUERY);
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          changeListener = listener;
        },
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      } as MediaQueryList;
    });
    const onOpenChange = vi.fn();
    const { result } = renderHook(() =>
      useMobileOnlyOpen(true, onOpenChange),
    );

    await waitFor(() => expect(result.current).toBe(true));

    matches = false;
    act(() => {
      changeListener?.({ matches: false } as MediaQueryListEvent);
    });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(result.current).toBe(false);
  });

  it("supports responsive surfaces that remain mobile below the PC breakpoint", async () => {
    window.matchMedia = vi.fn((query: string) => {
      expect(query).toBe(BELOW_PC_MEDIA_QUERY);
      return {
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      } as MediaQueryList;
    });
    const onOpenChange = vi.fn();
    const { result } = renderHook(() =>
      useMobileOnlyOpen(true, onOpenChange, BELOW_PC_MEDIA_QUERY),
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("viewport contracts", () => {
  it("keeps phone, tablet, PC, and compact sidebar ranges disjoint", () => {
    expect(MOBILE_MEDIA_QUERY).toBe("(max-width: 767px)");
    expect(TABLET_MEDIA_QUERY).toBe(
      "(min-width: 768px) and (max-width: 1023px)",
    );
    expect(PC_MEDIA_QUERY).toBe("(min-width: 1024px)");
    expect(BELOW_PC_MEDIA_QUERY).toBe("(max-width: 1023px)");
    expect(COMPACT_SIDEBAR_MEDIA_QUERY).toBe("(max-width: 1279px)");
  });
});
