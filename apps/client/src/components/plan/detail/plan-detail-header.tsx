import dayjs from "dayjs";
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  PauseCircle,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
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
  backHref,
}: {
  plan: TrainingPlanDetail;
  t: TranslateFn;
  backHref: "/plans" | "/plan?openLibrary=1";
}) {
  const StatusIcon = getPlanStatusIcon(plan.status);
  const goalTrim = plan.goal?.trim();
  const goalLabel = goalTrim ? getPlanGoalLabel(t, goalTrim) : "";
  const descTrim = plan.description?.trim();
  const hasGoalOrDescription = Boolean(goalTrim || descTrim);

  return (
    <header className="shrink-0">
      <div className="mb-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("header.backToPlans")}
        </Link>
      </div>
      <section className="relative rounded-md bg-neutral-100 p-2.5 dark:bg-muted/45">
        <span
          className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-mobile-caption pc:text-[11px] ${getPlanStatusClass(
            plan.status,
          )}`}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {getPlanStatusLabel(t, plan.status)}
        </span>
        <div className="min-w-0 pr-20">
          <div className="flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>
              {plan.startDate
                ? t("header.startOn", {
                    date: dayjs(plan.startDate).format("YYYY-MM-DD"),
                  })
                : t("header.notActivated")}
            </span>
          </div>
          <h1 className="mt-1 truncate text-base font-semibold tracking-normal text-foreground">
            {plan.title}
          </h1>
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
              <div>
                <div className="text-mobile-unit pc:text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("notes.descriptionLabel")}
                </div>
                <div className="mt-1 text-mobile-caption pc:text-xs">
                  <PlanDescriptionRich markdown={descTrim} variant="detail" />
                </div>
              </div>
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
