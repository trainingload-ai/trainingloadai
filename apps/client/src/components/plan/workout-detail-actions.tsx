"use client";

import { useState } from "react";
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

type Action = "postpone" | "skip" | "delete";

/** A single, confirmed action entry point shared by desktop and mobile details. */
export function WorkoutDetailActions({
  capabilities,
  pending,
  onPostpone,
  onSkip,
  onDelete,
}: {
  capabilities: Record<Action, boolean>;
  pending: boolean;
  onPostpone: () => Promise<boolean | void>;
  onSkip: () => Promise<boolean | void>;
  onDelete: () => Promise<boolean | void>;
}) {
  const t = useTranslations("ViewWorkoutDialog");
  const [action, setAction] = useState<Action | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = pending || submitting;
  const available = (["postpone", "skip", "delete"] as const).filter(
    (key) => capabilities[key],
  );
  const labels = {
    postpone: t("actionPostpone"),
    skip: t("actionSkip"),
    delete: t("actionDelete"),
  };
  const handlers = { postpone: onPostpone, skip: onSkip, delete: onDelete };
  if (!available.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" disabled={busy}>
            <MoreHorizontal className="mr-1.5 size-4" />
            {t("moreActions")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {available.map((key) => (
            <DropdownMenuItem
              key={key}
              className={
                key === "delete"
                  ? "text-destructive focus:text-destructive"
                  : undefined
              }
              onSelect={() => setAction(key)}
            >
              {labels[key]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
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
        onConfirm={async () => {
          if (!action || busy || !capabilities[action]) return;
          setSubmitting(true);
          try {
            if ((await handlers[action]()) !== false) setAction(null);
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </>
  );
}
