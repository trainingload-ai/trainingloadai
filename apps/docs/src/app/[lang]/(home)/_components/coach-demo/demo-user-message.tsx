"use client";

import { cn } from "@/lib/utils";
import { COACH_ASSISTANT_PROSE_CLASS } from "./coach-assistant-prose";

/** 镜像 client AuiUserMessage + UserMessageText */
export function DemoUserMessage({ text }: { text: string }) {
  return (
    <div className="group flex justify-end gap-3">
      <div className="ml-auto max-w-[82%] space-y-2">
        <div className="ml-auto inline-flex max-w-full flex-wrap gap-1 rounded-overlay rounded-tr-md border border-border/60 bg-neutral-100 px-3.5 py-2.5 text-[15px] font-normal leading-[23px] tracking-normal text-foreground shadow-sm dark:bg-muted/45">
          <div className="whitespace-pre-wrap break-words leading-[23px]">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 镜像 client AssistantMessageText（无 streamdown，纯 prose） */
export function DemoAssistantText({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className={cn(COACH_ASSISTANT_PROSE_CLASS)}>
      {text.split(/\n\n+/).map((paragraph, index) => (
        <p key={index} className="my-2.5 leading-7">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
