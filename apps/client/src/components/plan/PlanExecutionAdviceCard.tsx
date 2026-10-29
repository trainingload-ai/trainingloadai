"use client";

import { MessageCircle, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { AccessGuardedLink } from "@deployment/managed-ui";
import {
  generatePlanExecutionAdvice,
  type PlanExecutionAdviceSurface,
} from "@/api/ai-plan-execution-advice";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useDeviceTimezone } from "@/hooks/use-device-timezone";
import { useAiDataConsent } from "@/api/ai-data-consent";
import { featureAllowed, useFeatureAccess } from "@/api/feature-access";

type MobilePlanPresentation = {
  planTitle: string;
  metrics: Array<{ label: string; value: string }>;
};

type PlanExecutionAdviceCardProps = {
  title: string;
  askLabel: string;
  askHref: string;
  surface: PlanExecutionAdviceSurface;
  anchorDate?: string;
  planId?: string | null;
  planWorkoutId?: string | null;
  activityId?: string | number | null;
  fallbackSummary: string;
  fallbackTags?: string[];
  className?: string;
  mobilePlanPresentation?: MobilePlanPresentation;
};

export function PlanExecutionAdviceCard({
  title,
  askLabel,
  askHref,
  surface,
  anchorDate,
  planId,
  planWorkoutId,
  activityId,
  fallbackSummary,
  fallbackTags = [],
  className = "space-y-3",
  mobilePlanPresentation,
}: PlanExecutionAdviceCardProps) {
  const locale = useLocale();
  const tShared = useTranslations("SharedUI");
  const deviceTimezone = useDeviceTimezone();
  const consent = useAiDataConsent();
  const access = useFeatureAccess();
  const hasAiDataConsent = consent.data?.granted === true;
  const hasPlanAdviceAccess = featureAllowed(access.data, "ai.planAdvice");
  const adviceKey = {
    surface,
    locale,
    anchorDate: anchorDate ?? null,
    planId: planId ?? null,
    planWorkoutId: planWorkoutId ?? null,
    activityId: activityId ?? null,
    fallbackSummary,
    fallbackTags,
    timezone: deviceTimezone,
  };
  const { data, isPending } = useQuery({
    queryKey: queryKeys.ai.planExecutionAdvice(adviceKey),
    queryFn: () =>
      generatePlanExecutionAdvice({
        surface,
        anchorDate,
        planId,
        planWorkoutId,
        activityId,
        fallbackSummary,
        fallbackTags,
        locale,
        timezone: deviceTimezone ?? undefined,
      }),
    enabled:
      deviceTimezone !== null &&
      consent.isFetchedAfterMount &&
      hasPlanAdviceAccess,
    meta: { errorSurface: "silent" },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const advicePending = hasAiDataConsent && isPending;
  const summary = advicePending
    ? tShared("loadingEllipsis")
    : data?.summary?.trim() || fallbackSummary;
  const tags = advicePending
    ? []
    : data?.tags?.length
      ? data.tags
      : fallbackTags;

  if (mobilePlanPresentation) {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-surface bg-neutral-100 p-3 dark:bg-muted/45",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-mobile-caption font-semibold uppercase text-emerald-600 dark:text-emerald-400 pc:text-xs">
              {title}
            </div>
            <div className="mt-1 truncate text-mobile-caption font-medium text-muted-foreground pc:text-xs">
              {mobilePlanPresentation.planTitle}
            </div>
          </div>
          <AccessGuardedLink
            href={askHref}
            className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-control bg-foreground px-3 text-xs font-semibold text-background transition-opacity active:opacity-80"
          >
            <MessageCircle className="size-3.5" aria-hidden="true" />
            {askLabel}
          </AccessGuardedLink>
        </div>

        <p className="mt-2 line-clamp-3 text-sm font-medium leading-5 text-foreground">
          {summary}
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {mobilePlanPresentation.metrics.map((metric) => (
            <div
              key={metric.label}
              className="min-w-0 rounded-control bg-background px-2.5 py-1.5 dark:bg-black/20"
            >
              <div className="truncate text-mobile-unit font-medium text-muted-foreground pc:text-[10px]">
                {metric.label}
              </div>
              <div className="mt-0.5 truncate text-xs font-semibold tabular-nums text-foreground">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={className}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <span className="truncate">{title}</span>
        </div>
        <p className="mt-1 line-clamp-5 indent-[2em] text-sm leading-5 text-muted-foreground">
          {summary}
        </p>
        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-neutral-100 px-2 py-1 text-mobile-caption pc:text-[11px] text-muted-foreground dark:bg-muted/45"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <AccessGuardedLink
        href={askHref}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
      >
        <MessageCircle className="h-4 w-4" />
        {askLabel}
      </AccessGuardedLink>
    </section>
  );
}
