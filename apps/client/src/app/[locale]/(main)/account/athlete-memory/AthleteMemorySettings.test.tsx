import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AthleteMemorySettings } from "./AthleteMemorySettings";

const mocks = vi.hoisted(() => ({
  preference: {
    available: true,
    consentRequired: false,
    enabled: false,
    effectiveEnabled: false,
    updatedAt: null,
  },
  page: {
    items: [] as Array<Record<string, unknown>>,
    nextCursor: null,
  },
  updatePreference: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "zh-CN",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/api/athlete-memory", () => ({
  correctAthleteMemoryFact: vi.fn(),
  deleteAthleteMemoryFact: vi.fn(),
  exportAthleteMemory: vi.fn(),
  fetchAthleteMemoryPage: vi.fn(async () => mocks.page),
  fetchAthleteMemoryPreference: vi.fn(async () => mocks.preference),
  updateAthleteMemoryPreference: mocks.updatePreference,
}));

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AthleteMemorySettings />
    </QueryClientProvider>,
  );
}

describe("AthleteMemorySettings", () => {
  beforeEach(() => {
    mocks.preference = {
      available: true,
      consentRequired: false,
      enabled: false,
      effectiveEnabled: false,
      updatedAt: null,
    };
    mocks.page = { items: [], nextCursor: null };
    mocks.updatePreference.mockReset();
    mocks.updatePreference.mockResolvedValue({ ok: true });
    mocks.toastSuccess.mockReset();
  });

  it("hides export and destructive actions when no memory exists", async () => {
    renderSettings();

    expect(await screen.findByText("emptyTitle")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "export" })).toBeNull();
    expect(screen.queryByText("clearTitle")).toBeNull();
  });

  it("keeps the default-on preference visible when AI consent is pending", async () => {
    mocks.preference = {
      ...mocks.preference,
      enabled: true,
      effectiveEnabled: false,
      consentRequired: true,
    };
    renderSettings();

    const memorySwitch = await screen.findByRole("switch", {
      name: "toggleTitle",
    });
    await waitFor(() => {
      expect(memorySwitch).toBeChecked();
      expect(memorySwitch).toBeEnabled();
    });
    expect(screen.getByText("consentRequired")).toBeInTheDocument();
  });

  it("turns memory off first, then offers to clear saved memories", async () => {
    const user = userEvent.setup();
    mocks.preference = { ...mocks.preference, enabled: true };
    mocks.page = {
      items: [
        {
          id: "memory-1",
          category: "sleep_quality",
          claim: "昨晚睡眠质量较差",
          status: "ACTIVE",
          version: 1,
          eventStart: "2026-10-12T23:00:00.000Z",
          eventEnd: null,
          createdAt: "2026-10-13T08:00:00.000Z",
        },
      ],
      nextCursor: null,
    };
    renderSettings();

    const memorySwitch = await screen.findByRole("switch", {
      name: "toggleTitle",
    });
    await user.click(memorySwitch);

    await waitFor(() =>
      expect(mocks.updatePreference.mock.calls[0]?.[0]).toEqual({
        enabled: false,
      }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("button", { name: "disableKeep" }),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "disableKeep" }),
    );

    expect(mocks.updatePreference).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("preferenceDisabled");
  });

  it("clears existing memories when requested after disabling", async () => {
    const user = userEvent.setup();
    mocks.preference = { ...mocks.preference, enabled: true };
    mocks.page = {
      items: [
        {
          id: "memory-1",
          category: "fatigue",
          claim: "近期疲劳偏高",
          status: "ACTIVE",
          version: 1,
          eventStart: null,
          eventEnd: null,
          createdAt: "2026-10-24T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    };
    renderSettings();

    await user.click(
      await screen.findByRole("switch", { name: "toggleTitle" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "disableClear" }),
    );

    await waitFor(() =>
      expect(mocks.updatePreference.mock.calls.at(-1)?.[0]).toEqual({
        enabled: false,
        clearHistory: true,
      }),
    );
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith("memoriesCleared");
  });
});
