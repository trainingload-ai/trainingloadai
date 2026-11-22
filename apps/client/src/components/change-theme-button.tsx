"use client";

import * as React from "react";
import { SunMoon } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ChangeThemeButton({
  labels,
  inCollapsedSidebar,
}: {
  inCollapsedSidebar?: boolean;
  labels: {
    trigger: string;
    light: string;
    dark: string;
    system: string;
  };
}) {
  const { setTheme } = useTheme();
  const trigger = (
    <DropdownMenuTrigger
      aria-label={labels.trigger}
      title={inCollapsedSidebar ? undefined : labels.trigger}
      className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium px-2 py-0"
      variant="ghost"
      size="xs"
    >
      <SunMoon />
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {inCollapsedSidebar ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {labels.trigger}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        side={inCollapsedSidebar ? "right" : "bottom"}
        align="end"
      >
        <DropdownMenuItem onClick={() => setTheme("light")}>
          {labels.light}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          {labels.dark}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          {labels.system}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
