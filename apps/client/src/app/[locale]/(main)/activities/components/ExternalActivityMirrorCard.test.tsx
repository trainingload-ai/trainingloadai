import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../../../../../packages/messages/client-core/en.json";
import type { V2ExternalActivityMirror } from "@/api/v2-activities";
import { ExternalActivityMirrorCard } from "./ExternalActivityMirrorCard";

vi.mock("@/components/third-party/provider-favicon", () => ({
  isThirdPartyProviderBrand: () => false,
  thirdPartyProviderName: (provider: string) => provider,
  ProviderFavicon: () => null,
}));
vi.mock("@/components/activities/map-thumbnail", () => ({
  MapThumbnail: () => null,
}));

function Harness({
  overrides = {},
}: {
  overrides?: Partial<V2ExternalActivityMirror>;
}) {
  const t = useTranslations("V2ActivitiesPage");
  const mirror: V2ExternalActivityMirror = {
    id: "source",
    kind: "external_activity_mirror",
    title: "Manual run",
    startTime: "2026-08-01T00:00:00Z",
    discoveredVia: "strava",
    originProvider: "strava",
    status: "BLOCKED",
    reason: "UPSTREAM_DATA_UNAVAILABLE",
    action: "RETRY",
    ...overrides,
  };
  return <ExternalActivityMirrorCard mirror={mirror} t={t} />;
}

describe("unavailable source mirror presentation", () => {
  it("shows the actual discovery provider and unavailable records instead of connection repair", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Harness />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/Discovered via strava/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only the activity summary is available; detailed records could not be retrieved.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Why?" })).toHaveAttribute(
      "href",
      "https://www.trainingload.ai/en/docs/guide/shadow-activities",
    );
    expect(
      screen.queryByText(/Check the source connection/),
    ).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("strava")).toHaveLength(1);
  });

  it.each(["zh", "zh-hant"])(
    "links Intervals.icu shadows to the Chinese guide for %s before connecting",
    (locale) => {
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Harness
            overrides={{
              discoveredVia: "intervals_icu",
              action: "MANAGE_CONNECTION",
              reason: "ORIGIN_CONNECTION_REQUIRED",
            }}
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByRole("link", { name: "Why?" })).toHaveAttribute(
        "href",
        "https://www.trainingload.ai/zh/docs/guide/shadow-activities",
      );
      expect(screen.getByRole("link", { name: /Connect/ })).toBeInTheDocument();
    },
  );
});
