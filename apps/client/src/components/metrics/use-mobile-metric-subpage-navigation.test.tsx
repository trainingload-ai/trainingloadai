import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileMetricSubpageNavigation } from "./use-mobile-metric-subpage-navigation";

const mocks = vi.hoisted(() => ({
  pathname: "/metrics/power",
  useMobileNavigation: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/components/mobile-app/components/MobileNavigationProvider", () => ({
  useMobileNavigation: mocks.useMobileNavigation,
}));

describe("useMobileMetricSubpageNavigation", () => {
  beforeEach(() => {
    mocks.pathname = "/metrics/power";
    mocks.useMobileNavigation.mockClear();
  });

  it("让首页摘要指标页返回首页", () => {
    renderHook(() => useMobileMetricSubpageNavigation({ title: "功率分析" }));

    expect(mocks.useMobileNavigation).toHaveBeenCalledWith({
      title: "功率分析",
      trailing: undefined,
      backHref: "/",
    });
  });

  it("保留旧分析入口返回我的页面", () => {
    mocks.pathname = "/power";

    renderHook(() => useMobileMetricSubpageNavigation({ title: "功率" }));

    expect(mocks.useMobileNavigation).toHaveBeenCalledWith({
      title: "功率",
      trailing: undefined,
      backHref: "/me",
    });
  });

  it("允许嵌套二级页覆盖返回地址", () => {
    mocks.pathname = "/metrics/pace/best-distance";

    renderHook(() =>
      useMobileMetricSubpageNavigation({
        title: "最佳距离",
        backHref: "/metrics/pace",
      }),
    );

    expect(mocks.useMobileNavigation).toHaveBeenCalledWith({
      title: "最佳距离",
      trailing: undefined,
      backHref: "/metrics/pace",
    });
  });
});
