import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkoutDetailActions } from "./workout-detail-actions";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const handlers = () => ({
  onPostpone: vi.fn().mockResolvedValue(undefined),
  onSkip: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
});
describe("workout detail actions", () => {
  it.each([
    ["Postpone", "onPostpone"],
    ["Skip", "onSkip"],
    ["Delete", "onDelete"],
  ] as const)(
    "confirms %s before making any mutation",
    async (label, handler) => {
      const callbacks = handlers();
      render(
        <WorkoutDetailActions
          capabilities={{ postpone: true, skip: true, delete: true }}
          pending={false}
          {...callbacks}
        />,
      );
      fireEvent.keyDown(screen.getByRole("button", { name: "moreActions" }), {
        key: "ArrowDown",
      });
      fireEvent.click(
        await screen.findByRole("menuitem", { name: `action${label}` }),
      );
      expect(screen.getByRole("alertdialog")).toBeVisible();
      expect(callbacks[handler]).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: `action${label}` }));
      await waitFor(() => expect(callbacks[handler]).toHaveBeenCalledTimes(1));
    },
  );
  it("does not expose mutation actions on protected workouts", () => {
    render(
      <WorkoutDetailActions
        capabilities={{ postpone: false, skip: false, delete: false }}
        pending={false}
        {...handlers()}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("keeps the confirmation open when the mutation failed", async () => {
    const callbacks = handlers();
    callbacks.onDelete.mockResolvedValue(false);
    render(
      <WorkoutDetailActions
        capabilities={{ postpone: false, skip: false, delete: true }}
        pending={false}
        {...callbacks}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "moreActions" }), {
      key: "ArrowDown",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "actionDelete" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "actionDelete" }));
    await waitFor(() => expect(callbacks.onDelete).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });
});
