import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../packages/messages/client-core/en.json";
const state = vi.hoisted(() => ({ pending: false, failed: false }));
vi.mock("@/hooks/useSetPageTitle", () => ({ useSetPageTitle: () => {} }));
vi.mock("@/public-demo/public-demo-provider", () => ({
  usePublicDemo: () => ({ active: false }),
}));
vi.mock("@/hooks/useFormatterBySettings", () => ({
  formatValue: (value: unknown) => String(value),
  getUnit: () => "",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: any) => <a href={href} {...props} />,
}));
vi.mock("@/api/health-data", () => ({
  useHealthOverview: () => ({
    data: { endDate: "2026-11-01", days: [] },
    isPending: false,
  }),
  useHealthObservations: () => ({
    isPending: state.pending,
    isError: state.failed,
    refetch: vi.fn(),
    data:
      state.pending || state.failed
        ? undefined
        : {
            items: [
              {
                id: "bp",
                groupId: "one",
                kind: "BLOOD_PRESSURE",
                scope: "MEASUREMENT",
                localDate: "2026-11-01",
                measuredAt: "2026-10-31T23:30:00Z",
                offsetSeconds: 28800,
                systolicMmHg: 120,
                diastolicMmHg: 80,
                pulseBpm: null,
                measurementOrigin: "DEVICE",
                provider: "MANUAL",
                sourceName: "Meter",
                selected: true,
              },
              {
                id: "breath",
                groupId: "two",
                kind: "BREATHING_VARIATION",
                scope: "DAILY",
                localDate: "2026-11-01",
                categoryCode: "UNMEASURABLE",
                provider: "MANUAL",
                sourceName: "Sleep source",
              },
            ],
            reports: [
              {
                id: "report",
                type: "HYDRATION_ML",
                localDate: "2026-11-01",
                value: 473,
                unit: "mL",
                provider: "MANUAL",
                sourceName: "Report",
              },
            ],
            truncated: false,
          },
  }),
}));
import { HealthRecordsPage } from "./HealthRecordsPage";
afterEach(() => {
  cleanup();
  state.pending = false;
  state.failed = false;
});
const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HealthRecordsPage />
    </NextIntlClientProvider>,
  );
describe("source-preserving health records", () => {
  it("keeps a complete blood-pressure group, missing pulse, date-only breathing and unaggregated hydration visible", () => {
    show();
    expect(screen.getByText("120 / 80 mmHg")).toBeVisible();
    expect(screen.getByText(/Pulse:.*—/)).toBeVisible();
    expect(screen.getByText("2026-11-01 07:30:00 UTC+08:00")).toBeVisible();
    expect(screen.getByText(messages.HealthRecords.dateOnly)).toBeVisible();
    expect(screen.getByText(messages.HealthRecords.reportHint)).toBeVisible();
    expect(screen.getByText("473 mL")).toBeVisible();
  });
  it("shows loading and failures rather than presenting them as an empty breathing history", () => {
    state.pending = true;
    const view = show();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    view.unmount();
    state.pending = false;
    state.failed = true;
    show();
    expect(screen.getByRole("alert")).toHaveTextContent(
      messages.HealthRecords.failed,
    );
    expect(
      screen.getByRole("button", { name: messages.HealthRecords.retry }),
    ).toBeEnabled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "30 days" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("tab", { name: "30 days" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
