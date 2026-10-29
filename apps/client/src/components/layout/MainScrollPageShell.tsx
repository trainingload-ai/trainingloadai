import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MainScrollPageShellProps = {
  children: ReactNode;
  className?: string;
  /** 默认与 `/account` 一致；偏窄页面可传 `max-w-3xl` 等 */
  maxWidthClass?: string;
};

/**
 * 标准「整页随主内容区滚动」的页面外壳（与 `/account` 一致）。
 *
 * 纵向滚动发生在 `(main)/layout.tsx` 里：
 * `<main className="… overflow-y-auto overscroll-y-contain">`
 *
 * **不要**在本组件之外再套一层固定高度 + `overflow-y-auto`，否则会与外层抢手势、出现双滚动条。
 * 需要右侧 sticky 时，在内层用 `grid` + `lg:sticky lg:top-4 lg:self-start`（见 `/account`）。
 */
export function MainScrollPageShell({
  children,
  className,
  maxWidthClass = "max-w-6xl",
}: MainScrollPageShellProps) {
  return (
    <div className={cn("mx-auto w-full min-h-0", maxWidthClass, className)}>
      {children}
    </div>
  );
}
