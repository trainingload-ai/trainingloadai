import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoachMarkdown } from "./coach-markdown";

const mocks = vi.hoisted(() => ({
  desktop: true,
  open: vi.fn(),
  copy: vi.fn(),
}));
const url = "https://m.bilibili.com/space/2266021";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/hooks/use-runtime-environment", () => ({
  useRuntimeEnvironment: () => ({
    isDesktopSelfHost: mocks.desktop,
    desktop: { openExternalLink: mocks.open },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.desktop = true;
  mocks.open.mockResolvedValue(undefined);
  mocks.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.copy },
  });
  vi.spyOn(window, "open").mockReturnValue(null);
});

function clickExternalLink() {
  render(<CoachMarkdown>{`[B站](${url})`}</CoachMarkdown>);
  fireEvent.click(screen.getByRole("button", { name: "B站" }));
}

describe("Coach Markdown external links", () => {
  it("waits for confirmation, then hands the exact URL to the desktop browser bridge", async () => {
    clickExternalLink();
    expect(await screen.findByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByText(url)).toBeInTheDocument();
    expect(mocks.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "openInBrowser" }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(url));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.open).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and offers copying when browser handoff fails", async () => {
    mocks.open.mockRejectedValueOnce(new Error("OS browser unavailable"));
    clickExternalLink();
    fireEvent.click(await screen.findByRole("button", { name: "openInBrowser" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("openFailed");
    fireEvent.click(screen.getByRole("button", { name: "copy" }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith(url));
    expect(await screen.findByRole("button", { name: "copied" })).toBeInTheDocument();
  });

  it("reports clipboard failures", async () => {
    mocks.copy.mockRejectedValueOnce(new Error("Clipboard denied"));
    clickExternalLink();
    fireEvent.click(await screen.findByRole("button", { name: "copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("copyFailed");
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("does not open a browser when the user closes the dialog", async () => {
    clickExternalLink();
    fireEvent.click(await screen.findByRole("button", { name: "close" }));
    expect(mocks.open).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("localizes the existing web confirmation and preserves browser opening behavior", async () => {
    mocks.desktop = false;
    clickExternalLink();
    expect(await screen.findByText("webDescription")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(window.open).toHaveBeenCalledWith(url, "_blank", "noreferrer");
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
