// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { useHealthOverviewCopy } from "@/components/health/HealthOverviewSection";
import {
  calendarMonthDayLabel,
  calendarWeekdayLabels,
} from "@/app/[locale]/(main)/calendar/components/calendar-weekday-labels";
import requestConfig from "./request";

vi.mock("next-intl/server", () => ({ getRequestConfig: (config: unknown) => config }));
vi.mock("@deployment/managed-messages", () => ({
  loadDeploymentMessages: async (_locale: string, core: object) => core,
}));

function HealthLabels() {
  const copy = useHealthOverviewCopy();
  return <div><h1>{copy.title}</h1><span>{copy.noRecentData}</span></div>;
}

describe("localized health, calendar, and integrations", () => {
  it("updates visible labels and uses English only for missing integration copy", async () => {
    const french = await requestConfig({ requestLocale: Promise.resolve("fr") } as never);
    const traditional = await requestConfig({ requestLocale: Promise.resolve("zh-hant") } as never);
    const View = ({ config }: { config: typeof french }) => (
      <NextIntlClientProvider locale={config.locale} messages={config.messages} timeZone="UTC">
        <HealthLabels />
      </NextIntlClientProvider>
    );

    const page = render(<View config={french} />);
    expect(screen.getByRole("heading", { name: "Santé quotidienne" })).toBeTruthy();
    expect(screen.getByText("Aucune donnée sur les 3 derniers jours")).toBeTruthy();
    const integrations = french.messages?.PersonalIntegrations as {
      garmin: { createKey: string };
      errors: { PROVIDER_HEALTH_DATE_MISMATCH: string };
    };
    expect(integrations.garmin.createKey).toBe("Créer une clé dans Garmin Connect");
    expect(integrations.errors.PROVIDER_HEALTH_DATE_MISMATCH).toMatch(/^The returned health date/);

    page.rerender(<View config={traditional} />);
    expect(screen.getByText("近 3 天暫無資料")).toBeTruthy();
  });

  it("localizes displayed weekdays without changing the grid order", () => {
    expect(calendarWeekdayLabels("de", 1)[0]).toMatch(/^Mo/);
    expect(calendarWeekdayLabels("ja", 0)[0]).toBe("日");
    expect(calendarWeekdayLabels("zh-hant", 0)[0]).toMatch(/^週/);
    expect(calendarMonthDayLabel("2026-11-27", "fr")).toBe("27/11");
    expect(calendarMonthDayLabel("2026-11-27", "en-US")).toBe("11/27");
  });
});
