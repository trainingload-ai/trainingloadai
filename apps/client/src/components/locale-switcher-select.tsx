"use client";

import { ReactNode } from "react";
import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  ariaLabel: string;
  children: ReactNode;
  defaultValue: string;
};

export default function LocaleSwitcherSelect({ ariaLabel, children }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        title={ariaLabel}
        className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium px-2 py-0"
        variant="ghost"
        size="xs"
      >
        <Languages className="" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
