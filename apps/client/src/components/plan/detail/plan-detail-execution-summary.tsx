import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  PlayCircle,
  SkipForward,
} from "lucide-react";
import type { TrainingPlanDetail } from "@/api/plans";
import {
  rollupPlanDetailExecution,
  type TranslateFn,
} from "@/components/plan/detail/plan-detail-utils";
import { Panel, SectionTitle } from "@/components/plan/detail/plan-detail-panel";

export function PlanDetailExecutionSummary({
  plan,
  t,
}: {
  plan: TrainingPlanDetail;
  t: TranslateFn;
}) {
  const ws = rollupPlanDetailExecution(plan);
  const items = [
    {
      label: t("execution.incomplete"),
      value: ws.incomplete,
      icon: CircleDashed,
    },
    {
      label: t("execution.upcoming"),
      value: ws.upcoming,
      icon: Clock3,
    },
    ...(ws.inProgress > 0
      ? [
          {
            label: t("execution.inProgress"),
            value: ws.inProgress,
            icon: PlayCircle,
          },
        ]
      : []),
    {
      label: t("execution.done"),
      value: ws.done,
      icon: CheckCircle2,
    },
    {
      label: t("execution.skipped"),
      value: ws.skipped,
      icon: SkipForward,
    },
    {
      label: t("execution.postponed"),
      value: ws.moved,
      icon: CalendarClock,
    },
  ];

  return (
    <Panel className="space-y-3">
      <SectionTitle title={t("execution.title")} />
      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45"
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              <span className="text-sm font-semibold">{item.value}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
