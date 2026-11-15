import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import messages from "../../../../../packages/messages/client-core/en.json";
import { IntervalsIcuConnectionDialog } from "./intervals-icu-connection-dialog";

const fixtures = vi.hoisted(() => ({
  status: { connected: true, authType: "oauth" } as Record<string, unknown>,
  connect: vi.fn(),
  disconnect: vi.fn(),
  openChange: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ timeFormat: "24h" }) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/api/intervals-icu", () => ({
  useIntervalsIcuStatus: () => ({ data: fixtures.status }),
  useConnectIntervalsIcu: () => ({ mutateAsync: fixtures.connect }),
  useDisconnectIntervalsIcu: () => ({ mutateAsync: fixtures.disconnect }),
  useStartIntervalsIcuOAuth: () => ({ mutateAsync: vi.fn() }),
  useUpdateIntervalsIcuSettings: () => ({ mutateAsync: vi.fn() }),
}));

function mount({ keepMounted = false } = {}) {
  const client = new QueryClient();
  let setParentOpen: (open: boolean) => void;
  function ConditionalParent() {
    const [open, setOpen] = useState(true);
    setParentOpen = setOpen;
    return open || keepMounted ? (
      <IntervalsIcuConnectionDialog
        open={open}
        onOpenChange={(next) => {
          fixtures.openChange(next);
          setOpen(next);
        }}
        handleOAuthResult={false}
      />
    ) : null;
  }
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConditionalParent />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return {
    ...view,
    setParentOpen: (open: boolean) => act(() => setParentOpen(open)),
  };
}

beforeEach(() => {
  fixtures.status = { connected: true, authType: "oauth" };
  fixtures.connect.mockReset().mockResolvedValue({});
  fixtures.disconnect.mockReset().mockResolvedValue({ connected: false });
  fixtures.openChange.mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Intervals.icu confirmation lifecycle", () => {
  it("resets confirmation after an external close when the parent keeps the component mounted", async () => {
    const view = mount({ keepMounted: true });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Disconnect OAuth" }));
    view.setParentOpen(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.setParentOpen(true);
    expect(
      screen.getByRole("button", { name: "Disconnect OAuth" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Disconnect Intervals.icu?"),
    ).not.toBeInTheDocument();
    expect(fixtures.disconnect).not.toHaveBeenCalled();
  });
  it.each(["oauth", "api_key"])(
    "keeps %s disconnect confirmation mounted until the user confirms",
    async (authType) => {
      fixtures.status.authType = authType;
      mount();
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", {
          name:
            authType === "oauth" ? "Disconnect OAuth" : "Disconnect API Key",
        }),
      );
      expect(screen.getByText("Disconnect Intervals.icu?")).toBeVisible();
      expect(fixtures.openChange).not.toHaveBeenCalled();
      expect(fixtures.disconnect).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    },
  );

  it.each(["cancel", "escape"])(
    "returns to settings on %s without disconnecting",
    async (action) => {
      mount();
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", { name: "Disconnect OAuth" }),
      );
      if (action === "cancel")
        await user.click(screen.getByRole("button", { name: "Cancel" }));
      else await user.keyboard("{Escape}");
      expect(
        screen.getByRole("button", { name: "Disconnect OAuth" }),
      ).toBeVisible();
      expect(fixtures.openChange).not.toHaveBeenCalled();
      expect(fixtures.disconnect).not.toHaveBeenCalled();
    },
  );

  it("shows pending feedback, prevents duplicate requests and closes the parent only after success", async () => {
    let resolve!: (value: { connected: boolean }) => void;
    fixtures.disconnect.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Disconnect OAuth" }));
    await user.dblClick(
      screen.getByRole("button", { name: "Disconnect", exact: true }),
    );
    expect(
      screen.getByRole("button", { name: "Disconnecting..." }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Disconnecting..." }),
    ).toBeVisible();
    expect(fixtures.disconnect).toHaveBeenCalledTimes(1);
    expect(fixtures.openChange).not.toHaveBeenCalled();
    resolve({ connected: false });
    await waitFor(() =>
      expect(fixtures.openChange).toHaveBeenCalledWith(false),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("keeps failed confirmation available for retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fixtures.disconnect.mockRejectedValueOnce(
      new Error("Fixture network failure"),
    );
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Disconnect OAuth" }));
    await user.click(
      screen.getByRole("button", { name: "Disconnect", exact: true }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Fixture network failure"),
    );
    expect(fixtures.openChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Disconnect", exact: true }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Disconnect", exact: true }),
    );
    await waitFor(() =>
      expect(fixtures.openChange).toHaveBeenCalledWith(false),
    );
    expect(fixtures.disconnect).toHaveBeenCalledTimes(2);
  });

  it("keeps API key replacement confirmation mounted and preserves input on cancel", async () => {
    fixtures.status.authType = "api_key";
    fixtures.connect.mockResolvedValueOnce({
      keyChangeConfirmationRequired: true,
    });
    mount();
    const user = userEvent.setup();
    const input = screen.getByLabelText("API Key", { selector: "input" });
    await user.type(input, "fixture-new-key");
    await user.click(screen.getByRole("button", { name: "Save API Key" }));
    expect(screen.getByText("Replace API key?")).toBeVisible();
    expect(fixtures.openChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("API Key", { selector: "input" })).toHaveValue(
      "fixture-new-key",
    );
    await user.click(screen.getByRole("button", { name: "Save API Key" }));
    await waitFor(() =>
      expect(fixtures.openChange).toHaveBeenCalledWith(false),
    );
  });

  it("saves a confirmed replacement before closing the parent", async () => {
    fixtures.status.authType = "api_key";
    fixtures.connect.mockResolvedValueOnce({
      keyChangeConfirmationRequired: true,
    });
    mount();
    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText("API Key", { selector: "input" }), {
      target: { value: "fixture-new-key" },
    });
    await user.click(screen.getByRole("button", { name: "Save API Key" }));
    await user.click(screen.getByRole("button", { name: "Replace key" }));
    await waitFor(() =>
      expect(fixtures.openChange).toHaveBeenCalledWith(false),
    );
    expect(fixtures.connect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKey: "fixture-new-key",
        replaceCredentialConfirmed: true,
      }),
    );
  });
});
