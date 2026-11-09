import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThirdPartyConnections } from "./ThirdPartyConnections";

const fixture = vi.hoisted(() => ({ deployment: "cloud", personal: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="connection-dialog" />,
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
  useIntervalsIcuStatus: () => ({ data: { connected: false } }),
}));
vi.mock("@/api/personal-integrations", () => ({
  usePersonalConnection: fixture.personal,
}));
vi.mock("@/components/third-party/third-party-connection-card", () => ({
  ThirdPartyConnectionList: ({ items }: any) => (
    <>
      {items.map((item: any) => (
        <div key={item.provider}>{item.name}</div>
      ))}
    </>
  ),
}));
beforeEach(() => {
  fixture.personal.mockReset().mockReturnValue({ data: { connected: false } });
  fixture.deployment = "cloud";
  window.history.replaceState({}, "", "/zh/account?personalProvider=coros");
});
afterEach(() => window.history.replaceState({}, "", "/"));
describe("personal providers are exclusive to Self-host", () => {
  it("does not show or request personal providers in Cloud, even with stale enabled capability values and URL parameters", () => {
    render(<ThirdPartyConnections />);
    expect(screen.queryByText("Garmin")).not.toBeInTheDocument();
    expect(screen.queryByText("COROS")).not.toBeInTheDocument();
    expect(screen.queryByTestId("connection-dialog")).not.toBeInTheDocument();
    expect(fixture.personal).toHaveBeenCalledWith("garmin", false);
    expect(fixture.personal).toHaveBeenCalledWith("coros", false);
  });
  it("enables personal connections in Self-host", () => {
    fixture.deployment = "self-host";
    render(<ThirdPartyConnections />);
    expect(screen.getByText("Garmin")).toBeInTheDocument();
    expect(screen.getByText("COROS")).toBeInTheDocument();
    expect(fixture.personal).toHaveBeenCalledWith("garmin", true);
    expect(fixture.personal).toHaveBeenCalledWith("coros", true);
  });
});
