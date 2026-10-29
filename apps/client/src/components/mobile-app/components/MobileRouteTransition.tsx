"use client";
import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
export function MobileRouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="flex min-h-0 w-full flex-1 flex-col animate-in fade-in slide-in-from-right-1 duration-200 motion-reduce:animate-none pc:animate-none"
    >
      {children}
    </div>
  );
}
