"use client";

import { cn } from "@/lib/utils";
import { DashboardDemoApp } from "./dashboard-demo/dashboard-demo-app";

export function HomeDashboardPreview({
  lang,
  variant = "preview",
}: {
  lang: string;
  variant?: "preview" | "expanded";
}) {
  const isExpanded = variant === "expanded";

  if (isExpanded) {
    return (
      <div
        className="client-demo-radius flex h-full min-h-0 flex-col bg-background p-4 text-foreground"
        data-demo-mode={variant}
      >
        <DashboardDemoApp lang={lang} interactive={isExpanded} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "client-demo-radius relative overflow-hidden bg-background text-neutral-950 dark:text-white",
        "min-h-[320px] md:min-h-[440px] [--dashboard-preview-scale:0.32] md:[--dashboard-preview-scale:0.63]",
      )}
      data-demo-mode={variant}
    >
      <div
        className="absolute left-1/2 top-1/2 h-[700px] w-[1120px] origin-center overflow-hidden bg-background text-foreground"
        style={{
          transform:
            "translate(-50%, -50%) scale(var(--dashboard-preview-scale))",
        }}
      >
        <DashboardDemoApp lang={lang} interactive={isExpanded} />
      </div>
    </div>
  );
}
