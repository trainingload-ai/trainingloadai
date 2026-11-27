"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  confirmAndApplyCoachDecision,
  fetchCoachHomeReviewState,
  rejectCoachDecision,
  type PendingCoachDecision,
} from "@/api/ai-coach";
import {
  coachCycleStartHref,
  isOpenNextCoachDecision,
} from "@shared/coach-adjustment-decision";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/query-keys";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

export function HomeContinuationProposalCard() {
  const t = useTranslations("V2HomePage");
  const router = useRouter();
  const queryClient = useQueryClient();
  const publicDemo = usePublicDemo();

  const reviewQuery = useQuery({
    queryKey: queryKeys.ai.pendingDecisions(),
    queryFn: fetchCoachHomeReviewState,
    enabled: !publicDemo.active,
    staleTime: 60_000,
    retry: false,
  });

  const decision: PendingCoachDecision | null =
    reviewQuery.data?.decisions.find(isOpenNextCoachDecision) ?? null;

  const applyMutation = useMutation({
    mutationFn: (item: PendingCoachDecision) =>
      confirmAndApplyCoachDecision(item.id),
    onSuccess: async (_, item) => {
      toast.success(t("decisionStack.startNextSuccess"));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.ai.pendingDecisions(),
        }),
        invalidateAfterPlanMutation(queryClient),
        queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() }),
      ]);
      router.push(coachCycleStartHref(item));
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ai.pendingDecisions(),
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (decisionId: string) => rejectCoachDecision(decisionId),
    onSuccess: async () => {
      toast.success(t("decisionStack.rejectSuccess"));
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ai.pendingDecisions(),
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ai.pendingDecisions(),
      });
    },
  });

  if (publicDemo.active || !decision) return null;

  const busy = applyMutation.isPending || rejectMutation.isPending;

  return (
    <section
      aria-label={t("decisionStack.startNextTitle")}
      data-testid="home-continuation-proposal"
      className="flex flex-col gap-3 rounded-xl border border-border/70 bg-neutral-100 p-4 dark:bg-surface-strong pc:flex-row pc:items-center pc:justify-between pc:rounded-surface pc:px-4 pc:py-3"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {t("decisionStack.startNextTitle")}
          </h2>
          {decision.planTitle ? (
            <span className="text-xs text-muted-foreground">
              {decision.planTitle}
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {decision.rationale?.trim() || t("decisionStack.confirmDescription")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => rejectMutation.mutate(decision.id)}
        >
          {t("decisionStack.dismiss")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => applyMutation.mutate(decision)}
        >
          {applyMutation.isPending ? (
            <Loader2 className="me-1.5 size-3.5 animate-spin" aria-hidden />
          ) : null}
          {t("decisionStack.confirm")}
        </Button>
      </div>
    </section>
  );
}
