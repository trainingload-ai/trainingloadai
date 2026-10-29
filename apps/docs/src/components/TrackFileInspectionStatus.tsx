"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { TrackFileInspection } from "@shared/track-file-contract";

export function TrackFileInspectionStatus({
  inspection,
  isInspecting,
  error,
}: {
  inspection: TrackFileInspection | null;
  isInspecting: boolean;
  error: string | null;
}) {
  const t = useTranslations("fileInspection");
  if (isInspecting) {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-2 text-xs text-neutral-500"
      >
        <Loader2 className="size-3.5 animate-spin" />
        {t("checking")}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-compact border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        {error}
      </div>
    );
  }

  if (!inspection) return null;

  const activity = inspection.activity;
  const extension = inspection.extensionFormat?.toUpperCase();
  const detected = inspection.format.toUpperCase();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 className="size-3.5" />
        {t("recognized", { format: detected })}
      </span>
      {inspection.extensionMismatch && extension ? (
        <span className="rounded border border-amber-300 px-2 py-1 font-semibold text-amber-700 dark:border-amber-800 dark:text-amber-300">
          {extension} → {detected}
        </span>
      ) : null}
      {activity ? (
        <span className="font-mono text-neutral-500 dark:text-neutral-400">
          {t("activity", {
            activities: activity.activityCount,
            laps: activity.lapCount,
            points: activity.recordCount,
          })}
        </span>
      ) : null}
      {inspection.health ? (
        <span className="font-mono text-neutral-500 dark:text-neutral-400">
          {t("health", {
            count:
              inspection.health.pointCount + inspection.health.intervalCount,
          })}
        </span>
      ) : null}
    </div>
  );
}
