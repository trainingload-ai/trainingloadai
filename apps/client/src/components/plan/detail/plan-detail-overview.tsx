import type { TrainingPlanDetail } from "@/api/plans";
import {
  rollupPlanDetailExecution,
  type TranslateFn,
} from "@/components/plan/detail/plan-detail-utils";
import { Panel, SectionTitle } from "@/components/plan/detail/plan-detail-panel";

export function PlanDetailOverview({
  plan,
  t,
}: {
  plan: TrainingPlanDetail;
  t: TranslateFn;
}) {
  const ws = rollupPlanDetailExecution(plan);
  const completionPercent = plan.workouts.length
    ? Math.round((ws.done / plan.workouts.length) * 100)
    : 0;

  const items = [
    {
      label: t("overview.cycleLength"),
      value: t("overview.weekCount", { count: plan.periodWeeks }),
    },
    { label: t("overview.completionRate"), value: `${completionPercent}%` },
    {
      label: t("execution.incomplete"),
      value: String(ws.incomplete),
    },
    { label: t("execution.done"), value: String(ws.done) },
  ];

  return (
    <Panel className="shrink-0 space-y-3">
      <SectionTitle title={t("overview.title")} />
      <div className="grid gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45"
          >
            <div className="text-mobile-caption pc:text-xs text-muted-foreground">{item.label}</div>
            <div className="mt-1 text-xl font-semibold">{item.value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
