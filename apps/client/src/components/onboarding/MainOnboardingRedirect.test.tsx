import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MainOnboardingRedirect } from "./MainOnboardingRedirect";

const mocks = vi.hoisted(() => ({
  isNewUser: false,
  replace: vi.fn(),
}));

vi.mock("@/api/use-user", () => ({
  useIsNewUser: () => ({ data: mocks.isNewUser }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

describe("MainOnboardingRedirect", () => {
  beforeEach(() => {
    mocks.isNewUser = false;
    mocks.replace.mockReset();
  });

  it("redirects new users to onboarding", async () => {
    mocks.isNewUser = true;

    render(<MainOnboardingRedirect />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("does not redirect returning users", () => {
    render(<MainOnboardingRedirect />);

    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
