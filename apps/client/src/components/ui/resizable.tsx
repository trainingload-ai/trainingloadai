"use client";

import type { ComponentProps } from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

export const ResizablePanelGroup = Group;
export const ResizablePanel = Panel;

export function ResizableHandle({
  className,
  ...props
}: ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn(
        "relative z-10 flex w-px items-center justify-center bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <span className="flex h-6 w-3 items-center justify-center rounded-xs border bg-background">
        <GripVertical className="size-3 text-muted-foreground" aria-hidden />
      </span>
    </Separator>
  );
}
