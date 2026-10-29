"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function getCoachStructuredToolSkeletonKind(name: string) {
  // Questions appear in the floating answer dock once ready. The Timeline's
  // activity row already communicates preparation; don't duplicate it here.
  if (
    [
      "PresentCoachPlanDraft",
      "present_coach_plan_draft",
      "coach_plan_draft",
    ].includes(name)
  )
    return "plan-draft";
  return null;
}

export function CoachPlanDraftCardSkeleton({
  className,
}: {
  className?: string;
}) {
  const t = useTranslations("AiCoachPage");
  return (
    <div
      role="status"
      aria-label={t("rendering.rendering", {
        name: t("rendering.tools.planDraft"),
      })}
      className={cn(
        "overflow-hidden rounded-md bg-neutral-100 p-4 dark:bg-muted/45",
        className,
      )}
    >
      <div aria-hidden className="space-y-4">
        <Skeleton className="h-5 w-2/3 motion-reduce:animate-none" />
        <Skeleton className="h-3 w-3/4 motion-reduce:animate-none" />
        <div className="grid grid-cols-1 gap-2 pc:grid-cols-7">
          {Array.from({ length: 7 }, (_, key) => (
            <Skeleton
              key={key}
              className="h-10 pc:h-20 motion-reduce:animate-none"
            />
          ))}
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-8 w-24 motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

export function CoachStructuredToolSkeleton({
  toolName,
}: {
  toolName: string;
}) {
  const kind = getCoachStructuredToolSkeletonKind(toolName);
  if (kind === "plan-draft") return <CoachPlanDraftCardSkeleton />;
  return null;
}
