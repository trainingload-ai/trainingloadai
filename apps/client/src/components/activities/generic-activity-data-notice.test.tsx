import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenericActivityDataNotice } from "./generic-activity-data-notice";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

describe("GenericActivityDataNotice", () => {
  it("explains generic data without labeling known UNKNOWN-family sports", () => {
    const { rerender } = render(
      <GenericActivityDataNotice
        activity={{ sportType: "UNKNOWN", sportDefinitionCode: "OTHER" }}
      />,
    );

    expect(screen.getByTestId("generic-activity-data-notice")).toBeVisible();
    expect(
      screen.getByText("ActivityDetail.genericDataNotice.description"),
    ).toBeVisible();

    rerender(
      <GenericActivityDataNotice
        activity={{
          sportType: "UNKNOWN",
          sportDefinitionCode: "STRENGTH_TRAINING",
        }}
      />,
    );
    expect(
      screen.queryByTestId("generic-activity-data-notice"),
    ).not.toBeInTheDocument();
  });
});
