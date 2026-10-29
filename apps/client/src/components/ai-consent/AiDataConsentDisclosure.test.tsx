import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiDataConsentDisclosure } from "./AiDataConsentDisclosure";

vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

describe("AiDataConsentDisclosure", () => {
  it("opens the public privacy policy outside the onboarding route", () => {
    render(<AiDataConsentDisclosure recipient="DeepSeek" />);

    expect(screen.getByRole("link", { name: "privacyPolicy" })).toHaveAttribute(
      "href",
      "https://www.trainingload.ai/zh/privacy",
    );
    expect(screen.getByRole("link", { name: "privacyPolicy" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "privacyPolicy" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });
});
