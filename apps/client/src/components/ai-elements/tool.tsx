"use client";

// Adapted from Vercel AI Elements (Apache-2.0). See NOTICE and LICENSE.
// Coach displays safe domain results, never raw tool inputs or outputs.
import type { ComponentProps, ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function Tool({
  className,
  ...props
}: ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      className={cn("group/tool not-prose w-full min-w-0", className)}
      {...props}
    />
  );
}

export function ToolHeader({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & { children: ReactNode }) {
  return (
    <CollapsibleTrigger
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-2 rounded-sm py-1 text-left text-sm font-normal text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-90 motion-reduce:transition-none"
      />
    </CollapsibleTrigger>
  );
}

export function ToolContent({
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn(
        "ml-6 mt-2 space-y-4 rounded-md bg-neutral-100 p-4 text-foreground outline-none dark:bg-muted/45",
        className,
      )}
      {...props}
    />
  );
}
