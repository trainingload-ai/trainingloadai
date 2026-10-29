"use client";

import { Pencil, Trash2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PendingSendItem = { id: string; text: string };

type CoachPendingSendQueueProps = {
  items: PendingSendItem[];
  locked: boolean;
  editingId: string | null;
  onEdit: (id: string) => void;
  onInterruptSend: (id: string) => void;
  onDelete: (id: string) => void;
};

export function CoachPendingSendQueue({
  items,
  locked,
  editingId,
  onEdit,
  onInterruptSend,
  onDelete,
}: CoachPendingSendQueueProps) {
  const t = useTranslations("AiCoachPage.queue");

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "max-h-[min(30vh,200px)] overflow-y-auto rounded-md bg-neutral-100 px-2 py-1.5 dark:bg-muted/45",
        locked && "opacity-90",
      )}
      role="list"
      aria-label={t("ariaList")}
    >
      <div className="mb-1 px-1 text-mobile-unit pc:text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
        {t("title")}
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-0 rounded-md border border-transparent px-1.5 py-1.5 text-sm",
              editingId === item.id &&
                "border-border/70 bg-background",
            )}
          >
            <p
              className="min-w-0 break-words text-[13px] leading-snug text-foreground line-clamp-2"
              title={item.text}
            >
              {item.text}
            </p>
            <div className="flex shrink-0 items-center gap-px self-start pt-px">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                disabled={locked && editingId !== item.id}
                onClick={() => onEdit(item.id)}
                aria-label={t("edit")}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-amber-700 [&_svg]:size-3.5 dark:hover:text-amber-300"
                disabled={locked}
                onClick={() => onInterruptSend(item.id)}
                aria-label={t("interruptSend")}
              >
                <Zap />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-red-600 [&_svg]:size-3.5 dark:hover:text-red-400"
                disabled={locked}
                onClick={() => onDelete(item.id)}
                aria-label={t("delete")}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
