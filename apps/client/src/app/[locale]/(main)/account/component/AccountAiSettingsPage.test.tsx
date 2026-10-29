import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountAiSettingsPage } from "./AccountAiSettingsPage";

const mocks = vi.hoisted(() => ({
  selfHostAi: {
    isOwner: false,
    isResolving: false,
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const values: Record<string, Record<string, string>> = {
      AiDataConsent: {
        settingsTitle: "Privacy and AI",
        settingsHint: "Manage personal AI consent",
      },
      SelfHostAiSettings: {
        title: "Self-hosted AI",
        description: "Configure the instance AI provider",
      },
    };
    return values[namespace]?.[key] ?? key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/useSelfHostAiAccess", () => ({
  useSelfHostAiAccess: () => mocks.selfHostAi,
}));

vi.mock("@/components/layout/MainScrollPageShell", () => ({
  MainScrollPageShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("../AccountPageTitle", () => ({
  AccountPageTitle: () => null,
}));

vi.mock("../../settings/component/SelfHostAiSettings", () => ({
  SelfHostAiSettings: ({ surface }: { surface: string }) => (
    <div>self-host-form-{surface}</div>
  ),
}));

vi.mock("./PrivacyAiSettings", () => ({
  PrivacyAiSettings: () => <div>personal-consent</div>,
}));

describe("AccountAiSettingsPage", () => {
  beforeEach(() => {
    mocks.selfHostAi.isOwner = false;
    mocks.selfHostAi.isResolving = false;
  });

  it("renders the instance configuration for the self-host owner", () => {
    mocks.selfHostAi.isOwner = true;

    render(<AccountAiSettingsPage />);

    expect(
      screen.getByRole("heading", { name: "Self-hosted AI" }),
    ).toBeInTheDocument();
    expect(screen.getByText("self-host-form-account")).toBeInTheDocument();
    expect(screen.queryByText("personal-consent")).not.toBeInTheDocument();
  });

  it("renders personal consent for users without owner access", () => {
    render(<AccountAiSettingsPage />);

    expect(
      screen.getByRole("heading", { name: "Privacy and AI" }),
    ).toBeInTheDocument();
    expect(screen.getByText("personal-consent")).toBeInTheDocument();
    expect(
      screen.queryByText("self-host-form-account"),
    ).not.toBeInTheDocument();
  });
});
