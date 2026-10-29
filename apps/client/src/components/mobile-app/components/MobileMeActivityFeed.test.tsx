import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { V2ActivityListItem } from "@/api/v2-activities";
import { ActivityList } from "./MobileMeActivityFeed";

vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => (key === "delete" ? "删除" : key),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

const activity = {
  id: 1,
  hashId: "activity-one",
  title: "晨跑",
  sportType: "RUN",
  startTime: "2026-08-10T06:00:00.000Z",
  duration: 1800,
  distance: 5000,
  load: 32,
} as V2ActivityListItem;

describe("MobileMeActivityFeed activity list", () => {
  it("only reveals the delete action after swiping left", () => {
    const onDeleteRequest = vi.fn();
    render(
      <ActivityList
        items={[activity]}
        date={new Intl.DateTimeFormat("zh")}
        number={new Intl.NumberFormat("zh")}
        loadLabel="负荷"
        onDeleteRequest={onDeleteRequest}
        sportLabel={() => "跑步"}
      />,
    );

    const row = screen.getByRole("link", { name: /晨跑/ });
    const deleteAction = screen.getByText("删除").closest("button");
    expect(deleteAction).not.toBeNull();
    if (!deleteAction) throw new Error("Delete action is missing");
    expect(deleteAction).toHaveAttribute("aria-hidden", "true");
    expect(row).toHaveClass("bg-white", "dark:bg-zinc-900");

    const pointerEvent = (type: string, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX,
        clientY,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event;
    };
    fireEvent(row, pointerEvent("pointerdown", 200, 20));
    fireEvent(row, pointerEvent("pointermove", 120, 22));
    fireEvent(row, pointerEvent("pointerup", 120, 22));

    expect(deleteAction).toHaveAttribute("aria-hidden", "false");
    fireEvent.click(deleteAction);
    expect(onDeleteRequest).toHaveBeenCalledWith(activity);
  });
});
