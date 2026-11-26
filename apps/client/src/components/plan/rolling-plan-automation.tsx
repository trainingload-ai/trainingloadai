"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { TrainingPlanDetail } from "@/api/plans";
import {
  getPlanAutomation,
  setPlanAutomationEnabled,
} from "@/api/plan-automation";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/query-keys";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";

type AutomationPlan = Pick<
  TrainingPlanDetail,
  "id" | "planningMode" | "status" | "startDate"
>;

export function RollingPlanAutomation({ plan }: { plan: AutomationPlan }) {
  if (
    plan.planningMode !== "ROLLING" ||
    !plan.startDate ||
    plan.status !== "ACTIVE"
  )
    return null;
  return <AutomaticManagement key={plan.id} plan={plan} />;
}

function AutomaticManagement({ plan }: { plan: AutomationPlan }) {
  const t = useTranslations("PlanAutomation");
  const client = useQueryClient();
  const submitting = useRef(false);
  const appliedJobs = useRef(new Set<string>());
  const state = useQuery({
    queryKey: queryKeys.plans.automation(plan.id),
    queryFn: () => getPlanAutomation(plan.id),
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.enabled ||
      query.state.data?.jobs.some((job) =>
        ["PENDING", "RUNNING", "RETRY"].includes(job.state),
      )
        ? 15_000
        : false,
  });
  const update = useMutation({
    mutationFn: () => setPlanAutomationEnabled(plan.id, true),
    onSettled: async () => {
      try {
        await invalidateAfterPlanMutation(client);
      } finally {
        submitting.current = false;
      }
    },
  });
  useEffect(() => {
    let changed = false;
    for (const job of state.data?.jobs ?? []) {
      if (job.state !== "APPLIED" || appliedJobs.current.has(job.id)) continue;
      appliedJobs.current.add(job.id);
      changed = true;
    }
    if (changed) void invalidateAfterPlanMutation(client);
  }, [state.data, client, plan.id]);

  const latest = state.data?.jobs[0];
  const interrupted = latest?.state === "BLOCKED" || latest?.state === "FAILED";
  const blockedReason = state.data?.blockedReason;
  const canRestore = state.data?.hasAuthorization && !state.data.enabled;
  const needsAuthorization = state.data?.hasAuthorization === false;
  if (!interrupted && !blockedReason && !canRestore && !needsAuthorization && !state.isError) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
      {canRestore ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status">{t("disabled")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={update.isPending || state.isError}
            onClick={() => {
              if (submitting.current) return;
              submitting.current = true;
              update.mutate();
            }}
          >
            {t("enable")}
          </Button>
        </div>
      ) : null}
      {needsAuthorization ? (
        <p role="status">{t("needsAuthorization")}</p>
      ) : null}
      {blockedReason ? (
        <div className="space-y-2">
          <p role="status">
            {t(
              blockedReason === "ROLLING_AI_ACCESS_REQUIRED"
                ? "accessRequired"
                : "blockedHint",
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="underline underline-offset-4" href="/account">
              {t("coachSettings")}
            </Link>
            <Link
              className="underline underline-offset-4"
              href="/account/privacy-ai"
            >
              {t("aiConsent")}
            </Link>
          </div>
        </div>
      ) : null}
      {update.isError ? (
        <p className="text-destructive" role="alert">
          {t("updateError")}
        </p>
      ) : null}
      {state.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-destructive" role="alert">
            {t("loadError")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.isFetching}
            onClick={() => void state.refetch()}
          >
            {t("retryLoad")}
          </Button>
        </div>
      ) : null}
      {interrupted && !blockedReason && state.data?.enabled ? (
        <p role="status">{t("blockedHint")}</p>
      ) : null}
    </div>
  );
}
