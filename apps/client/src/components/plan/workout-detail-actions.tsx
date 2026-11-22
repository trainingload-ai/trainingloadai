"use client";

import { useRef, useState, type ReactElement } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkoutActionConfirm } from "./workout-action-confirm";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type Action = "postpone" | "skip" | "delete";

/** A single, confirmed action entry point shared by desktop and mobile details. */
export function WorkoutDetailActions({
  capabilities = {},
  pending = false,
  onEdit,
  onPostpone,
  onSkip,
  onMove,
  onDelete,
  confirmDelete = true,
  contextTrigger,
  onContextOpenChange,
}: {
  capabilities?: Partial<Record<Action, boolean>>;
  pending?: boolean;
  onEdit?: () => void;
  onPostpone?: () => Promise<boolean | void>;
  onSkip?: () => Promise<boolean | void>;
  onMove?: (trigger?: HTMLElement | null) => void;
  onDelete?: () => void | Promise<boolean | void>;
  confirmDelete?: boolean;
  contextTrigger?: ReactElement;
  onContextOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("ViewWorkoutDialog");
  const tMove = useTranslations("CalendarMove");
  const [action, setAction] = useState<Action | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const openingDialog = useRef(false);
  const busy = pending || submitting;
  const contextActions = ["postpone", "skip", "move", "delete"] as const;
  const actions = ["edit", ...contextActions] as const;
  const handlers = { postpone: onPostpone, skip: onSkip, delete: onDelete };
  const isAvailable = (key: (typeof actions)[number]) => {
    if (key === "edit") return Boolean(onEdit);
    if (key === "move") return Boolean(onMove);
    return capabilities[key] && Boolean(handlers[key]);
  };
  const available = contextTrigger ? contextActions : actions.filter(isAvailable);
  const labels = {
    edit: tMove("editWorkout"),
    postpone: t("actionPostpone"),
    skip: t("actionSkip"),
    move: tMove("moveWorkout"),
    delete: t("actionDelete"),
  };
  if (!available.length) return contextTrigger ?? null;
  const Item = contextTrigger ? ContextMenuItem : DropdownMenuItem;
  const items = available.map((key) => (
    <Item
      key={key}
      disabled={busy || !isAvailable(key)}
      className={
        key === "delete" ? "text-destructive focus:text-destructive" : undefined
      }
      onSelect={() => {
        openingDialog.current = true;
        if (key === "edit") onEdit?.();
        else if (key === "move") onMove?.(trigger.current);
        else if (key === "delete" && !confirmDelete) void onDelete?.();
        else setAction(key);
      }}
    >
      {labels[key]}
    </Item>
  ));
  return (
    <>
      {contextTrigger ? (
        <ContextMenu modal={false} onOpenChange={onContextOpenChange}>
          <ContextMenuTrigger
            asChild
            ref={trigger}
            disabled={busy}
            onContextMenu={(event) => event.stopPropagation()}
          >
            {contextTrigger}
          </ContextMenuTrigger>
          <ContextMenuContent
            onClick={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (!openingDialog.current)
                trigger.current?.focus({ preventScroll: true });
              openingDialog.current = false;
            }}
          >
            <ContextMenuGroup>{items}</ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy}>
              <MoreHorizontal className="mr-1.5 size-4" />
              {t("moreActions")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">{items}</DropdownMenuContent>
        </DropdownMenu>
      )}
      <WorkoutActionConfirm
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
        title={
          action === "delete"
            ? t("confirmDelete.title")
            : t(
                action === "postpone"
                  ? "mobile.confirmPostponeTitle"
                  : "mobile.confirmSkipTitle",
              )
        }
        description={
          action === "delete"
            ? t("deleteWorkoutDescription")
            : t(
                action === "postpone"
                  ? "mobile.confirmPostponeMessage"
                  : "mobile.confirmSkipMessage",
              )
        }
        cancelLabel={t("confirmDelete.cancel")}
        confirmLabel={busy ? t("actionPending") : action ? labels[action] : ""}
        pending={busy}
        destructive={action === "delete"}
        onCloseAutoFocus={
          contextTrigger
            ? (event) => {
                event.preventDefault();
                trigger.current?.focus({ preventScroll: true });
              }
            : undefined
        }
        onConfirm={async () => {
          if (!action || busy || !capabilities[action]) return;
          setSubmitting(true);
          try {
            if ((await handlers[action]?.()) !== false) setAction(null);
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </>
  );
}
