import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MobilePage({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-xl px-safe-or-3 pb-4 pc:hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
