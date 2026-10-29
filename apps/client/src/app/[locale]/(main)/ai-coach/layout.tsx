import { AiCoachMainScrollLock } from "./main-scroll-lock";

/**
 * AI 教练路由专用布局
 *
 * - 与 `(main)/layout.tsx` 共用顶栏与侧栏
 * - 页脚版本文案由 `MainAppFooter` 按路径隐藏
 * - 锁住外层 main 滚动，仅允许页面内部消息区滚动
 */
export default function AiCoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AiCoachMainScrollLock>
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-safe-or-0 pb-safe sm:mx-0">
        {children}
      </div>
    </AiCoachMainScrollLock>
  );
}
