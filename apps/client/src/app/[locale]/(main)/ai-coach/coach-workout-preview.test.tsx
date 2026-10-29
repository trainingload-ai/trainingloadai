import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { CoachWorkoutPreview } from "./coach-workout-preview";
import messages from "../../../../../../../packages/messages/client-core/zh.json";

const parse = vi.hoisted(() => vi.fn());
vi.mock("@/api/workout", () => ({ parseWorkoutDefinition: parse }));
vi.mock("@/components/workout/WorkoutRenderer", () => ({
  WorkoutRenderer: () => <div data-testid="workout-structure" />,
}));
function preview(twice = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachWorkoutPreview text="work 30m pace z2" sportType="RUN" />
        {twice ? (
          <CoachWorkoutPreview text="work 30m pace z2" sportType="RUN" />
        ) : null}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  parse.mockReset();
});
describe("Coach workout preview", () => {
  it("shares one read-only canonical parse request for identical previews", async () => {
    parse.mockResolvedValue({
      text: "work 30m pace z2",
      kind: "ENDURANCE",
      structure: { kind: "ENDURANCE", version: 1, blocks: [] },
    });
    preview(true);
    await waitFor(() =>
      expect(screen.getAllByTestId("workout-structure")).toHaveLength(2),
    );
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledWith({
      kind: "ENDURANCE",
      version: 1,
      source: "TEXT",
      text: "work 30m pace z2",
    });
  });
  it("shows an accessible pending state without hiding the text", () => {
    parse.mockReturnValue(new Promise(() => {}));
    preview();
    expect(screen.getByRole("status")).toHaveAccessibleName();
    expect(screen.getByText("work 30m pace z2")).toBeInTheDocument();
  });
  it("opens the original workout when parsing fails and does not retry", async () => {
    parse.mockRejectedValue(new Error("parse failed"));
    preview();
    await waitFor(() =>
      expect(
        screen.getByText("work 30m pace z2").closest("details"),
      ).toHaveAttribute("open"),
    );
    expect(parse).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
