"use client";

import { useEffect } from "react";

/**
 * AI 教练页：禁止外层 <main> 纵向滚动，避免与消息区 `overflow-y-auto` 抢手势。
 * 离开时恢复，避免影响其它路由。
 */
export function AiCoachMainScrollLock({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const prevOverflow = main.style.overflow;
    const prevOverscroll = main.style.overscrollBehavior;
    const prevMainHeight = main.style.height;
    const prevMainMinHeight = main.style.minHeight;
    main.style.overflow = "hidden";
    main.style.overscrollBehavior = "none";
    main.style.height = "100%";
    main.style.minHeight = "0";
    return () => {
      main.style.overflow = prevOverflow;
      main.style.overscrollBehavior = prevOverscroll;
      main.style.height = prevMainHeight;
      main.style.minHeight = prevMainMinHeight;
    };
  }, []);
  return <>{children}</>;
}
