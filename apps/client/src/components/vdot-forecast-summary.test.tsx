import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { vi } from "vitest";
import { VdotForecastSummary } from "./vdot-forecast-summary";
import messages from "../../../../packages/messages/client-core/en.json";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/api/vdot-forecast", () => ({ useVdotForecast: mocks.query }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function forecast(point = 44.15) {
  mocks.query.mockReturnValue({
    isPending: false,
    data: {
      status: "READY",
      cutoffDate: "2026-11-10",
      estimatedCurrentLevel: 48,
      forecasts: [{ week: 4, point, lower80: 42.1, upper80: 45.2 }],
    },
  });
}
function show(compact = false, currentValue = "43") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VdotForecastSummary compact={compact} currentValue={currentValue} />
    </NextIntlClientProvider>,
  );
}

describe("VDOT forecast presentation", () => {
  it("pairs the current value with the same fourth-week forecast on the card and detail", () => {
    forecast();
    const compact = show(true);
    expect(
      screen.getByLabelText(
        "In four weeks, estimated VDOT 44.2, Expected above current",
      ),
    ).toHaveClass("text-success");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    compact.unmount();
    show();
    expect(screen.getByText("Current VDOT")).toBeInTheDocument();
    expect(screen.getByText("43")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "In four weeks, estimated VDOT 44.2, Expected above current",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("80% prediction interval 42.1–45.2"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask coach" })).toHaveAttribute(
      "href",
      "/ai-coach?vdotQuestion=1",
    );
  });

  it.each([
    [41.9, "Expected below current", "text-destructive"],
    [43.04, "Expected to stay level", "text-muted-foreground"],
  ])(
    "communicates a forecast of %s without relying on color alone",
    (point, direction, color) => {
      forecast(point);
      show(true);
      expect(screen.getByLabelText(new RegExp(direction))).toHaveClass(color);
    },
  );

  it("does not infer a change when the displayed current value is unavailable", () => {
    forecast();
    show(true, "-");
    expect(
      screen.getByLabelText("In four weeks, estimated VDOT 44.2"),
    ).toHaveClass("text-muted-foreground");
  });

  it("keeps the current value visible while evidence is unavailable", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      data: { status: "INSUFFICIENT_HISTORY", forecasts: [] },
    });
    show();
    expect(screen.getByText("43")).toBeInTheDocument();
    expect(
      screen.getByText(
        "More running records are needed for a four-week forecast.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Expected in four weeks"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
