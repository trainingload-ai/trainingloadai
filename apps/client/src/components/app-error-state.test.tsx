import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import messages from "../../../../packages/messages/client-core/zh.json";
import { AppErrorState } from "./app-error-state";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ back: vi.fn() }),
}));

afterEach(cleanup);

function view(kind: "server-error" | "not-found") {
  return (
    <NextIntlClientProvider locale="zh" messages={messages}>
      <AppErrorState kind={kind} onRetry={() => undefined} />
    </NextIntlClientProvider>
  );
}

describe("AppErrorState", () => {
  it("uses compact sm buttons on the recovery-mode page", () => {
    render(view("server-error"));

    const retry = screen.getByRole("button", { name: "重试" });
    const overview = screen.getByRole("button", { name: "回到概览" });

    expect(retry.className).toMatch(/\bh-8\b/);
    expect(retry.className).not.toMatch(/\bh-11\b/);
    expect(overview.className).toMatch(/\bh-8\b/);
    expect(overview.className).toMatch(/\bborder\b/);
    expect(screen.getByText("500 / 恢复模式")).toBeInTheDocument();
  });

  it("keeps the same compact size on the not-found page", () => {
    render(view("not-found"));

    const primary = screen.getByRole("button", { name: "回到概览" });
    const secondary = screen.getByRole("button", { name: "返回上一页" });

    expect(primary.className).toMatch(/\bh-8\b/);
    expect(secondary.className).toMatch(/\bh-8\b/);
  });
});
