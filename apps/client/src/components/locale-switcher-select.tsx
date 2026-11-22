"use client";

import { ReactNode } from "react";
import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  ariaLabel: string;
  children: ReactNode;
  defaultValue: string;
  inCollapsedSidebar?: boolean;
};

export default function LocaleSwitcherSelect({
  ariaLabel,
  children,
  inCollapsedSidebar,
}: Props) {
  const trigger = (
    <DropdownMenuTrigger
      aria-label={ariaLabel}
      title={inCollapsedSidebar ? undefined : ariaLabel}
      className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium px-2 py-0"
      variant="ghost"
      size="xs"
    >
      <Languages className="" />
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {inCollapsedSidebar ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {ariaLabel}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent side={inCollapsedSidebar ? "right" : "bottom"}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
