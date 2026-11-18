"use client";

import { RollingPlanLoadSummary } from "./rolling-plan-load-summary";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { TrainingPlanDetail } from "@/api/plans";
import { Button } from "@/components/ui/button";
import { PlanCreateLauncher } from "./plan-create-launcher";
import { RollingPlanCoverage } from "./rolling-plan-coverage";
import { RollingPlanCalendar } from "./rolling-plan-calendar";
import { RollingPlanMonthDirection } from "./rolling-plan-month-direction";
import { RollingPlanAutomation } from "./rolling-plan-automation";
import { PlanStartConversationDialog } from "./plan-start-conversation-dialog";

export function RollingPlanExecution({ plan }: { plan: TrainingPlanDetail }) {
  const pageT = useTranslations("V2PlanPage");
  const [coachOpen, setCoachOpen] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3">
      <header className="space-y-2 rounded-surface bg-muted p-3">
        <h1 className="text-base font-semibold">{plan.title}</h1>
        <RollingPlanCoverage plan={plan} />
        {plan.goal ? <p className="text-sm">{plan.goal}</p> : null}
        <RollingPlanMonthDirection plan={plan} />
        <RollingPlanAutomation plan={plan} />
        <RollingPlanLoadSummary plan={plan} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCoachOpen(true)}
          >
            {pageT("coach.ask")}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/plans/${plan.id}`}>
              {pageT("today.viewTodayPlan")}
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/plans">{pageT("header.viewOtherPlans")}</Link>
          </Button>
          <PlanCreateLauncher size="sm" variant="outline">
            {pageT("header.createPlan")}
          </PlanCreateLauncher>
        </div>
      </header>
      <RollingPlanCalendar plan={plan} />
      <PlanStartConversationDialog
        open={coachOpen}
        planId={plan.id}
        onOpenChange={setCoachOpen}
      />
    </div>
  );
}
