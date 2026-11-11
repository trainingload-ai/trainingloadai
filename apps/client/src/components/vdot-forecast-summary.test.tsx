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

function show(compact = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VdotForecastSummary compact={compact} />
    </NextIntlClientProvider>,
  );
}

describe("VDOT forecast presentation", () => {
  it("shows the same fourth-week value on the compact card and detail, with a draft-only coach link", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      data: {
        status: "READY",
        cutoffDate: "2026-11-10",
        forecasts: [{ week: 4, point: 44.15, lower80: 43.1, upper80: 45.2 }],
      },
    });
    const compact = show(true);
    expect(
      screen.getByText("In four weeks, estimated VDOT 44.2"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    compact.unmount();
    show();
    expect(
      screen.getByText("In four weeks, estimated VDOT 44.2"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("80% prediction interval 43.1–45.2"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask coach" })).toHaveAttribute(
      "href",
      "/ai-coach?vdotQuestion=1",
    );
  });

  it("reports unavailable evidence without numerical projections", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      data: { status: "INSUFFICIENT_HISTORY", forecasts: [] },
    });
    show();
    expect(
      screen.getByText(
        "More running records are needed for a four-week forecast.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("vdot-forecast-summary"),
    ).not.toBeInTheDocument();
  });
});
