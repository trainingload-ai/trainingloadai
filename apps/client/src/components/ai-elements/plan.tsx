"use client";

// AI Elements Plan's composable, collapsible surface (Apache-2.0; see NOTICE).
import type { ComponentProps } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function Plan({
  className,
  children,
  ...props
}: ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible asChild {...props}>
      <Card
        data-slot="plan"
        className={cn(
          "rounded-md border-0 bg-neutral-100 shadow-none dark:bg-muted/45",
          className,
        )}
      >
        {children}
      </Card>
    </Collapsible>
  );
}
export function PlanContent(props: ComponentProps<typeof CardContent>) {
  return (
    <CollapsibleContent asChild>
      <CardContent data-slot="plan-content" {...props} />
    </CollapsibleContent>
  );
}
export function PlanFooter({
  className,
  ...props
}: ComponentProps<typeof CardFooter>) {
  return (
    <CardFooter
      data-slot="plan-footer"
      className={cn("justify-end p-3", className)}
      {...props}
    />
  );
}
