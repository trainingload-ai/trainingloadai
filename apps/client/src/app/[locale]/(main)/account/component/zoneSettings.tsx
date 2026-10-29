"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirmDialog";
import { ZoneEditor, ZONE_TYPES, Benchmark } from "./zoneEditor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { BenchmarkType, UserProfile } from "@/api/settings";
import { SportType } from "@/api/activities";
import { useResetUserZone } from "@/hooks/useUserZones";
import { resolveLthrForCalculation } from "@shared/lthr";

export { BenchmarkType };

export function ZoneSettings() {
  const t = useTranslations("ZoneSettings");
  const [activeTab, setActiveTab] = useState(ZONE_TYPES.POWER);

  // Dirty state management
  const [isDirty, setIsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<ZONE_TYPES | undefined>(
    undefined,
  );
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Reset management
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const resetMutation = useResetUserZone();
  const [currentSportType, setCurrentSportType] = useState<SportType>(
    SportType.CYCLING,
  );

  const handleTabChange = (value: string) => {
    if (isDirty) {
      setPendingTab(value as ZONE_TYPES);
      setShowConfirmDialog(true);
    } else {
      setActiveTab(value as ZONE_TYPES);
    }
  };

  const handleConfirmSwitch = () => {
    if (pendingTab) {
      setActiveTab(pendingTab);
      setIsDirty(false); // Reset dirty state as we discarded changes
    }
    setShowConfirmDialog(false);
    setPendingTab(undefined);
  };

  const handleCancelSwitch = () => {
    setShowConfirmDialog(false);
    setPendingTab(undefined);
  };

  const handleReset = async () => {
    try {
      await resetMutation.mutateAsync({
        sportType: currentSportType,
        zoneType: activeTab,
      });
      toast.success(t("resetSuccess"));
      setResetKey((prev) => prev + 1);
      setIsDirty(false);
    } catch (error) {
      console.error(error);
      toast.error(t("resetError"));
    } finally {
      setShowResetDialog(false);
    }
  };

  const powerBenchmarks = useMemo<Benchmark[]>(
    () => [
      {
        label: t("benchmark.ftp"),
        value: BenchmarkType.FTP,
        getValue: (p?: UserProfile) => p?.ftp || undefined,
        isDisabled: (p?: UserProfile) => !p?.ftp,
        disabledReason: t("ftpNoData"),
      },
      {
        label: t("benchmark.cp"),
        value: BenchmarkType.CP,
        getValue: (p?: UserProfile) => p?.cp || undefined,
        isDisabled: (p?: UserProfile) => !p?.cp,
        disabledReason: t("cpNoData"),
      },
      {
        label: t("benchmark.custom"),
        value: BenchmarkType.CUSTOM,
        getValue: () => 1,
      },
    ],
    [t],
  );

  const hrBenchmarks = useMemo<Benchmark[]>(
    () => [
      {
        label: t("benchmark.maxHr"),
        value: BenchmarkType.MHR,
        getValue: (p?: UserProfile) => p?.maxHeartRate || 200,
      },
      {
        label: t("benchmark.lthr"),
        value: BenchmarkType.LTHR,
        getValue: (p?: UserProfile) =>
          resolveLthrForCalculation({
            lthr: p?.lthr,
            maxHeartRate: p?.maxHeartRate,
          })?.value,
        isDisabled: (p?: UserProfile) =>
          !resolveLthrForCalculation({
            lthr: p?.lthr,
            maxHeartRate: p?.maxHeartRate,
          }),
      },
      {
        label: t("benchmark.hrr"),
        value: BenchmarkType.HRR,
        getValue: (p?: UserProfile) => {
          const maxHr = p?.maxHeartRate;
          const restingHr = p?.restingHeartRate;
          if (!maxHr || !restingHr) return undefined;
          return maxHr - restingHr;
        },
        isDisabled: (p?: UserProfile) =>
          !p?.maxHeartRate || !p?.restingHeartRate,
        disabledReason: t("hrrNoData"),
      },
      {
        label: t("benchmark.custom"),
        value: BenchmarkType.CUSTOM,
        getValue: () => 1,
      },
    ],
    [t],
  );

  const paceBenchmarks = useMemo<Benchmark[]>(
    () => [
      {
        label: t("benchmark.cs"),
        value: BenchmarkType.CS,
        getValue: (p?: UserProfile) => p?.cs || undefined,
        isDisabled: (p?: UserProfile) => !p?.cs,
        disabledReason: t("csNoData"),
      },
      {
        label: t("benchmark.custom"),
        value: BenchmarkType.CUSTOM,
        getValue: () => 1,
      },
    ],
    [t],
  );

  return (
    <section className="space-y-2">
      <ConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title={t("unsavedChanges.title")}
        description={t("unsavedChanges.description")}
        confirmText={t("unsavedChanges.discard")}
        cancelText={t("unsavedChanges.keep")}
        confirmButtonVariant="destructive"
        onConfirm={handleConfirmSwitch}
        onCancel={handleCancelSwitch}
      />

      <ConfirmDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        title={t("resetConfirmTitle")}
        description={t("resetConfirmDesc")}
        confirmText={t("reset")}
        cancelText={t("cancel")}
        confirmButtonVariant="destructive"
        onConfirm={handleReset}
        onCancel={() => setShowResetDialog(false)}
      />

      <div className="px-1">
        <div>
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <div className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="space-x-2 bg-neutral-200/70 dark:bg-muted">
              <TabsTrigger value={ZONE_TYPES.POWER}>{t("power")}</TabsTrigger>
              <TabsTrigger value={ZONE_TYPES.HEART_RATE}>
                {t("heartRate")}
              </TabsTrigger>
              <TabsTrigger value={ZONE_TYPES.PACE}>{t("pace")}</TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetDialog(true)}
              className="w-full justify-center sm:w-auto"
            >
              <RotateCcw className="h-4 w-4" />
              {t("reset")}
            </Button>
          </div>

          <TabsContent value={ZONE_TYPES.POWER} className="space-y-4">
            <ZoneEditor
              key={`${ZONE_TYPES.POWER}-${resetKey}`}
              zoneType={ZONE_TYPES.POWER}
              defaultSport={currentSportType}
              onDirtyChange={setIsDirty}
              benchmarks={powerBenchmarks}
              onSportChange={setCurrentSportType}
            />
          </TabsContent>
          <TabsContent value={ZONE_TYPES.HEART_RATE}>
            <ZoneEditor
              key={`${ZONE_TYPES.HEART_RATE}-${resetKey}`}
              zoneType={ZONE_TYPES.HEART_RATE}
              defaultSport={currentSportType}
              onDirtyChange={setIsDirty}
              benchmarks={hrBenchmarks}
              onSportChange={setCurrentSportType}
            />
          </TabsContent>
          <TabsContent value={ZONE_TYPES.PACE}>
            <ZoneEditor
              key={`${ZONE_TYPES.PACE}-${resetKey}`}
              zoneType={ZONE_TYPES.PACE}
              defaultSport={currentSportType}
              onDirtyChange={setIsDirty}
              benchmarks={paceBenchmarks}
              onSportChange={setCurrentSportType}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
