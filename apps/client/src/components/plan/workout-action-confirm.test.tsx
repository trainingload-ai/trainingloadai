import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkoutActionConfirm } from "./workout-action-confirm";

describe("WorkoutActionConfirm", () => {
  it("renders confirmations as a compact alert", () => {
    const onConfirm = vi.fn();
    render(
      <WorkoutActionConfirm
        open
        onOpenChange={vi.fn()}
        title="跳过训练？"
        description="该课次会标记为已跳过。"
        cancelLabel="取消"
        confirmLabel="跳过"
        destructive
        onConfirm={onConfirm}
      />,
    );

    expect(document.querySelector("[data-vaul-drawer]")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="alert-dialog-content"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "跳过训练？" })).toBeVisible();
    expect(screen.getByText("该课次会标记为已跳过。")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("keeps a pending action open and disables both choices", () => {
    const onOpenChange = vi.fn();
    render(
      <WorkoutActionConfirm
        open
        onOpenChange={onOpenChange}
        title="确认推迟训练？"
        description="推迟会改变后续训练衔接。"
        cancelLabel="取消"
        confirmLabel="仍要推迟"
        pending
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "仍要推迟" })).toBeDisabled();
  });
});
