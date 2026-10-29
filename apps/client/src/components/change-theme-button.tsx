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

export function ChangeThemeButton({
  labels,
}: {
  labels: {
    trigger: string;
    light: string;
    dark: string;
    system: string;
  };
}) {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={labels.trigger}
        title={labels.trigger}
        className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium px-2 py-0"
        variant="ghost"
        size="xs"
      >
        <SunMoon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
