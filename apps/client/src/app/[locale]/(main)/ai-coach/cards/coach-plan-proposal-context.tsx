import { useFormatter, useTranslations } from "next-intl";
import type { PlanProposalPresentation } from "@shared/plan-proposal";
import { cn } from "@/lib/utils";

export function CoachPlanProposalContext({ proposal }: { proposal: PlanProposalPresentation }) {
  const t = useTranslations("AiCoachPage.decision");
  const format = useFormatter();
  const syncImpact = proposal.mode === "START" || proposal.mode === "SCHEDULE"
    ? t(proposal.mode === "START" ? "startSyncImpact" : "scheduleSyncImpact")
    : proposal.syncImpact;
  const hasEvidence = proposal.facts.length > 0;
  const hasImpact = proposal.estimatedLoadDelta != null || Boolean(syncImpact || proposal.effectiveFrom);
  if (!hasEvidence && !hasImpact) return null;

  return (
    <div className="@container rounded-md border border-border bg-background/60 px-3 py-3">
      <div className={cn("grid gap-3", hasEvidence && hasImpact && "@min-[32rem]:grid-cols-2")}>
        {hasEvidence ? (
          <section className="min-w-0 space-y-2">
            <h3 className="text-xs font-semibold text-foreground">{t("evidence")}</h3>
            <dl className="grid gap-2">
              {proposal.facts.map(({ type, label, value }, index) => (
                <div key={`${type}:${label}:${index}`} className="min-w-0 [overflow-wrap:anywhere]">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  {value != null ? <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd> : null}
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        {hasImpact ? (
          <section className={cn("min-w-0 space-y-2", hasEvidence && "border-t border-border pt-3 @min-[32rem]:border-s @min-[32rem]:border-t-0 @min-[32rem]:ps-3 @min-[32rem]:pt-0")}>
            <h3 className="text-xs font-semibold text-foreground">{t("expectedImpact")}</h3>
            <dl className="flex flex-wrap gap-x-5 gap-y-2">
              {proposal.estimatedLoadDelta != null ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("loadDelta")}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {format.number(proposal.estimatedLoadDelta, { signDisplay: "exceptZero" })}
                  </dd>
                </div>
              ) : null}
              {syncImpact ? (
                <div className="min-w-0 flex-[1_1_9rem] [overflow-wrap:anywhere]">
                  <dt className="text-xs text-muted-foreground">{t("syncImpact")}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{syncImpact}</dd>
                </div>
              ) : null}
              {proposal.effectiveFrom ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("startDate")}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{proposal.effectiveFrom}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}
      </div>
    </div>
  );
}
