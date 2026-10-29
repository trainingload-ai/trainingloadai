"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 兜底滚动恢复：
 * - 离开 /ai-coach 后，清理可能残留的 inline scroll lock 样式
 * - 仅清理 lock 场景常见值，避免误改其它页面主动设置
 */
export function MainScrollRecovery() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.includes("/ai-coach")) return;

    const main = document.querySelector("main") as HTMLElement | null;
    const mainColumn = main?.parentElement as HTMLElement | null;

    if (main?.style.overflow === "hidden") {
      main.style.removeProperty("overflow");
    }
    if (main?.style.overscrollBehavior === "none") {
      main.style.removeProperty("overscroll-behavior");
    }
    if (main?.style.height === "100%") {
      main.style.removeProperty("height");
    }
    if (main?.style.minHeight === "0px" || main?.style.minHeight === "0") {
      main.style.removeProperty("min-height");
    }
    if (mainColumn?.style.paddingBottom === "12px") {
      mainColumn.style.removeProperty("padding-bottom");
    }

    if (document.body.style.overflow === "hidden") {
      document.body.style.removeProperty("overflow");
    }
    if (document.body.style.overscrollBehavior === "none") {
      document.body.style.removeProperty("overscroll-behavior");
    }
    if (document.documentElement.style.overflow === "hidden") {
      document.documentElement.style.removeProperty("overflow");
    }
    if (document.documentElement.style.overscrollBehavior === "none") {
      document.documentElement.style.removeProperty("overscroll-behavior");
    }
  }, [pathname]);

  return null;
}

