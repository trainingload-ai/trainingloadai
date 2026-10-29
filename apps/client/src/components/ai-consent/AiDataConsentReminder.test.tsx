import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiDataConsentReminder } from "./AiDataConsentReminder";

const mocks = vi.hoisted(() => ({
  state: "UNDECIDED",
  track: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/api/ai-data-consent", () => ({
  useAiDataConsent: () => ({
    data: { state: mocks.state },
  }),
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

  it.each(["GRANTED", "UNAVAILABLE"])(
    "hides the reminder for %s",
    (state) => {
      mocks.state = state;
      render(<AiDataConsentReminder />);

      expect(screen.queryByRole("button", { name: /title/ })).toBeNull();
    },
  );
});
