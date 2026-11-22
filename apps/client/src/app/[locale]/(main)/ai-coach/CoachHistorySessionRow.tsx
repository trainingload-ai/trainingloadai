"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  const PinIcon = isPinned ? PinOff : Pin;
  const pinLabel = t(isPinned ? "unpin" : "pin");
  const titleViewport = useRef<HTMLSpanElement>(null);
  const titleText = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const viewport = titleViewport.current;
    const text = titleText.current;
    if (!viewport || !text) return;

    const measure = () => {
      setOverflow(Math.max(0, text.scrollWidth - viewport.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(text);
    return () => observer.disconnect();
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={readOnly}>
        <div
          className={cn(
            "group/chat flex h-8 w-full min-w-0 items-center rounded-control transition-colors",
            isActive
              ? "bg-background font-medium text-foreground"
              : "text-muted-foreground hover:bg-background/70 hover:text-foreground focus-within:bg-background/70 focus-within:text-foreground data-[state=open]:bg-background/70 data-[state=open]:text-foreground",
          )}
        >
          <button
            type="button"
            className="group/title flex h-full min-w-0 flex-1 cursor-pointer items-center rounded-control ps-2 pe-0.5 text-start text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-current={isActive ? "page" : undefined}
            aria-keyshortcuts={readOnly ? undefined : "Shift+F10"}
            data-coach-history-title
            onClick={onSelect}
            onKeyDown={(event) => {
              const menuKey = event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10");
              if (readOnly || !menuKey) return;
              event.preventDefault();
              const button = event.currentTarget;
              const bounds = button.getBoundingClientRect();
              button.dispatchEvent(new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: bounds.left + 8,
                clientY: bounds.bottom,
              }));
            }}
          >
            <span
              ref={titleViewport}
              className={cn(
                "w-full overflow-hidden leading-5",
                overflow > 0 &&
                  "[mask-image:linear-gradient(to_right,black_calc(100%_-_6px),transparent)] motion-safe:group-hover/chat:[mask-image:linear-gradient(to_right,transparent,black_6px,black_calc(100%_-_6px),transparent)] motion-safe:group-focus-visible/title:[mask-image:linear-gradient(to_right,transparent,black_6px,black_calc(100%_-_6px),transparent)]",
              )}
            >
              <span
                ref={titleText}
                className={cn(
                  "block w-max whitespace-nowrap",
                  overflow > 0 &&
                    "motion-safe:transition-[translate] motion-safe:duration-200 motion-safe:ease-linear motion-safe:group-hover/chat:translate-x-(--coach-title-offset) motion-safe:group-hover/chat:duration-(--coach-title-duration) motion-safe:group-hover/chat:delay-500 motion-safe:group-focus-visible/title:translate-x-(--coach-title-offset) motion-safe:group-focus-visible/title:duration-(--coach-title-duration) motion-safe:group-focus-visible/title:delay-500",
                )}
                style={
                  {
                    "--coach-title-offset": `-${overflow + 6}px`,
                    "--coach-title-duration": `${Math.max(0.8, overflow / 50)}s`,
                  } as CSSProperties
                }
              >
                {lineText}
              </span>
            </span>
          </button>
          {!readOnly && (
            <div className="me-1 flex shrink-0 items-center gap-0.5 [@media(hover:hover)]:hidden group-hover/chat:flex group-has-[:focus-visible]/chat:flex group-data-[state=open]/chat:flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={pinLabel}
                aria-pressed={isPinned}
                title={pinLabel}
                onClick={onPinToggle}
              >
                <PinIcon aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={t("delete")}
                title={t("delete")}
                onClick={onDelete}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40" aria-label={menuLabel}>
        <ContextMenuItem onSelect={onEdit}>
          <Pencil aria-hidden="true" />
          {t("editTitle")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onPinToggle}>
          <PinIcon aria-hidden="true" />
          {pinLabel}
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={onDelete}
        >
          <Trash2 aria-hidden="true" />
          {t("delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
