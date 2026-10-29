"use client";

import { cn } from "@/lib/utils";
import { CoachDemoApp } from "./coach-demo/coach-demo-app";

export function HomeChatPreview({
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
        className="client-demo-radius flex h-full min-h-0 flex-col bg-background text-foreground"
        data-demo-mode={variant}
      >
        <CoachDemoApp lang={lang} interactive={isExpanded} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "client-demo-radius relative overflow-hidden bg-background text-neutral-950 dark:text-white",
        "min-h-[360px] md:min-h-[440px] [--chat-preview-scale:0.4] md:[--chat-preview-scale:0.76]",
      )}
      data-demo-mode={variant}
    >
      <div
        className="absolute left-1/2 top-1/2 h-[680px] w-[920px] origin-center overflow-hidden bg-background text-foreground"
        style={{
          transform: "translate(-50%, -50%) scale(var(--chat-preview-scale))",
        }}
      >
        <CoachDemoApp lang={lang} interactive={isExpanded} />
      </div>
    </div>
  );
}
