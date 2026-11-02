import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../packages/messages/client-core/en.json";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/api/routes", () => ({
  useSavedRoutes: () => ({
    data: { pages: [{ items: [] }] },
    isPending: false,
  }),
  useSavedRoute: () => ({ data: undefined }),
  importSavedRoute: mocks.save,
  removeSavedRoute: mocks.remove,
  downloadSavedRoute: mocks.download,
}));
vi.mock("@/api/sports", () => ({
  getLocalizedSportDefinitionName: ({ code }: any) => code,
}));
vi.mock("@/hooks/useSetPageTitle", () => ({ useSetPageTitle: () => {} }));
vi.mock("@deployment/managed-ui", () => ({ RouteDeliveryActions: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
import { RoutesLibrary } from "./routes-library";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("route library import recovery", () => {
  it("reuses the review request after a failed response and changes identity when the content changes", async () => {
    mocks.save.mockRejectedValue(new Error("network"));
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RoutesLibrary />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import route" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "River route" },
    });
    fireEvent.change(screen.getByLabelText("GPX"), {
      target: {
        files: [
          new File(["<gpx/>"], "route.gpx", { type: "application/gpx+xml" }),
        ],
      },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save route" }).closest("form")!,
    );
    await screen.findByRole("alert");
    const first = mocks.save.mock.calls[0][0];
    expect(first.sportCode).toBe("ROAD_RUNNING");
    expect(first.requestId).toMatch(/^[a-f0-9-]{36}$/);
    fireEvent.submit(
      screen.getByRole("button", { name: "Save route" }).closest("form")!,
    );
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][0].requestId).toBe(first.requestId);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save route" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Changed route" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save route" }).closest("form")!,
    );
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(3));
    expect(mocks.save.mock.calls[2][0].requestId).not.toBe(first.requestId);
  });
});
