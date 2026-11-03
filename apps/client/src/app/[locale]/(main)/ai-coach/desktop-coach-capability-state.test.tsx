import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ApiFetchError } from "@/lib/api-error";
import { AiCoachClientLoader } from "./ai-coach-client-loader";

const mocks = vi.hoisted(() => ({
  desktop: true,
  state: "disabled",
  pending: false,
  hasCapability: true,
  configurationPending: false,
  configurationError: null as Error | null,
  retryCapabilities: vi.fn(),
  retryConfiguration: vi.fn(),
  readConfiguration: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div>Coach conversation</div>,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/hooks/use-runtime-environment", () => ({
  useRuntimeEnvironment: () => ({ isDesktopSelfHost: mocks.desktop }),
}));
vi.mock("@/api/runtime-capabilities", () => ({
  runtimeCapabilityAvailable: (capability?: { state: string }) =>
    capability?.state === "enabled",
  useRuntimeCapabilities: () => ({
    data: mocks.hasCapability ? {
      capabilities: { ai: {
        name: "ai", state: mocks.state, provider: "none",
        code: "SELF_HOST_CAPABILITY_DISABLED", issues: [], required: false,
      } },
    } : undefined,
    isPending: mocks.pending,
    refetch: mocks.retryCapabilities,
  }),
}));
vi.mock("@/api/self-host-ai-configuration", () => ({
  useSelfHostAiConfiguration: (enabled: boolean) => {
    mocks.readConfiguration(enabled);
    return {
      data: !mocks.configurationPending && !mocks.configurationError
        ? { provider: "none" } : undefined,
      isPending: mocks.configurationPending,
      isError: Boolean(mocks.configurationError),
      error: mocks.configurationError,
      refetch: mocks.retryConfiguration,
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks, {
    desktop: true, state: "disabled", pending: false,
    hasCapability: true, configurationPending: false,
    configurationError: null,
  });
});

describe("desktop Coach availability", () => {
  it.each(["disabled", "not_configured"])("offers configuration for %s AI without exposing a diagnostic code", (state) => {
    mocks.state = state;
    render(<AiCoachClientLoader />);
    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "configure" })).toHaveAttribute("href", "/settings#self-host-ai");
    expect(screen.queryByText("SELF_HOST_CAPABILITY_DISABLED")).not.toBeInTheDocument();
  });

  it("distinguishes incomplete configuration from an unconfigured provider", () => {
    mocks.state = "misconfigured";
    render(<AiCoachClientLoader />);
    expect(screen.getByRole("heading", { name: "incompleteTitle" })).toBeInTheDocument();
    expect(screen.getByText("incompleteDescription")).toBeInTheDocument();
  });

  it("waits for capabilities and owner access before offering configuration", () => {
    mocks.hasCapability = false;
    mocks.pending = true;
    const view = render(<AiCoachClientLoader />);
    expect(screen.getByRole("status")).toHaveTextContent("loading");
    expect(mocks.readConfiguration).toHaveBeenLastCalledWith(false);
    mocks.hasCapability = true;
    mocks.pending = false;
    mocks.configurationPending = true;
    view.rerender(<AiCoachClientLoader />);
    expect(screen.getByRole("status")).toHaveTextContent("loading");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not offer an owner-only action to an unauthorized account", () => {
    mocks.configurationError = new ApiFetchError("Forbidden", 403);
    render(<AiCoachClientLoader />);
    expect(screen.getByText("ownerRequired")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("retries a failed capability request instead of calling it unconfigured", () => {
    mocks.hasCapability = false;
    render(<AiCoachClientLoader />);
    expect(screen.getByRole("heading", { name: "unavailableTitle" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(mocks.retryCapabilities).toHaveBeenCalledOnce();
  });

  it("can retry a failed owner-settings read", () => {
    mocks.configurationError = new ApiFetchError("Unavailable", 503);
    render(<AiCoachClientLoader />);
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(mocks.retryConfiguration).toHaveBeenCalledOnce();
  });

  it("loads the existing conversation once AI becomes enabled", () => {
    const view = render(<AiCoachClientLoader />);
    mocks.state = "enabled";
    view.rerender(<AiCoachClientLoader />);
    expect(screen.getByText("Coach conversation")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "configure" })).not.toBeInTheDocument();
  });

  it("preserves browser behavior without fetching owner settings", () => {
    mocks.desktop = false;
    render(<AiCoachClientLoader />);
    expect(screen.getByText("reasonServer")).toBeInTheDocument();
    expect(mocks.readConfiguration).not.toHaveBeenCalled();
  });
});
