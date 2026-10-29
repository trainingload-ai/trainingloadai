"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type {
  PlanTemplateEligibilityOption,
  PlanTemplateEligibilityStatus,
} from "@/api/plan-templates";
import { selectPlanTemplateCoachReminderReasons } from "@shared/plan-template-coach-reminder";

function blocksBuild(option?: PlanTemplateEligibilityOption) {
  return (
    option?.status === "INPUT_REQUIRED" || option?.status === "NOT_ELIGIBLE"
  );
}

export { blocksBuild as planTemplateBlocksBuild };

export function PlanTemplateCoachReminder({
  option,
  variant = "full",
}: {
  option?: PlanTemplateEligibilityOption;
  variant?: "full" | "compact";
}) {
  const locale = useLocale();
  const t = useTranslations("PlanTemplateCoachReminder");
  if (!option || option.status === "ELIGIBLE") return null;

  const statusKey: Record<PlanTemplateEligibilityStatus, string> = {
    ELIGIBLE: "ready",
    ELIGIBLE_WITH_WARNING: "baseWarning",
    ELIGIBLE_RPE_FALLBACK: "caution",
    INPUT_REQUIRED: "inputRequired",
    NOT_ELIGIBLE: "notReady",
  };
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const formatDuration = (value: number) => {
    const seconds = Math.max(0, Math.round(value));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
      : `${minutes}:${String(remainder).padStart(2, "0")}`;
  };
  const reasonText = (
    code: string,
    detail?: NonNullable<
      PlanTemplateEligibilityOption["reasonDetails"]
    >[number],
  ) => {
    if (code === "GOAL_NOT_SUPPORTED")
      return detail
        ? t("goalNotSupported", {
            actual: formatDuration(detail.actual),
            required: formatDuration(detail.required),
          })
        : t("goalNotSupportedGeneric");
    if (!detail) return t("genericRequirement");
    const actual =
      detail.unit === "meters" || detail.unit === "meters_per_week"
        ? number.format(detail.actual / 1000)
        : number.format(detail.actual);
    const required =
      detail.unit === "meters" || detail.unit === "meters_per_week"
        ? number.format(detail.required / 1000)
        : number.format(detail.required);
    if (code === "TEN_K_BASELINE_REQUIRED")
      return t("tenKBase", { actual, required });
    if (code === "HALF_MARATHON_BASELINE_REQUIRED")
      return t("halfMarathonBase", { actual, required });
    if (code === "MARATHON_LONG_RUN_REQUIRED")
      return t("marathonLongRun", { actual, required });
    if (code === "VO2_MAX_BELOW_SUPPORTED_RANGE")
      return t("vo2MaxBelowRange", { actual, required });
    if (code === "VO2_MAX_LOW_FOR_LONG_DISTANCE")
      return t("vo2MaxLowForDistance", { actual, required });
    if (code === "PLAN_PERIOD_TOO_SHORT")
      return t("planPeriod", { actual, required });
    return t("genericRequirement");
  };
  const messages = [
    ...new Set(
      selectPlanTemplateCoachReminderReasons(option).map((reason) => {
        if (reason.kind === "capabilityRequired") {
          return t("capabilityRequired");
        }
        if (reason.kind === "genericRequirement") {
          return t("genericRequirement");
        }
        return reasonText(reason.code, reason.detail);
      }),
    ),
  ];
  const blocked = blocksBuild(option);
  const caution = blocked || option.status === "ELIGIBLE_WITH_WARNING";
  const StatusIcon = caution ? AlertTriangle : Sparkles;

  if (variant === "compact") {
    return (
      <aside
        aria-label={t("label")}
        className={`rounded-lg p-3.5 ${
          caution
            ? "bg-rose-100 dark:bg-rose-500/15"
            : "bg-emerald-100 dark:bg-emerald-950/50"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-md text-white ${
              caution ? "bg-rose-500" : "bg-emerald-500"
            }`}
          >
            <StatusIcon aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black leading-5 text-foreground">
              {t(statusKey[option.status])}
            </p>
            {messages[0] ? (
              <p className="mt-1 line-clamp-3 text-sm font-medium leading-5 text-foreground/80">
                {messages[0]}
              </p>
            ) : null}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={t("label")}
      className={`rounded-xl p-5 ${
        caution
          ? "bg-rose-100 dark:bg-rose-500/15"
          : "bg-emerald-100 dark:bg-emerald-950/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-white ${
            caution ? "bg-rose-500" : "bg-emerald-500"
          }`}
        >
          <StatusIcon aria-hidden="true" className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p
            className={`text-[11px] font-black uppercase tracking-[0.12em] ${
              caution
                ? "text-rose-700 dark:text-rose-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {t("label")}
          </p>
          <p className="mt-0.5 text-lg font-black leading-6 tracking-tight text-balance text-foreground">
            {t(statusKey[option.status])}
          </p>
        </div>
      </div>
      {messages.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {messages.map((message, index) => (
            <li
              key={`${message}-${index}`}
              className="flex gap-2.5 text-sm font-semibold leading-6 text-foreground/90"
            >
              <span
                aria-hidden="true"
                className={`mt-2 size-2 shrink-0 rounded-full ${
                  caution ? "bg-rose-500" : "bg-emerald-500"
                }`}
              />
              <span>{message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {blocked ? (
        <p className="mt-4 rounded-lg bg-rose-500 px-3.5 py-2.5 text-sm font-black leading-5 text-white">
          {t("buildBlocked")}
        </p>
      ) : null}
    </aside>
  );
}
