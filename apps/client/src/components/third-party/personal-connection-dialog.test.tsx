import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../packages/messages/personal-integrations/en.json";
import coreMessages from "../../../../../packages/messages/client-core/en.json";
import { PersonalConnectionDialog } from "./personal-connection-dialog";

const fixtures = vi.hoisted(() => ({
  request: vi.fn(),
  refetch: vi.fn(),
  invalidate: vi.fn(),
  status: {
    connected: false,
    state: "NOT_CONNECTED",
    jobs: [],
    settings: {
      automatic: true,
      activities: true,
      wellness: false,
      allowWrites: false,
      timezone: "UTC",
    },
  } as any,
}));
vi.mock("@/api/personal-integrations", () => ({
  personalRequest: fixtures.request,
  usePersonalConnection: () => ({
    data: fixtures.status,
    refetch: fixtures.refetch,
    isPending: false,
  }),
}));
vi.mock("@/lib/query-invalidation", () => ({
  invalidateAfterActivityImportComplete: fixtures.invalidate,
}));

function mount(provider: "garmin" | "coros") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = () => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale="en"
        messages={{
          SharedUI: coreMessages.SharedUI,
          PersonalIntegrations: messages,
        }}
      >
        <PersonalConnectionDialog
          provider={provider}
          open
          onOpenChange={() => undefined}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, refresh: () => view.rerender(ui()) };
}
beforeEach(() => {
  fixtures.request.mockReset();
  fixtures.refetch.mockReset();
  fixtures.invalidate.mockReset();
  fixtures.status = {
    connected: false,
    state: "NOT_CONNECTED",
    jobs: [],
    settings: {
      automatic: true,
      activities: true,
      wellness: false,
      allowWrites: false,
      timezone: "UTC",
    },
  };
});
describe("personal account connection dialog", () => {
  it("refreshes imported data as failed parent tasks finish their remaining children", async () => {
    const job = {
      id: "partial",
      kind: "SYNC",
      status: "FAILED",
      result: { imported: 1, pending: 1 },
    };
    fixtures.status = {
      ...fixtures.status,
      connected: true,
      state: "ACTIVE",
      region: "global",
      jobs: [job],
    };
    const view = mount("garmin");
    await waitFor(() => expect(fixtures.invalidate).toHaveBeenCalledTimes(1));
    fixtures.status = {
      ...fixtures.status,
      jobs: [{ ...job, result: { imported: 2, pending: 0 } }],
    };
    view.refresh();
    await waitFor(() => expect(fixtures.invalidate).toHaveBeenCalledTimes(2));
    fixtures.status = { ...fixtures.status };
    view.refresh();
    expect(fixtures.invalidate).toHaveBeenCalledTimes(2);
  });
  it("requires saving changed sync directions before starting a sync", () => {
    fixtures.status = {
      ...fixtures.status,
      connected: true,
      state: "ACTIVE",
      region: "global",
    };
    mount("garmin");
    const sync = screen.getByRole("button", { name: "Sync now" });
    expect(sync).toBeEnabled();
    fireEvent.click(
      screen.getByRole("switch", { name: "Read sleep and recovery data" }),
    );
    expect(sync).toBeDisabled();
    expect(
      screen.getByText("Save your changed settings before starting a sync."),
    ).toBeVisible();
    expect(fixtures.request).not.toHaveBeenCalled();
  });
  it("restores the configured region for an expired connection without a replacement confirmation after explicit disconnect", () => {
    fixtures.status = {
      ...fixtures.status,
      connected: false,
      state: "DISCONNECTED",
      region: "cn",
      settings: { ...fixtures.status.settings, timezone: "Asia/Shanghai" },
    };
    mount("garmin");
    expect(screen.getByLabelText("Account region")).toHaveTextContent("China");
    expect(screen.queryByLabelText("Account time zone")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Replace the existing connection and cancel its pending jobs.",
      ),
    ).not.toBeInTheDocument();
  });
  it("checks an unknown delivery by a read-only reconciliation request", async () => {
    fixtures.status = {
      ...fixtures.status,
      connected: true,
      state: "ACTIVE",
      region: "cn",
      accountId: "owner",
      jobs: [
        { id: "unknown", kind: "WRITE", status: "UNKNOWN", reconciling: true },
      ],
    };
    fixtures.request.mockResolvedValue({
      status: "UNKNOWN",
      reconciling: true,
    });
    mount("coros");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(fixtures.request).toHaveBeenCalledWith(
        "coros",
        "/operations/unknown/reconcile",
        {},
      ),
    );
    expect(
      screen.getByText(
        "A read-only check is queued. The workout will not be sent again.",
      ),
    ).toBeVisible();
  });
  it("masks a Garmin key, keeps writes unavailable and waits for the server", async () => {
    let resolve!: (value: unknown) => void;
    fixtures.request.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount("garmin");
    const input = screen.getByLabelText("Personal API key");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.queryByText("Allow confirmed writes to COROS")).toBeNull();
    fireEvent.change(input, { target: { value: "fixture-only-personal-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect Garmin" }));
    expect(screen.queryByText("Connected", { exact: true })).toBeNull();
    resolve({ connected: true });
    await waitFor(() =>
      expect(screen.getByText("Connected", { exact: true })).toBeVisible(),
    );
    expect(fixtures.request).toHaveBeenCalledWith(
      "garmin",
      "/connect",
      expect.objectContaining({
        apiKey: "fixture-only-personal-key",
        settings: expect.objectContaining({
          allowWrites: false,
          wellness: false,
        }),
      }),
    );
    expect(input).toHaveValue("");
  });
  it("shows waiting-to-retry when a SYNC job has a retryable error", () => {
    fixtures.status = {
      ...fixtures.status,
      connected: true,
      state: "ACTIVE",
      region: "us",
      accountId: "fixture-owner",
      jobs: [
        {
          id: "pending",
          kind: "SYNC",
          status: "WAITING",
          result: { discovered: 3, imported: 0 },
          errorCode: "PROVIDER_RATE_LIMITED",
          nextAttemptAt: "2026-11-01T00:00:00Z",
        },
      ],
    };
    mount("coros");
    expect(screen.getByText("Waiting to retry", { exact: true })).toBeVisible();
    expect(
      screen.getByText("Found 3 · Downloading 0 · Importing 0 · Completed 0 · Health data 0 · Failed 0"),
    ).toBeVisible();
    expect(fixtures.request).not.toHaveBeenCalled();
  });
  it("shows syncing activities for parent SYNC WAITING without an error", () => {
    fixtures.status = {
      ...fixtures.status,
      connected: true,
      state: "ACTIVE",
      region: "global",
      accountId: "fixture-owner",
      jobs: [
        {
          id: "sync-progress",
          kind: "SYNC",
          status: "WAITING",
          startDate: "2026-01-01",
          endDate: "2026-10-31",
          trigger: "manual",
          result: { discovered: 33, imported: 0, failed: 0, healthDays: 0 },
          errorCode: null,
          nextAttemptAt: "2026-11-09T11:12:53Z",
        },
      ],
    };
    mount("garmin");
    expect(
      screen.getByText("Syncing activities", { exact: true }),
    ).toBeVisible();
    expect(screen.queryByText("Waiting to retry", { exact: true })).toBeNull();
    expect(screen.getByText("Manual sync", { exact: true })).toBeVisible();
    expect(screen.getByText("2026-01-01 – 2026-10-31", { exact: true })).toBeVisible();
    expect(
      screen.getByText("Found 33 · Downloading 0 · Importing 0 · Completed 0 · Health data 0 · Failed 0"),
    ).toBeVisible();
  });
  it("shows at most two recent jobs with range and mechanism labels", () => {
    fixtures.status = {
      ...fixtures.status,
      connected: true,
      state: "ACTIVE",
      region: "global",
      accountId: "fixture-owner",
      jobs: [
        {
          id: "manual",
          kind: "SYNC",
          status: "RUNNING",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          trigger: "manual",
          result: { discovered: 4, imported: 1 },
          nextAttemptAt: "2026-11-09T12:00:00Z",
        },
        {
          id: "dawn",
          kind: "SYNC",
          status: "SUCCEEDED",
          startDate: "2026-11-08",
          endDate: "2026-11-09",
          trigger: "dawn",
          result: { discovered: 1, imported: 1 },
          nextAttemptAt: "2026-11-09T12:00:00Z",
        },
        {
          id: "old",
          kind: "SYNC",
          status: "SUCCEEDED",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          trigger: "first_connect",
          result: { discovered: 9, imported: 9 },
          nextAttemptAt: "2026-11-09T12:00:00Z",
        },
      ],
    };
    mount("garmin");
    const list = screen.getByLabelText("Recent jobs");
    expect(list.querySelectorAll(":scope > li")).toHaveLength(2);
    expect(screen.getByText("Manual sync", { exact: true })).toBeVisible();
    expect(screen.getByText("Automatic sync", { exact: true })).toBeVisible();
    expect(screen.queryByText("Initial sync", { exact: true })).toBeNull();
    expect(screen.getByText("2026-09-01 – 2026-09-30", { exact: true })).toBeVisible();
    expect(screen.getByText("2026-11-08 – 2026-11-09", { exact: true })).toBeVisible();
    expect(screen.queryByText("2026-01-01 – 2026-01-31", { exact: true })).toBeNull();
  });
  it("lets an expired connection return to the key replacement form", () => {
    fixtures.status = {
      ...fixtures.status,
      connected: true,
      state: "ACTIVE",
      region: "global",
      accountId: "fixture-owner",
    };
    mount("garmin");
    fireEvent.click(
      screen.getByRole("button", { name: "Replace key or reauthorize" }),
    );
    expect(screen.getByLabelText("Personal API key")).toBeVisible();
    expect(
      screen.getByText(
        "Replace the existing connection and cancel its pending jobs.",
      ),
    ).toBeVisible();
  });
});
