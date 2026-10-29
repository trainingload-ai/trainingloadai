"use client";

import type { ReactNode } from "react";
import { Pin, PinOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Item, ItemContent } from "@/components/ui/item";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CoachSessionListItem } from "@/api/ai-coach";

function HistoryRowIconButton({
  ariaLabel,
  children,
  className,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "shrink-0 text-muted-foreground hover:bg-neutral-200 hover:text-foreground dark:hover:bg-muted",
            className,
          )}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={6}>
        {ariaLabel}
      </TooltipContent>
    </Tooltip>
  );
}

export function CoachHistoryFullPageSessionRow({
  active,
  deleteAriaLabel,
  deletePending,
  editAriaLabel,
  onDelete,
  onEdit,
  onOpen,
  onTogglePin,
  pinAriaLabel,
  replyPreview,
  readOnly = false,
  session,
  title,
  unpinAriaLabel,
}: {
  active: boolean;
  deleteAriaLabel: string;
  deletePending: boolean;
  editAriaLabel: string;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  onTogglePin: () => void;
  pinAriaLabel: string;
  replyPreview: string;
  readOnly?: boolean;
  session: CoachSessionListItem;
  title: string;
  unpinAriaLabel: string;
}) {
  const isPinned = Boolean(session.pinnedAt);

  return (
    <div
      className={cn(
        "group/session-row relative h-full min-h-0 cursor-pointer overflow-hidden rounded-surface border border-transparent",
        "bg-neutral-100 transition-colors duration-150 dark:bg-muted/45",
        "hover:bg-neutral-200 dark:hover:bg-muted",
        active && "border-border/70 bg-neutral-100 dark:bg-muted/45",
        active && "hover:bg-neutral-200 dark:hover:bg-muted",
      )}
    >
      <div
        className={cn(
          "absolute right-1.5 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-px p-0.5",
          "opacity-100 transition-opacity duration-150",
          "sm:opacity-0 sm:transition-opacity",
          "sm:group-hover/session-row:opacity-100 sm:group-focus-within/session-row:opacity-100",
        )}
      >
        <HistoryRowIconButton
          ariaLabel={isPinned ? unpinAriaLabel : pinAriaLabel}
          disabled={readOnly}
          onClick={onTogglePin}
        >
          {isPinned ? (
            <PinOff className="h-3.5 w-3.5" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </HistoryRowIconButton>
        <HistoryRowIconButton
          ariaLabel={editAriaLabel}
          disabled={readOnly}
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </HistoryRowIconButton>
        <HistoryRowIconButton
          ariaLabel={deleteAriaLabel}
          className="text-destructive hover:bg-destructive/15 hover:text-destructive"
          disabled={readOnly || deletePending}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </HistoryRowIconButton>
      </div>

      <button
        type="button"
        className="flex h-full min-h-0 w-full cursor-pointer items-start rounded-[inherit] px-3 py-2.5 pr-12 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onOpen}
      >
        <Item
          size="sm"
          variant="muted"
          className="min-h-0 min-w-0 flex-1 items-start border-0 bg-transparent px-0 py-0 hover:bg-transparent"
        >
          <ItemContent className="min-h-0 min-w-0 gap-1">
            <div className="truncate text-[13px] font-medium leading-snug text-foreground">
              {title}
            </div>
            <div className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
              {replyPreview}
            </div>
          </ItemContent>
        </Item>
      </button>
    </div>
  );
}
