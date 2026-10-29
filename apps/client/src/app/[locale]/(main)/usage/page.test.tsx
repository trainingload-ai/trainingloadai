import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UsagePage from "./page";

const mocks = vi.hoisted(() => ({
  deployment: "managed" as "managed" | "self-host",
  runtimeResolved: true,
  aiCapability: {
    name: "ai",
    required: false,
    state: "enabled",
    provider: "deepseek",
    code: "SELF_HOST_AI_CONFIGURED",
    issues: [],
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const messages: Record<string, string> = {
      title: "AI 用量",
      "selfHost.eyebrow": "自托管 · 自有 API Key",
      "selfHost.title": "AI 用量由你的服务商结算",
      "selfHost.description":
        "本实例直接调用 Owner 配置的 AI 服务商。Trainingload.ai 不参与请求转发，也不提供会员积分或充值包。",
      "selfHost.statusSummary": "自托管 AI 状态",
      "selfHost.currentProvider": "当前 AI 服务",
      "selfHost.notConfigured": "未配置",
      "selfHost.statusReady": "已配置",
      "selfHost.statusOff": "未启用",
      "selfHost.statusIssue": "配置异常",
      "selfHost.trainingloadBilling": "Trainingload.ai 计费",
      "selfHost.notApplicable": "不适用",
      "selfHost.usageAndBilling": "实际用量与费用",
      "selfHost.providerDashboard": "AI 服务商控制台",
      "selfHost.explanationTitle": "这里为什么没有积分图表？",
      "selfHost.providerUsage":
        "用量和费用由你的 AI 服务商记录与结算，Trainingload.ai 无法读取其账单。请前往对应服务商控制台查看明细。",
      "selfHost.openSettings": "管理 AI 配置",
      "providers.deepseek": "DeepSeek",
    };
    return (key: string) => messages[key] ?? key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/api/runtime-capabilities", () => ({
  useRuntimeCapabilities: () => ({
    data: mocks.runtimeResolved
      ? {
          deployment: mocks.deployment,
          capabilities: { ai: mocks.aiCapability },
        }
      : undefined,
  }),
}));

vi.mock("@/hooks/useSetPageTitle", () => ({
  useSetPageTitle: vi.fn(),
}));

vi.mock("@deployment/managed-ui", () => ({
  DeploymentUsagePage: () => <div data-testid="managed-usage" />,
}));

describe("UsagePage deployment composition", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.deployment = "managed";
    mocks.runtimeResolved = true;
  });

  it("delegates managed billing UI to the deployment slot", () => {
    render(<UsagePage />);

    expect(screen.getByTestId("managed-usage")).toBeInTheDocument();
  });

  it("renders only the BYOK boundary on self-host", () => {
    mocks.deployment = "self-host";

    render(<UsagePage />);

    expect(screen.getByText("AI 用量由你的服务商结算")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("已配置")).toBeInTheDocument();
    expect(screen.getByText(/无法读取其账单/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "管理 AI 配置" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.queryByTestId("managed-usage")).not.toBeInTheDocument();
  });

  it("fails closed before runtime capabilities load in a self-host build", () => {
    mocks.runtimeResolved = false;
    vi.stubEnv("NEXT_PUBLIC_SELF_HOST_MODE", "core-local");

    render(<UsagePage />);

    expect(screen.getByText("AI 用量由你的服务商结算")).toBeInTheDocument();
    expect(screen.queryByTestId("managed-usage")).not.toBeInTheDocument();
  });
});
