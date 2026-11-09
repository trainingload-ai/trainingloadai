import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingImportStep } from "./OnboardingImportStep";

const fixture = vi.hoisted(() => ({
  deployment: "self-host" as string,
  personal: vi.fn(),
  intervalsConnected: false,
  garminConnected: false,
  corosConnected: false,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<any>) => {
    const Comp = (props: any) => {
      void loader;
      if (props.items) {
        return (
          <>
            {props.items.map((item: any) => (
              <div key={item.provider}>{item.name}</div>
            ))}
          </>
        );
      }
      if (props.provider) {
        return <div data-testid={`personal-dialog-${props.provider}`} />;
      }
      if (props.cardTitle || props.maxFiles) {
        return <div data-testid="upload-card" />;
      }
      return <div data-testid="intervals-dialog" />;
    };
    return Comp;
  },
}));

vi.mock("@/api/runtime-capabilities", () => ({
  useRuntimeCapabilities: () => ({
    data: {
      deployment: fixture.deployment,
      capabilities: {
        "intervals-icu-api-key": { state: "enabled" },
        "garmin-personal-api-key": { state: "enabled" },
        "coros-mcp": { state: "enabled" },
      },
    },
  }),
  runtimeCapabilityAvailable: (cap: any) => cap?.state === "enabled",
}));

vi.mock("@/api/intervals-icu", () => ({
  useIntervalsIcuStatus: () => ({
    data: { connected: fixture.intervalsConnected },
  }),
}));

vi.mock("@/api/personal-integrations", () => ({
  usePersonalConnection: (provider: "garmin" | "coros", enabled: boolean) => {
    fixture.personal(provider, enabled);
    return {
      data: {
        connected:
          provider === "garmin"
            ? fixture.garminConnected
            : fixture.corosConnected,
      },
    };
  },
}));

vi.mock("@/components/icons/garmin", () => ({
  GarminBrandIcon: () => null,
}));
vi.mock("@/components/icons/coros", () => ({
  CorosBrandIcon: () => null,
}));
vi.mock("@/components/icons/intervals-icu", () => ({
  IntervalsIcuBrandIcon: () => null,
}));

describe("OnboardingImportStep platform cards", () => {
  beforeEach(() => {
    fixture.deployment = "self-host";
    fixture.intervalsConnected = false;
    fixture.garminConnected = false;
    fixture.corosConnected = false;
    fixture.personal.mockReset();
    window.history.replaceState({}, "", "/zh/onboarding?step=import");
  });

  it("lists Intervals.icu, Garmin, and COROS on Self-host", () => {
    const onConnectionStatusChange = vi.fn();
    render(
      <OnboardingImportStep
        onConnectionStatusChange={onConnectionStatusChange}
        onUploaded={() => undefined}
      />,
    );
    expect(screen.getByText("providers.intervalsIcu.name")).toBeInTheDocument();
    expect(screen.getByText("Garmin")).toBeInTheDocument();
    expect(screen.getByText("COROS")).toBeInTheDocument();
    expect(fixture.personal).toHaveBeenCalledWith("garmin", true);
    expect(fixture.personal).toHaveBeenCalledWith("coros", true);
    expect(onConnectionStatusChange).toHaveBeenCalledWith(false);
  });

  it("hides personal providers outside Self-host", () => {
    fixture.deployment = "managed";
    render(
      <OnboardingImportStep
        onConnectionStatusChange={() => undefined}
        onUploaded={() => undefined}
      />,
    );
    expect(screen.getByText("providers.intervalsIcu.name")).toBeInTheDocument();
    expect(screen.queryByText("Garmin")).not.toBeInTheDocument();
    expect(screen.queryByText("COROS")).not.toBeInTheDocument();
    expect(fixture.personal).toHaveBeenCalledWith("garmin", false);
    expect(fixture.personal).toHaveBeenCalledWith("coros", false);
  });

  it("reports connected when any platform is linked", () => {
    fixture.garminConnected = true;
    const onConnectionStatusChange = vi.fn();
    render(
      <OnboardingImportStep
        onConnectionStatusChange={onConnectionStatusChange}
        onUploaded={() => undefined}
      />,
    );
    expect(onConnectionStatusChange).toHaveBeenCalledWith(true);
  });
});
