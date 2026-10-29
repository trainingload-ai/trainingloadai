"use client";

/**
 * Map 页需要“铺满 main 区域”，不应受 (main) layout 的 max-width/px/py 容器约束。
 * 这里用路由级 layout 覆盖掉默认内容容器样式。
 */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  // 宽度/内边距逃逸在 (main)/layout.tsx 的 MainContentContainer 里按路由处理；
  // 这里仅确保 map 页自身是满高可布局容器。
  return <div className="h-full min-h-0 w-full overflow-hidden">{children}</div>;
}

