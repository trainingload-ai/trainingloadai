import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocalAccountDeleteSection } from "./LocalAccountDeleteSection";

vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      localSectionTitle: "删除本地账户",
      localSectionDescription: "永久删除本地账户及其数据。",
      localAction: "永久删除本地账户",
      localFinalTitle: "删除这个本地账户？",
      localFinalDetail: "提交后将永久删除本地数据。",
      cancel: "取消",
      localAcceptedTitle: "已开始删除本地账户",
      localAcceptedDetail: "实例会回到初始化状态。",
      localBackToOnboarding: "继续初始化",
      deleteFailedMessage: "账户删除失败，请稍后重试。",
    };
    return messages[key] ?? key;
  },
}));

vi.mock("@/api/self-host-bootstrap", () => ({
  useSelfHostSessionPolicy: () => ({ canDeleteAccount: true }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("LocalAccountDeleteSection", () => {
  it("uses a semantic confirmation dialog with resolved action text", () => {
    render(<LocalAccountDeleteSection />);

    fireEvent.click(
      screen.getByRole("button", { name: "永久删除本地账户" }),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("删除这个本地账户？")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "取消" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "永久删除本地账户" }),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("localAction");
  });
});
