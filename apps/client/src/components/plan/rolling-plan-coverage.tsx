"use client";

import { useTranslations } from "next-intl";
import { generatedPlanThrough, type PlanPlanning } from "@/lib/rolling-plan";

export function RollingPlanCoverage({ plan }: { plan: PlanPlanning }) {
  const t = useTranslations("RollingPlan");
  const through = generatedPlanThrough(plan);
  return (
    <span className="text-mobile-caption pc:text-xs text-muted-foreground">
      {t("title")} ·{" "}
      {through
        ? t("generatedThrough", { date: through.slice(0, 10) })
        : t("notGenerated")}
    </span>
  );
}
