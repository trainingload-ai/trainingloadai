"use client";

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
  appHref: string;
  copy: TrainingPlanAfterConvertDialogCopy;
  lang: string;
  open: boolean;
  onClose: () => void;
  eventProperties: AnalyticsProperties;
  toolId: ToolId;
};

export function TrainingPlanAfterConvertDialog({
  appHref,
  copy,
  lang,
  open,
  onClose,
  eventProperties,
  toolId,
}: TrainingPlanAfterConvertDialogProps) {
  if (!open) return null;

  const close = (reason: "button" | "overlay" | "secondary") => {
    trackMarketingEvent("converter_training_plan_prompt_dismissed", {
      ...eventProperties,
      reason,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/20 p-3 backdrop-blur-md dark:bg-black/55 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close("overlay");
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-plan-after-convert-title"
        className="w-full max-w-md rounded-overlay border border-border/80 bg-card/[0.95] p-5 text-card-foreground shadow-[0_24px_80px_-32px_rgba(25,27,24,0.58)] backdrop-blur-xl dark:bg-card/[0.92] dark:shadow-black/60 sm:p-6"
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
            onClick={() => close("button")}
            className="grid size-8 shrink-0 place-items-center rounded-compact text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-accent dark:hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <h2
            id="training-plan-after-convert-title"
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
            className="inline-flex h-11 items-center justify-center rounded-control bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 active:translate-y-px dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400"
          >
            {copy.primary}
          </a>
          <button
            type="button"
            onClick={() => close("secondary")}
            className="inline-flex h-11 items-center justify-center rounded-control border border-border px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted active:translate-y-px"
          >
            {copy.secondary}
          </button>
        </div>
      </section>
    </div>
  );
}
