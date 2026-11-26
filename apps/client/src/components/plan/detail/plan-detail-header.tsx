import { isRollingPlan } from "@/lib/rolling-plan";
import { RollingPlanCoverage } from "@/components/plan/rolling-plan-coverage";

import dayjs from "dayjs";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  PauseCircle,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { TrainingPlanDetail } from "@/api/plans";
import { PlanDescriptionRich } from "@/components/plan/plan-description-rich";
import {
  getPlanStatusClass,
  getPlanStatusLabel,
  type TranslateFn,
} from "@/components/plan/detail/plan-detail-utils";

function getPlanStatusIcon(status: TrainingPlanDetail["status"]): LucideIcon {
  switch (status) {
    case "ACTIVE":
      return TrendingUp;
    case "SCHEDULED":
      return CalendarClock;
    case "PAUSED":
      return PauseCircle;
    default:
      return CheckCircle2;
  }
}

const OFFICIAL_PLAN_GOALS = new Set(["5K", "10K", "HALF_MARATHON", "MARATHON"]);

export function getPlanGoalLabel(t: TranslateFn, goal: string) {
  const normalized = goal.trim().toUpperCase();
  return OFFICIAL_PLAN_GOALS.has(normalized)
    ? t(`goal.${normalized}`)
    : goal.trim();
}

export function PlanDetailHeader({
  plan,
  t,
}: {
  plan: TrainingPlanDetail;
  t: TranslateFn;
}) {
  const StatusIcon = getPlanStatusIcon(plan.status);
  const goalTrim = plan.goal?.trim();
  const goalLabel = goalTrim ? getPlanGoalLabel(t, goalTrim) : "";
  const descTrim = plan.description?.trim();
  const hasGoalOrDescription = Boolean(goalTrim || descTrim);

  return (
    <header className="shrink-0">
      <section className="space-y-2 rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="break-words text-base font-semibold text-foreground">
              {plan.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {plan.startDate
                  ? t("header.startOn", { date: dayjs(plan.startDate).format("YYYY-MM-DD") })
                  : t("header.notActivated")}
              </span>
              {isRollingPlan(plan) ? <RollingPlanCoverage plan={plan} /> : null}
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${getPlanStatusClass(plan.status)}`}>
            <StatusIcon className="size-3.5" aria-hidden="true" />
            {getPlanStatusLabel(t, plan.status)}
          </span>
        </div>
        {hasGoalOrDescription ? (
          <div className="mt-2 space-y-3">
            {goalTrim ? (
              <div>
                <div className="text-mobile-unit pc:text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("notes.goalLabel")}
                </div>
                <div className="mt-1 text-mobile-caption pc:text-xs">
                  <PlanDescriptionRich markdown={goalLabel} variant="detail" />
                </div>
              </div>
            ) : null}
            {descTrim ? (
              <details>
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  {t("notes.descriptionLabel")}
                </summary>
                <div className="mt-2 max-w-prose text-sm">
                  <PlanDescriptionRich markdown={descTrim} variant="detail" />
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
            {t("header.noGoalDescription")}
          </p>
        )}
      </section>
    </header>
  );
}
