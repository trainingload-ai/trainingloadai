"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CoachSessionListItem } from "@/api/ai-coach";

export function CoachHistorySessionRow({
  activeSid,
  lineText,
  menuLabel,
  onDelete,
  onEdit,
  onPinToggle,
  onSelect,
  readOnly = false,
  session,
  t,
}: {
  activeSid: string;
  lineText: string;
  menuLabel: string;
  onDelete: () => void;
  onEdit: () => void;
  onPinToggle: () => void;
  onSelect: () => void;
  readOnly?: boolean;
  session: CoachSessionListItem;
  t: (key: string) => string;
}) {
  const isActive = session.id === activeSid;
  const isPinned = Boolean(session.pinnedAt);

  return (
    <div
      className={cn(
        "group flex h-10 w-full min-w-0 items-center gap-0.5 rounded-surface transition-colors",
        isActive
          ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800",
      )}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center rounded-surface px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        title={lineText}
      >
        <span className="truncate leading-5">{lineText}</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild unstyled>
          <Button
            type="button"
            variant="ghost"
            size="icon-compact"
            className={cn(
              "mr-1 shrink-0 text-muted-foreground shadow-none",
              "opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100",
              "focus-visible:opacity-100 data-[state=open]:opacity-100",
              "hover:bg-neutral-200 hover:text-foreground dark:hover:bg-muted",
              isActive && "opacity-100",
            )}
            aria-label={menuLabel}
            disabled={readOnly}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem disabled={readOnly} onClick={onEdit}>
            {t("editTitle")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly} onClick={onPinToggle}>
            {isPinned ? t("unpin") : t("pin")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={readOnly}
            variant="destructive"
            onClick={onDelete}
          >
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
