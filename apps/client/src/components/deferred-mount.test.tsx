import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeferredMount } from "./deferred-mount";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeferredMount", () => {
  it("mounts children once the boundary enters the preload margin", () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "320px 0px";
      thresholds = [0];
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(
      <DeferredMount fallback={<span>loading</span>}>
        <span>content</span>
      </DeferredMount>,
    );

    expect(screen.getByText("loading")).toBeVisible();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
    expect(observe).toHaveBeenCalledTimes(1);

    act(() => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByText("content")).toBeVisible();
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });
});
