"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { CalendarDays, Sparkles, X } from "lucide-react";
import { trackMarketingEvent } from "@/lib/analytics";
import { trackToolEvent, type ToolId } from "@/lib/tool-analytics";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProperties = Record<string, AnalyticsValue>;

export type TrainingPlanAfterConvertDialogCopy = {
  close: string;
  eyebrow: string;
  title: string;
  body: string;
  primary: string;
  secondary: string;
  note: string;
};

type TrainingPlanAfterConvertDialogProps = {
  invokerRef: RefObject<HTMLButtonElement | null>;
  appHref: string;
  copy: TrainingPlanAfterConvertDialogCopy;
  lang: string;
  open: boolean;
  onClose: () => void;
  eventProperties: AnalyticsProperties;
  toolId: ToolId;
};

export function TrainingPlanAfterConvertDialog({
  invokerRef,
  appHref,
  copy,
  lang,
  open,
  onClose,
  eventProperties,
  toolId,
}: TrainingPlanAfterConvertDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // The async submitter was disabled while processing, so restore its invoker first.
      if (document.activeElement === document.body)
        invokerRef.current?.focus({ preventScroll: true });
      dialog.returnValue = "";
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open, invokerRef]);

  const close = (reason: string) => {
    trackMarketingEvent("converter_training_plan_prompt_dismissed", {
      ...eventProperties,
      reason,
    });
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={(event) => {
        if (!open || event.currentTarget.open) return;
        const reason = event.currentTarget.returnValue || "overlay";
        event.currentTarget.returnValue = "";
        close(reason);
      }}
      onPointerDown={(event) => {
        if ("closedBy" in HTMLDialogElement.prototype) return;
        const rect = event.currentTarget.getBoundingClientRect();
        pressedBackdrop.current =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
      }}
      onPointerUp={(event) => {
        if ("closedBy" in HTMLDialogElement.prototype) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (pressedBackdrop.current && outside) event.currentTarget.close();
        pressedBackdrop.current = false;
      }}
      className="docs-conversion-dialog fixed inset-x-3 bottom-3 top-auto m-0 max-h-[calc(100dvh-1.5rem)] w-auto max-w-md overflow-y-auto rounded-overlay border border-border/80 bg-card/[0.95] p-5 text-card-foreground shadow-[0_24px_80px_-32px_rgba(25,27,24,0.58)] backdrop-blur-xl backdrop:bg-neutral-950/20 backdrop:backdrop-blur-md dark:bg-card/[0.92] dark:shadow-black/60 dark:backdrop:bg-black/55 sm:inset-0 sm:m-auto sm:w-full sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
          <span className="grid size-7 place-items-center rounded-compact bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200">
            <Sparkles className="size-4" />
          </span>
          {copy.eyebrow}
        </div>
        <button
          type="button"
          aria-label={copy.close}
          autoFocus
          onClick={() => dialogRef.current?.close("button")}
          className="grid size-8 shrink-0 place-items-center rounded-compact text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-accent dark:hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <h2
          id={titleId}
          className="text-2xl font-black tracking-normal text-neutral-950 dark:text-white"
        >
          {copy.title}
        </h2>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {copy.body}
        </p>
        <div className="flex items-center gap-2 rounded-compact border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600 dark:border-border dark:bg-neutral-900/40 dark:text-neutral-300">
          <CalendarDays className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
          {copy.note}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
        <a
          href={appHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackToolEvent("tool_app_cta_clicked", toolId, {
              action: "training_plan_prompt",
              cta_placement: "post_conversion_prompt",
              destination: "ai_coach",
              lang,
            })
          }
          className="inline-flex h-11 items-center justify-center rounded-control bg-emerald-700 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-800 active:translate-y-px dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400"
        >
          {copy.primary}
        </a>
        <button
          type="button"
          onClick={() => dialogRef.current?.close("secondary")}
          className="inline-flex h-11 items-center justify-center rounded-control border border-border px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted active:translate-y-px"
        >
          {copy.secondary}
        </button>
      </div>
    </dialog>
  );
}
