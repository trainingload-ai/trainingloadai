import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MobilePullToRefresh } from "./MobilePullToRefresh";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      refreshing: "刷新中",
      releaseToRefresh: "松开刷新",
    })[key] ?? key,
}));

function pull(root: HTMLElement, clientY: number) {
  fireEvent.touchStart(root, {
    touches: [{ clientX: 20, clientY: 100 }],
  });
  fireEvent.touchMove(root, {
    touches: [{ clientX: 20, clientY }],
  });
}

describe("MobilePullToRefresh", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
  });

  it("does not leave an idle refresh indicator exposed", () => {
    render(
      <MobilePullToRefresh onRefresh={vi.fn()}>
        <div>Home</div>
      </MobilePullToRefresh>,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reveals the release label progressively until the refresh threshold", () => {
    const { container } = render(
      <MobilePullToRefresh onRefresh={vi.fn()}>
        <div>Home</div>
      </MobilePullToRefresh>,
    );
    const root = container.firstElementChild as HTMLElement;

    pull(root, 130);
    expect(
      screen.getByRole("status").querySelector("[data-refresh-label]"),
    ).toHaveTextContent("松");
    expect(screen.getByRole("status")).toHaveAttribute("data-state", "pulling");

    fireEvent.touchMove(root, {
      touches: [{ clientX: 20, clientY: 220 }],
    });
    expect(
      screen.getByRole("status").querySelector("[data-refresh-label]"),
    ).toHaveTextContent("松开刷新");
    expect(screen.getByRole("status")).toHaveAttribute("data-state", "ready");
  });

  it("refreshes only after release beyond the threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MobilePullToRefresh onRefresh={onRefresh}>
        <div>Home</div>
      </MobilePullToRefresh>,
    );
    const root = container.firstElementChild as HTMLElement;

    pull(root, 220);
    fireEvent.touchEnd(root, { changedTouches: [{ clientY: 220 }] });

    expect(onRefresh).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("resets a cancelled pull without refreshing", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <MobilePullToRefresh onRefresh={onRefresh}>
        <div>Home</div>
      </MobilePullToRefresh>,
    );
    const root = container.firstElementChild as HTMLElement;

    pull(root, 220);
    fireEvent.touchCancel(root);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
