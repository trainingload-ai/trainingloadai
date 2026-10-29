"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdaptiveDialog,
  AdaptiveDialogClose,
  AdaptiveDialogContent,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import { cn } from "@/lib/utils";
import { settingsDialogDesktopClassName } from "@/components/ui/dialog-sizes";
import { MetricTileButton } from "./MetricTileButton";

export function UserProfileNumberTileField({
  value,
  title,
  description,
  invalidMessage,
  saveLabel,
  cancelLabel,
  min,
  max,
  step,
  suffix,
  onSave,
}: {
  value: number;
  title: string;
  description: string;
  invalidMessage: string;
  saveLabel: string;
  cancelLabel: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onSave: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (open) setDraft(String(value));
  }, [open, value]);

  const parsed = useMemo(() => Number(draft), [draft]);
  const valid =
    draft.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >= min &&
    parsed <= max;

  return (
    <AdaptiveDialog open={open} onOpenChange={setOpen}>
      <AdaptiveDialogTrigger asChild>
        <MetricTileButton
          title={title}
          value={`${value.toFixed(2)}${suffix ?? ""}`}
        />
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent desktopClassName={settingsDialogDesktopClassName}>
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle className="text-base font-medium">
            {title}
          </AdaptiveDialogTitle>
          <div className="text-sm text-muted-foreground">{description}</div>
        </AdaptiveDialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border bg-muted/25 p-3">
            <Input
              aria-invalid={!valid}
              autoFocus
              inputMode="decimal"
              max={max}
              min={min}
              onChange={(event) => setDraft(event.target.value)}
              step={step}
              type="number"
              value={draft}
            />
            {suffix ? (
              <span className="text-sm text-muted-foreground">{suffix}</span>
            ) : null}
          </div>
          {!valid ? (
            <p className="text-mobile-caption pc:text-xs text-destructive">
              {invalidMessage}
            </p>
          ) : null}
        </div>
        <AdaptiveDialogFooter
          className={cn("mt-4", adaptiveDialogFooterActionsClassName)}
        >
          <AdaptiveDialogClose asChild>
            <Button
              className={adaptiveDialogFooterActionButtonClassName}
              size="dialog-action"
              variant="outline"
            >
              {cancelLabel}
            </Button>
          </AdaptiveDialogClose>
          <Button
            className={adaptiveDialogFooterActionButtonClassName}
            disabled={!valid}
            onClick={() => {
              if (!valid) return;
              if (parsed !== value) onSave(parsed);
              setOpen(false);
            }}
            size="dialog-action"
            type="button"
          >
            {saveLabel}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
