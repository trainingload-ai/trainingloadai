"use client";

import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function MainContentContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isMap = pathname === "/map" || pathname?.startsWith("/map/");
  const isAiCoach =
    pathname === "/ai-coach" || pathname?.startsWith("/ai-coach/");
  const isFullCanvas = isMap || isAiCoach;
  const isCalendar =
    pathname === "/calendar" || pathname?.startsWith("/calendar/");
  const isMetricSubpage = pathname?.startsWith("/metrics/");
  const pathSegments = pathname?.split("/").filter(Boolean) ?? [];
  const isActivityDetail =
    pathSegments.length === 2 &&
    pathSegments[0] === "activities" &&
    pathSegments[1] !== "search" &&
    pathSegments[1] !== "stats";

  // 默认：内容区有最大宽度与 padding
  // /map、/ai-coach：需要占满 main 内容列（不包括左侧 Sidebar），所以去掉 max-w/px/py，并把滚动交给页面内部处理
  // /calendar：移动端同样占满内容列并由周历内部滚动；桌面端保留原有的最大宽度与留白
  return (
    <div
      className={cn(
        isFullCanvas
          ? "flex h-full min-h-0 w-full flex-col overflow-hidden p-0"
          : isCalendar
            ? "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden p-0 pc:mx-auto pc:max-w-[1100px] pc:px-safe-or-2 pc:py-3"
            : isMetricSubpage
              ? "mx-auto flex min-h-0 w-full flex-1 flex-col px-safe-or-4 py-3 pc:max-w-[1100px] pc:px-safe-or-2"
              : isActivityDetail
                ? "mx-auto flex min-h-0 w-full flex-1 flex-col p-0 pc:max-w-[1100px] pc:px-safe-or-2 pc:py-3"
                : "mx-auto flex min-h-0 w-full flex-1 flex-col px-safe-or-3 py-3 pc:max-w-[1100px] pc:px-safe-or-2",
      )}
    >
      {children}
    </div>
  );
}
