import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiDataConsentReminder } from "./AiDataConsentReminder";

const mocks = vi.hoisted(() => ({
  state: "UNDECIDED",
  publicDemoActive: false,
  track: vi.fn(),
  consentOptions: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/api/ai-data-consent", () => ({
  useAiDataConsent: (options?: { enabled?: boolean }) => {
    mocks.consentOptions(options);
    return {
      data: { state: mocks.state },
    };
  },
}));
vi.mock("@/public-demo/public-demo-provider", () => ({
  usePublicDemo: () => ({ active: mocks.publicDemoActive }),
}));
vi.mock("@/lib/analytics", () => ({ track: mocks.track }));
vi.mock("./AiDataConsentDialog", () => ({
  AiDataConsentDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">AI consent</div> : null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.state = "UNDECIDED";
  mocks.publicDemoActive = false;
});

describe("AiDataConsentReminder", () => {
  it.each(["UNDECIDED", "DECLINED", "RECONSENT_REQUIRED"])(
    "keeps the reminder available for %s",
    (state) => {
      mocks.state = state;
      render(<AiDataConsentReminder />);

      const reminder = screen.getByRole("button", { name: /title/ });
      expect(reminder).toBeVisible();
      fireEvent.click(reminder);
      expect(screen.getByRole("dialog")).toBeVisible();
    },
  );

  it.each(["GRANTED", "UNAVAILABLE"])("hides the reminder for %s", (state) => {
    mocks.state = state;
    render(<AiDataConsentReminder />);

    expect(screen.queryByRole("button", { name: /title/ })).toBeNull();
  });

  it("does not ask a read-only Demo visitor to decide for the data owner", () => {
    mocks.publicDemoActive = true;

    render(<AiDataConsentReminder />);

    expect(mocks.consentOptions).toHaveBeenCalledWith({ enabled: false });
    expect(mocks.track).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /title/ })).toBeNull();
  });
});
