import { MessageCircle } from "lucide-react";
import { AccessGuardedLink } from "@deployment/managed-ui";
import type { TrainingPlanDetail } from "@/api/plans";
import {
  rollupPlanDetailExecution,
  type TranslateFn,
} from "@/components/plan/detail/plan-detail-utils";
import { Panel, SectionTitle } from "@/components/plan/detail/plan-detail-panel";

export function PlanDetailCoachPanel({
  plan,
  t,
}: {
  plan: TrainingPlanDetail;
  t: TranslateFn;
}) {
  const ws = rollupPlanDetailExecution(plan);
  const pendingCount = ws.incomplete + ws.upcoming + ws.inProgress;
  const coachParams = new URLSearchParams({
    intent: "plan-followup",
    source: "plan",
    openReason: "plan_followup",
    planId: plan.id,
    pending: String(pendingCount),
  });
  const coachHref = `/ai-coach?${coachParams.toString()}`;

  return (
    <Panel className="space-y-3">
      <SectionTitle title={t("coach.title")} />
      <div className="rounded-md bg-neutral-100 p-4 dark:bg-muted/45">
        <MessageCircle className="h-5 w-5 text-muted-foreground" />
        <div className="mt-2 text-sm font-semibold">
          {t("coach.continueAsk")}
        </div>
        <p className="mt-1 indent-[2em] text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
          {t("coach.description")} · {t("execution.incomplete")} {ws.incomplete}{" "}
          · {t("execution.upcoming")} {ws.upcoming}
        </p>
        <AccessGuardedLink
          href={coachHref}
          className="mt-3 flex w-full items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t("coach.enter")}
        </AccessGuardedLink>
      </div>
    </Panel>
  );
}
