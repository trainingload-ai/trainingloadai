import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountPrivacyDataLinks } from "./AccountPrivacyDataLinks";

const mocks = vi.hoisted(() => ({
  consentEnabled: true,
  consentQueryEnabled: undefined as boolean | undefined,
  memoryEnabled: true,
  selfHostAi: {
    isEnabled: false,
    isOwner: false,
    isResolving: false,
    configuration: {
      data: undefined as
        | {
            provider: "deepseek" | "none";
            apiKeyConfigured: boolean;
          }
        | undefined,
      isLoading: false,
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { enabled: mocks.memoryEnabled },
    isLoading: false,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    if (namespace === "SelfHostAiSettings") {
      const values: Record<string, string> = {
        title: "Self-hosted AI",
        summaryDescription: "Instance AI configuration",
        privacySummaryDescription:
          "Review AI data processing and the current state",
        statusDisabled: "Disabled",
        "providers.deepseek": "DeepSeek",
        "providers.none": "Disable AI",
      };
      return values[key] ?? key;
    }
    const values: Record<string, string> = {
      title: "Privacy and data",
      description: "Privacy section",
      "status.loading": "Loading",
      "status.enabled": "Allowed",
      "status.disabled": "Not allowed",
      "ai.title": "Privacy and AI",
      "ai.description": "Manage personal consent",
      "memory.title": "Memory",
      "memory.description": "Manage memory",
      "memory.statusEnabled": "Enabled",
      "memory.statusDisabled": "Disabled",
      "export.title": "Export",
      "export.description": "Export data",
    };
    return values[key] ?? key;
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

vi.mock("@/api/ai-data-consent", () => ({
  useAiDataConsent: (options?: { enabled?: boolean }) => {
    mocks.consentQueryEnabled = options?.enabled;
    return {
      data: { granted: mocks.consentEnabled },
      isLoading: false,
    };
  },
}));

describe("AccountPrivacyDataLinks", () => {
  beforeEach(() => {
    mocks.consentEnabled = true;
    mocks.consentQueryEnabled = undefined;
    mocks.memoryEnabled = true;
    mocks.selfHostAi.isEnabled = false;
    mocks.selfHostAi.isOwner = false;
    mocks.selfHostAi.isResolving = false;
    mocks.selfHostAi.configuration.data = undefined;
    mocks.selfHostAi.configuration.isLoading = false;
  });

  it("shows instance AI configuration for the self-host owner", () => {
    mocks.selfHostAi.isEnabled = true;
    mocks.selfHostAi.isOwner = true;
    mocks.selfHostAi.configuration.data = {
      provider: "deepseek",
      apiKeyConfigured: true,
    };

    render(<AccountPrivacyDataLinks />);

    expect(screen.getByText("Self-hosted AI")).toBeInTheDocument();
    expect(
      screen.getByText("Review AI data processing and the current state"),
    ).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.queryByText("Privacy and AI")).not.toBeInTheDocument();
    expect(mocks.consentQueryEnabled).toBe(false);
  });

  it("does not present a selected provider as enabled before AI is configured", () => {
    mocks.selfHostAi.isOwner = true;
    mocks.selfHostAi.configuration.data = {
      provider: "deepseek",
      apiKeyConfigured: false,
    };

    render(<AccountPrivacyDataLinks />);

    expect(screen.getAllByText("Disabled")).not.toHaveLength(0);
    expect(screen.queryByText("DeepSeek")).not.toBeInTheDocument();
  });

  it("shows the effective cross-conversation memory state", () => {
    render(<AccountPrivacyDataLinks />);

    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("keeps personal consent for users without owner access", () => {
    render(<AccountPrivacyDataLinks />);

    expect(screen.getByText("Privacy and AI")).toBeInTheDocument();
    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.queryByText("Self-hosted AI")).not.toBeInTheDocument();
    expect(mocks.consentQueryEnabled).toBe(true);
  });
});
