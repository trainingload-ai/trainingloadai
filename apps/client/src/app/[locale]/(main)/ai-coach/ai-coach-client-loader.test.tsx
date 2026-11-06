import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import messages from "../../../../../../../packages/messages/client-core/zh.json";
import { AiCoachClientLoader } from "./ai-coach-client-loader";

const refetch = vi.fn();
let deployment: "managed" | "self-host" = "managed";
const runtime = {
  data: {
    capabilities: {
      ai: {
        name: "ai" as const,
        required: false,
        state: "not_configured" as const,
        provider: "none",
        code: "SELF_HOST_CAPABILITY_NOT_CONFIGURED",
        issues: [],
      },
    },
  },
  isFetching: false,
  refetch,
};

vi.mock("next/dynamic", () => ({
  default: () => () => <div>AI coach</div>,
}));

vi.mock("@/api/runtime-capabilities", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/api/runtime-capabilities")>();
  return {
    ...actual,
    useRuntimeCapabilities: () => ({
      ...runtime,
      data: { ...runtime.data, deployment },
    }),
  };
});

afterEach(() => {
  cleanup();
  refetch.mockClear();
  deployment = "managed";
});

function view() {
  return (
    <NextIntlClientProvider locale="zh" messages={messages}>
      <AiCoachClientLoader />
    </NextIntlClientProvider>
  );
}

describe("AiCoachClientLoader", () => {
  it("uses the coach inline status style without exposing internal codes", () => {
    render(view());

    const status = screen.getByRole("status");
    expect(status.className).toContain("bg-neutral-100");
    expect(screen.getByText("模型暂时无法响应")).toBeVisible();
    expect(
      screen.getByText("教练服务暂时不可用，或服务端返回了异常。"),
    ).toBeVisible();
    expect(
      screen.queryByText("SELF_HOST_CAPABILITY_NOT_CONFIGURED"),
    ).toBeNull();
  });

  it("rechecks runtime capabilities from the recovery action", () => {
    render(view());

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("keeps self-host configuration guidance deployment-specific", () => {
    deployment = "self-host";
    render(view());

    expect(screen.getByText("AI 访问暂不可用")).toBeVisible();
    expect(
      screen.getByText("请检查实例的 AI 配置或当前账户权限。"),
    ).toBeVisible();
  });
});
