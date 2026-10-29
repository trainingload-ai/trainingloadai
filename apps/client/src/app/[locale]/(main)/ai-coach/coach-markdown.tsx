"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { COACH_ASSISTANT_PROSE_CLASS } from "./coach-assistant-prose";

type CoachMarkdownProps = {
  children: string;
  className?: string;
  streaming?: boolean;
};

export function CoachMarkdown({
  children,
  className,
  streaming = false,
}: CoachMarkdownProps) {
  return (
    <Streamdown
      className={cn(COACH_ASSISTANT_PROSE_CLASS, className)}
      controls={false}
      mode={streaming ? "streaming" : "static"}
      parseIncompleteMarkdown={streaming}
    >
      {children}
    </Streamdown>
  );
}
