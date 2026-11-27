"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useStore } from "@/lib/store";
import { DashboardPageLayout } from "./components/DashboardPageLayout";
import FitnessStatus from "./components/FitnessStatus/FitnessStatus";
import { Button } from "@/components/ui/button";
import { Check, LayoutGrid, X } from "lucide-react";
import { useFitnessStatusConfig } from "@/hooks/useFitnessStatusConfig";
import { useDashboardEditMode } from "@/hooks/useDashboardEditMode";
import { useDashboardOverviewConfig } from "@/hooks/useDashboardOverviewConfig";
import { DeferredMount } from "@/components/deferred-mount";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

function DashboardOverviewFallback() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2" aria-hidden>
      <div className="h-[290px] animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45" />
      <div className="h-[290px] animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45" />
    </div>
  );
}

const Overview = dynamic(
  () =>
    import("./components/Overview/Overview").then((module) => module.default),
  { loading: DashboardOverviewFallback, ssr: false },
);

const DashboardPage = () => {
  const t = useTranslations("DashboardPage");
  const tFitness = useTranslations("dashboard.fitnessStatus");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  useSetPageTitle(t("title"));
  const { dashboardFilters, setDashboardTime, setDashboardSportType } =
    useStore();

  const {
    startEditing: startFitnessEditing,
    cancelEditing: cancelFitnessEditing,
    saveDraftLayout,
  } = useFitnessStatusConfig();
  const {
    startEditing: startOverviewEditing,
    cancelEditing: cancelOverviewEditing,
    commitDraft: commitOverviewDraft,
  } = useDashboardOverviewConfig();
  const {
    isEditing,
    isSaving,
    startEditing: startDashboardEditing,
    cancelEditing: cancelDashboardEditing,
    setSaving: setDashboardSaving,
  } = useDashboardEditMode();

  const buttons = isEditing
    ? [
        <Button
          key="fitness-cancel"
          size="icon-sm"
          variant="ghost"
          className="hidden md:inline-flex"
          onClick={() => {
            cancelDashboardEditing();
            cancelFitnessEditing();
            cancelOverviewEditing();
          }}
          disabled={isSaving}
          aria-label={tFitness("cancel")}
          title={tFitness("cancel")}
        >
          <X className="size-4" aria-hidden />
        </Button>,
        <Button
          key="fitness-save"
          size="icon-sm"
          className="hidden md:inline-flex"
          onClick={async () => {
            setDashboardSaving(true);
            try {
              await saveDraftLayout(tFitness);
              commitOverviewDraft();
              cancelDashboardEditing();
            } finally {
              setDashboardSaving(false);
            }
          }}
          disabled={isSaving}
          aria-label={tFitness("save")}
          title={tFitness("save")}
        >
          <Check className="size-4" aria-hidden />
        </Button>,
      ]
    : [
        <Button
          key="fitness-edit"
          size="icon-sm"
          variant="ghost"
          className="hidden md:inline-flex"
          onClick={() => {
            if (publicDemo.active) return;
            startDashboardEditing();
            startFitnessEditing();
            startOverviewEditing();
          }}
          disabled={publicDemo.active}
          aria-label={tFitness("edit")}
          title={publicDemo.active ? demoText("readOnlyAction") : tFitness("edit")}
        >
          <LayoutGrid className="size-4" aria-hidden />
        </Button>,
      ];

  return (
    <DashboardPageLayout
      time={dashboardFilters.time}
      setTime={setDashboardTime}
      selectedSportType={dashboardFilters.selectedSportType}
      setSportType={setDashboardSportType}
      buttons={buttons}
    >
      {/* Fitness status cards */}
      <FitnessStatus />
      <DeferredMount fallback={<DashboardOverviewFallback />}>
        <Overview />
      </DeferredMount>
    </DashboardPageLayout>
  );
};

export default DashboardPage;
