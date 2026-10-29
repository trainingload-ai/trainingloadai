import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelfHostAiSettings } from "./SelfHostAiSettings";

const mocks = vi.hoisted(() => ({
  deployment: "self-host" as "self-host" | "managed",
  update: vi.fn(),
  fetchConsent: vi.fn(),
  refetch: vi.fn(),
  configuration: {
    source: "owner",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "standard-model",
    defaultModelContextTokens: 128_000,
    reasoningModel: "reasoning-model",
    reasoningModelContextTokens: 256_000,
    webSearchEnabled: false,
    apiKeyConfigured: true,
    updatedAt: "2026-10-19T00:00:00.000Z",
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/api/runtime-capabilities", () => ({
  useRuntimeCapabilities: () => ({
    data: { deployment: mocks.deployment },
    isLoading: false,
  }),
}));

vi.mock("@/api/self-host-ai-configuration", () => ({
  useSelfHostAiConfiguration: () => ({
    data: mocks.configuration,
    error: null,
    isError: false,
    isLoading: false,
    refetch: mocks.refetch,
  }),
  useUpdateSelfHostAiConfiguration: () => ({
    isPending: false,
    mutateAsync: mocks.update,
  }),
}));

vi.mock("@/api/ai-data-consent", () => ({
  fetchAiDataConsentStatus: mocks.fetchConsent,
}));

function expectFieldRequirement(
  fieldId: string,
  requirement: "required" | "optional",
) {
  const label = document.querySelector(`label[for="${fieldId}"]`);
  expect(label).not.toBeNull();
  if (requirement === "required") {
    expect(label?.querySelector('[aria-hidden="true"]')).toHaveTextContent("*");
    expect(label?.querySelector(".sr-only")).toHaveTextContent("required");
    return;
  }
  expect(label?.querySelector('[aria-hidden="true"]')).toBeNull();
  expect(label).toHaveTextContent("optional");
}

describe("SelfHostAiSettings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    mocks.deployment = "self-host";
    mocks.update.mockReset();
    mocks.fetchConsent.mockReset();
    mocks.refetch.mockReset();
    Object.assign(mocks.configuration, {
      source: "owner",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "standard-model",
      defaultModelContextTokens: 128_000,
      reasoningModel: "reasoning-model",
      reasoningModelContextTokens: 256_000,
      webSearchEnabled: false,
      apiKeyConfigured: true,
      updatedAt: "2026-10-19T00:00:00.000Z",
    });
  });

  it("only exposes owner-managed AI settings on self-host deployments", () => {
    const { rerender } = render(<SelfHostAiSettings />);
    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByText("providers.openai")).toBeInTheDocument();
    expect(screen.queryByLabelText("apiKey")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "save" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "manage" }));
    expect(screen.getByLabelText("apiKey")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("apiKey")).toHaveValue("");
    expect(screen.getByPlaceholderText("apiKeyKeep")).toBeInTheDocument();

    mocks.deployment = "managed";
    rerender(<SelfHostAiSettings />);
    expect(
      screen.queryByRole("heading", { name: "title" }),
    ).not.toBeInTheDocument();
  });

  it("shows field requirements that match the current provider state", () => {
    render(<SelfHostAiSettings />);
    fireEvent.click(screen.getByRole("button", { name: "manage" }));

    expect(screen.getByLabelText("provider")).not.toHaveAttribute(
      "aria-required",
    );
    expect(
      document.querySelector('label[for="self-host-ai-provider"]'),
    ).toHaveTextContent(/^provider$/);
    expect(screen.getByLabelText("apiKey")).not.toBeRequired();
    expect(screen.getByLabelText("baseUrl")).not.toBeRequired();
    expect(screen.getByLabelText("defaultModel")).toBeRequired();
    expect(screen.getByLabelText("reasoningModel")).toBeRequired();
    expectFieldRequirement("self-host-ai-api-key", "optional");
    expectFieldRequirement("self-host-ai-base-url", "optional");
    expectFieldRequirement("self-host-ai-default-model", "required");
    expectFieldRequirement("self-host-ai-reasoning-model", "required");
  });

  it("requires a key and base URL for a new custom provider", () => {
    Object.assign(mocks.configuration, {
      source: "environment",
      provider: "custom-openai-compatible",
      baseUrl: null,
      defaultModel: null,
      defaultModelContextTokens: null,
      reasoningModel: null,
      reasoningModelContextTokens: null,
      webSearchEnabled: false,
      apiKeyConfigured: false,
    });

    render(<SelfHostAiSettings />);
    fireEvent.click(screen.getByRole("button", { name: "manage" }));

    expect(screen.getByLabelText("apiKey")).toBeRequired();
    expect(screen.getByLabelText("baseUrl")).toBeRequired();
    expectFieldRequirement("self-host-ai-api-key", "required");
    expectFieldRequirement("self-host-ai-base-url", "required");
    expectFieldRequirement("self-host-ai-default-model", "required");
    expectFieldRequirement("self-host-ai-reasoning-model", "required");
  });

  it("lets onboarding use an existing environment configuration without re-entering its key", async () => {
    const onConfigured = vi.fn();
    Object.assign(mocks.configuration, { source: "environment" });
    mocks.fetchConsent.mockResolvedValue({
      state: "GRANTED",
      granted: true,
      promptRequired: false,
      required: false,
      version: "self-host-test",
      provider: "openai",
      recipient: "OpenAI",
      decidedAt: "2026-10-20T00:00:00.000Z",
    });

    render(
      <SelfHostAiSettings
        surface="onboarding"
        onConfigured={onConfigured}
        renderActions={({ canSubmit }) => (
          <button type="submit" disabled={!canSubmit}>
            complete
          </button>
        )}
      />,
    );
    expect(screen.getByLabelText("apiKey")).not.toBeRequired();
    expect(
      screen.queryByRole("button", { name: "onboardingUseCurrent" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "complete" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "complete" }));

    await waitFor(() => expect(onConfigured).toHaveBeenCalledTimes(1));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.fetchConsent).toHaveBeenCalledTimes(1);
  });

  it("renders the configuration editor inline on the account surface", () => {
    render(<SelfHostAiSettings surface="account" />);

    expect(screen.getByLabelText("provider")).toBeInTheDocument();
    expect(screen.getByLabelText("apiKey")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "manage" }),
    ).not.toBeInTheDocument();
  });
});
