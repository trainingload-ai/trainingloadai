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
    !["ACTIVE", "PAUSED"].includes(plan.status)
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
    mutationFn: (enabled: boolean) =>
      setPlanAutomationEnabled(plan.id, enabled),
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
  return (
    <section className="flex flex-col gap-2" aria-label={t("title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        {state.data?.hasAuthorization ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={update.isPending || state.isError}
            onClick={() => {
              if (submitting.current || !state.data) return;
              submitting.current = true;
              update.mutate(!state.data.enabled);
            }}
          >
            {t(state.data.enabled ? "disable" : "enable")}
          </Button>
        ) : null}
      </div>
      {state.isPending || state.data ? (
        <p className="text-sm text-muted-foreground" role="status">
          {state.isPending
            ? t("loading")
            : state.isError
              ? t("lastKnown", {
                  state: t(state.data!.enabled ? "enabled" : "disabled"),
                })
              : t(state.data!.enabled ? "enabled" : "disabled")}
        </p>
      ) : null}
      {plan.status === "PAUSED" ? (
        <p className="text-sm text-muted-foreground">{t("pausedHint")}</p>
      ) : null}
      {state.data &&
      !latest &&
      !state.data.blockedReason &&
      (!state.data.hasAuthorization ||
        (state.data.enabled && plan.status === "ACTIVE")) ? (
        <p className="text-sm text-muted-foreground">
          {t(state.data.hasAuthorization ? "noTasks" : "needsAuthorization")}
        </p>
      ) : null}
      {state.data?.blockedReason ? (
        <div className="flex flex-col gap-2 text-sm">
          <p role="status">
            {t(
              state.data.blockedReason === "ROLLING_AI_ACCESS_REQUIRED"
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
        <p className="text-sm text-destructive" role="alert">
          {t("updateError")}
        </p>
      ) : null}
      {state.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-destructive" role="alert">
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
      {latest &&
      !state.data?.blockedReason &&
      ["BLOCKED", "FAILED"].includes(latest.state) ? (
        <p className="text-sm text-muted-foreground">{t("blockedHint")}</p>
      ) : null}
      {latest ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <span>{t(`kind.${latest.kind}`)}</span>
          <span>{latest.windowStart}</span>
          <span>{t(`state.${latest.state}`)}</span>
        </div>
      ) : null}
    </section>
  );
}
