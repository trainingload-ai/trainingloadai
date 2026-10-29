"use client";

import { Library, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { usePlansList } from "@/api/usePlans";
import type { TrainingPlanSummary } from "@/api/plans";
import { useParams } from "next/navigation";
import { PlanCreateLauncher } from "@/components/plan/plan-create-launcher";
import {
  MobilePlanDetailSheet,
  MobilePlanLibraryItem,
} from "@/components/plan/mobile-plan-detail";
import { MOBILE_PLAN_LIBRARY_QUERY } from "@/lib/plan-navigation";
import { MobileSidePage } from "./MobileSidePage";
import { MobileSidePageTrigger } from "./MobileSidePageTrigger";
import { useMobileNavigation } from "./MobileNavigationProvider";
import { useMobileEdgeSwipe } from "../hooks/use-mobile-edge-swipe";
import { MobileTopBarAction } from "./MobileTopBar";

export function MobilePlanNavigation() {
  const t = useTranslations("MobileApp.planNavigation");
  const { resolvedTheme } = useTheme();
  const params = useParams<{ planId?: string }>();
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TrainingPlanSummary | null>(
    null,
  );
  const { plans, isLoading, error } = usePlansList(open);
  useMobileEdgeSwipe(() => setOpen(true), !open);

  useEffect(() => {
    if (!open) setSelectedPlan(null);
  }, [open]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(MOBILE_PLAN_LIBRARY_QUERY) !== "1") return;

    setOpen(true);
    url.searchParams.delete(MOBILE_PLAN_LIBRARY_QUERY);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  useMobileNavigation({
    leading: (
      <MobileSidePageTrigger
        onToggle={() => setOpen((current) => !current)}
        openLabel={t("allPlans")}
      >
        <Library aria-hidden="true" />
      </MobileSidePageTrigger>
    ),
    trailing: (
      <MobileTopBarAction asChild edge="trailing">
        <PlanCreateLauncher variant="ghost" size="icon">
          <Plus className="size-5" aria-hidden="true" />
          <span className="sr-only">{t("create")}</span>
        </PlanCreateLauncher>
      </MobileTopBarAction>
    ),
  });

  return (
    <MobileSidePage
      open={open}
      onOpenChange={setOpen}
      title={t("allPlans")}
      contentClassName={
        resolvedTheme === "dark" ? "bg-[#202221] py-3" : "bg-background py-3"
      }
      trailing={
        <MobileTopBarAction asChild>
          <PlanCreateLauncher variant="ghost" size="icon">
            <Plus className="size-5" aria-hidden="true" />
            <span className="sr-only">{t("create")}</span>
          </PlanCreateLauncher>
        </MobileTopBarAction>
      }
    >
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : null}
      {error ? (
        <p className="py-10 text-center text-sm text-destructive">
          {t("failed")}
        </p>
      ) : null}
      {!isLoading && !error && plans.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : null}
      <div className="space-y-2">
        {plans.map((plan) => (
          <MobilePlanLibraryItem
            key={plan.id}
            plan={plan}
            active={plan.status === "ACTIVE"}
            focused={selectedPlan?.id === plan.id || params?.planId === plan.id}
            onClick={() => setSelectedPlan(plan)}
          />
        ))}
      </div>
      <MobilePlanDetailSheet
        plan={selectedPlan}
        open={Boolean(selectedPlan)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedPlan(null);
        }}
        onPlanChanged={() => setOpen(false)}
      />
    </MobileSidePage>
  );
}
