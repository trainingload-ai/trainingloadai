"use client";

import { useTranslations } from "next-intl";
import type { PlanProposalPresentation } from "@shared/plan-proposal";

export function RollingStartSummary({
  rolling,
  pending = false,
}: {
  rolling: NonNullable<PlanProposalPresentation["rolling"]>;
  pending?: boolean;
}) {
  const t = useTranslations("RollingPlan");
  const sportT = useTranslations("SportCatalog");
  return (
    <section className="space-y-2 rounded-md bg-muted p-3 text-sm">
      <h3 className="font-semibold">{t("title")}</h3>
      <p>{rolling.policy.goal}</p>
      <p className="text-muted-foreground">
        {rolling.policy.sportTypes
          .map((sport) =>
            ["RUN", "CYCLING", "SWIM", "UNKNOWN"].includes(sport)
              ? sportT(
                  `families.${sport as "RUN" | "CYCLING" | "SWIM" | "UNKNOWN"}`,
                )
              : sportT(
                  `sports.${sport === "STRENGTH" ? "STRENGTH_TRAINING" : sport}`,
                ),
          )
          .join(" · ")}
      </p>
      <p className="text-muted-foreground">{t("automaticScope")}</p>
      <p className="text-muted-foreground">
        {rolling.generatedFrom} – {rolling.generatedThrough}
      </p>
      <p className="text-muted-foreground">
        {t(pending ? "plannedThrough" : "generatedThrough", {
          date: rolling.generatedThrough,
        })}
      </p>
      {rolling.monthStrategies.map((month) => (
        <div key={month.monthStart} className="space-y-1">
          <h4 className="font-medium">
            {t("monthDirection", { month: month.monthStart.slice(0, 7) })}
          </h4>
          <p>{month.objective}</p>
          {month.weekFocus.map((week) => (
            <p key={week.weekStart} className="text-muted-foreground">
              {week.weekStart} · {week.focus}
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}
