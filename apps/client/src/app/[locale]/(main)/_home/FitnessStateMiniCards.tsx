"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDashboardPMC } from "@/api/usePMC";
import { useUserBasicInfo } from "@/hooks/useUserProfile";
import { useStore } from "@/lib/store";
import {
  useDashboardWeeklySummaryPair,
  type WeeklySummaryKey,
} from "@/api/charts";
import { formatValue } from "@/hooks/useFormatterBySettings";
import type { FitnessStatusMetricKey } from "@/hooks/useFitnessStatusConfig";
import { FitnessStatusCardSubContent } from "@/app/[locale]/(main)/dashboard/components/FitnessStatus/components/FitnessStatusCardSubContent";
import { FitnessStatusStatCard } from "@/app/[locale]/(main)/dashboard/components/FitnessStatus/components/FitnessStatusStatCard";
import { MetricHistoryDialog } from "@/app/[locale]/(main)/dashboard/components/FitnessStatus/MetricHistoryDialog";
import {
  SortableFitnessStatCard,
  getSpanClass,
  type FitnessStatCard,
} from "@/app/[locale]/(main)/dashboard/components/FitnessStatus/components/SortableFitnessStatCard";
import { FitnessStatusAddMetricDialog } from "@/app/[locale]/(main)/dashboard/components/FitnessStatus/components/FitnessStatusAddMetricDialog";
import {
  buildFitnessStatusStats,
  createInitialMetricDialogState,
  FITNESS_STATUS_METRIC_KEYS,
  getWeeklyMetricType,
  getWeeklyMetricUnit,
  type MetricClickData,
  type MetricDialogState,
} from "@/app/[locale]/(main)/dashboard/components/FitnessStatus/fitness-status-model";
import {
  MAX_HOME_METRICS,
  useHomeCurrentStateLayout,
} from "@/hooks/useHomeCurrentStateLayout";
import { Button } from "@/components/ui/button";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

/**
 * 体能状态小卡片 使用在首页右侧的状态面板
 * @description 体能状态小卡片，比如说 疲劳、体能、状态、最大摄氧量等
 * @returns {React.ReactNode} 体能状态小卡片
 */
export default function FitnessStateMiniCards() {
  const t = useTranslations("dashboard.fitnessStatus");
  const tHome = useTranslations("V2HomePage.currentState");
  const tv2 = useTranslations("V2HomePage.currentState.healthCard");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const locale = useLocale();
  const { dashboardFilters, systemUnit } = useStore();
  const selectedSportType = dashboardFilters.selectedSportType;

  const {
    layout,
    draftLayout,
    setDraftLayout,
    startEditing,
    cancelEditing,
    commitDraft,
    isEditing,
  } = useHomeCurrentStateLayout();

  const [metricDialogOpen, setMetricDialogOpen] =
    React.useState<MetricDialogState>(createInitialMetricDialogState());
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);

  const { restingHeartRate, maxHeartRate } = useUserBasicInfo();

  const {
    fitnessData,
    atlPercent,
    ctlPercent,
    tsbDomainMin,
    tsbDomainMax,
    tsbFillPercent,
    tsbZone,
    acRatioFillPercent,
    acRatioZone,
    monotonyFillPercent,
    monotonyZone,
    isPending: isPMCPending,
  } = useDashboardPMC();

  const { data: weeklySummaryPair, isPending: isWeeklyPending } =
    useDashboardWeeklySummaryPair(selectedSportType);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const [activeDragKey, setActiveDragKey] =
    React.useState<FitnessStatusMetricKey | null>(null);

  const handleMetricClick = React.useCallback((stat: MetricClickData) => {
    setMetricDialogOpen({
      open: true,
      key: stat.key,
      title: stat.title,
      currentValue: stat.value,
      unit: stat.unit,
      description: stat.details,
      links: stat.links,
    });
  }, []);

  const formatWeeklyValue = React.useCallback(
    (key: WeeklySummaryKey, v: number | undefined) => {
      if (v == null || !Number.isFinite(v)) return "-";
      if (key === "weekPressure") return String(Math.round(v));
      const metricType = getWeeklyMetricType(key);
      return formatValue(v, metricType, systemUnit);
    },
    [systemUnit],
  );

  const getWeeklyUnit = React.useCallback(
    (key: WeeklySummaryKey) => getWeeklyMetricUnit({ key, systemUnit, t }),
    [systemUnit, t],
  );

  const stats = React.useMemo(
    () =>
      buildFitnessStatusStats({
        t,
        locale,
        fitnessData,
        weeklySummaryPair,
        formatWeeklyValue,
        getWeeklyUnit,
        systemUnit,
        onMetricClick: handleMetricClick,
      }),
    [
      t,
      locale,
      fitnessData,
      weeklySummaryPair,
      formatWeeklyValue,
      getWeeklyUnit,
      systemUnit,
      handleMetricClick,
    ],
  );

  const statsByKey = React.useMemo(() => {
    const map = new Map<FitnessStatusMetricKey, FitnessStatCard>();
    for (const stat of stats) map.set(stat.key, stat);
    return map;
  }, [stats]);

  const orderedCards = React.useMemo(() => {
    return layout
      .map((item) => {
        const stat = statsByKey.get(item.key);
        if (!stat) return null;
        return stat;
      })
      .filter((x): x is FitnessStatCard => !!x);
  }, [layout, statsByKey]);

  const selectedMetricKeys = React.useMemo(() => {
    return new Set(draftLayout.map((i) => i.key));
  }, [draftLayout]);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      if (active.id === over.id) return;
      const oldIndex = draftLayout.findIndex((i) => i.key === active.id);
      const newIndex = draftLayout.findIndex((i) => i.key === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      setDraftLayout(arrayMove(draftLayout, oldIndex, newIndex));
    },
    [draftLayout, setDraftLayout],
  );

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveDragKey(event.active.id as FitnessStatusMetricKey);
  }, []);

  const handleDragCancel = React.useCallback(() => {
    setActiveDragKey(null);
  }, []);

  const activeDragItem = React.useMemo(() => {
    if (!activeDragKey) return null;
    const item = draftLayout.find((x) => x.key === activeDragKey);
    if (!item) return null;
    const stat = statsByKey.get(item.key);
    if (!stat) return null;
    return { item, stat };
  }, [activeDragKey, draftLayout, statsByKey]);

  const subContent = React.useCallback(
    (stat: FitnessStatCard) => (
      <FitnessStatusCardSubContent
        stat={stat}
        t={t}
        weeklySummaryPair={weeklySummaryPair}
        formatWeeklyValue={formatWeeklyValue}
        fitnessData={fitnessData}
        atlPercent={atlPercent}
        ctlPercent={ctlPercent}
        tsbZone={tsbZone}
        tsbDomainMin={tsbDomainMin}
        tsbDomainMax={tsbDomainMax}
        tsbFillPercent={tsbFillPercent}
        acRatioZone={acRatioZone}
        acRatioFillPercent={acRatioFillPercent}
        monotonyZone={monotonyZone}
        monotonyFillPercent={monotonyFillPercent}
      />
    ),
    [
      acRatioFillPercent,
      acRatioZone,
      atlPercent,
      ctlPercent,
      fitnessData,
      formatWeeklyValue,
      monotonyFillPercent,
      monotonyZone,
      t,
      tsbDomainMax,
      tsbDomainMin,
      tsbFillPercent,
      tsbZone,
      weeklySummaryPair,
    ],
  );

  const isStatsPending = isPMCPending || isWeeklyPending;

  const handleSaveLayout = React.useCallback(() => {
    if (publicDemo.active) return;
    commitDraft();
    setAddDialogOpen(false);
    toast.success(t("saveSuccess"));
  }, [commitDraft, publicDemo.active, t]);

  const canAddMore = draftLayout.length < MAX_HOME_METRICS;

  return (
    <div className="space-y-3">
      {/* 操作头 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {tHome("title")}
        </h2>
        {isEditing ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                cancelEditing();
                setAddDialogOpen(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="button" size="sm" onClick={handleSaveLayout}>
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1"
              disabled={!canAddMore}
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("addMetric")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={tHome("settingsAria")}
            title={
              publicDemo.active
                ? demoText("readOnlyAction")
                : tHome("settingsTitle")
            }
            disabled={publicDemo.active}
            onClick={() => {
              if (publicDemo.active) return;
              startEditing();
              setAddDialogOpen(false);
            }}
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 体能状态卡片，比如说 疲劳、体能、状态、最大摄氧量等 */}
      <div className="grid grid-cols-1 gap-3">
        {isStatsPending ? (
          Array.from({
            length: Math.max(
              1,
              (isEditing ? draftLayout.length : layout.length) || 4,
            ),
          }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-md bg-neutral-100 dark:bg-muted/45"
            />
          ))
        ) : isEditing ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={(e) => {
              handleDragEnd(e);
              setActiveDragKey(null);
            }}
            onDragCancel={() => {
              handleDragCancel();
              setActiveDragKey(null);
            }}
          >
            <SortableContext
              items={draftLayout.map((i) => i.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-4">
                {draftLayout.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-8 text-center text-mobile-caption pc:text-xs text-muted-foreground">
                    {tHome("emptyMetrics")}
                  </div>
                ) : null}
                {draftLayout.map((item) => {
                  const stat = statsByKey.get(item.key);
                  if (!stat) return null;
                  return (
                    <SortableFitnessStatCard
                      key={item.key}
                      stat={stat}
                      span={1}
                      showSpanControls={false}
                      subContent={subContent(stat)}
                      onSpanChange={() => {}}
                      onRemove={() => {
                        setDraftLayout(
                          draftLayout.filter((x) => x.key !== item.key),
                        );
                      }}
                    />
                  );
                })}
              </div>
            </SortableContext>
            <DragOverlay adjustScale={false}>
              {activeDragItem ? (
                <div className={getSpanClass(1)}>
                  <FitnessStatusStatCard
                    stat={activeDragItem.stat}
                    subContent={subContent(activeDragItem.stat)}
                    rightAccessory={
                      <button
                        type="button"
                        className="pointer-events-none rounded-full p-1 text-muted-foreground opacity-0"
                        tabIndex={-1}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : orderedCards.length === 0 ? (
          <div className="rounded-md bg-neutral-100 px-3 py-6 text-center text-mobile-caption pc:text-xs text-muted-foreground dark:bg-muted/45">
            {tHome("emptyMetrics")}
          </div>
        ) : (
          orderedCards.map((stat) => (
            <FitnessStatusStatCard
              key={stat.key}
              stat={stat}
              onClick={stat.onClick}
              className="border-0 bg-neutral-100 p-1 shadow-none hover:cursor-pointer hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
              subContent={subContent(stat)}
              rightAccessory={
                stat.onClick ? (
                  <button className="cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-muted">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : null
              }
            />
          ))
        )}
      </div>

      {/* 添加指标对话框 */}
      {isEditing ? (
        <FitnessStatusAddMetricDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          showTrigger={false}
          mobileSheet
          metricKeys={FITNESS_STATUS_METRIC_KEYS}
          statsByKey={statsByKey}
          selectedMetricKeys={selectedMetricKeys}
          onAddMetric={(key) => {
            if (draftLayout.some((x) => x.key === key)) return;
            if (draftLayout.length >= MAX_HOME_METRICS) return;
            setDraftLayout([...draftLayout, { key, span: 1 }]);
          }}
          renderSubContent={subContent}
        />
      ) : null}

      {/* 健康相关的，比如说最大心率等 */}
      <section className="rounded-md border border-border/70 bg-background p-3">
        <div className="text-sm font-medium">{tv2("title")}</div>
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {tv2("restingHeartRate")}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {restingHeartRate ?? "--"}{" "}
              <span className="text-mobile-caption pc:text-xs text-muted-foreground">
                bpm
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{tv2("maxHeartRate")}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {maxHeartRate ?? "--"}{" "}
              <span className="text-mobile-caption pc:text-xs text-muted-foreground">
                bpm
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* 历史数据弹窗 */}
      <MetricHistoryDialog
        open={metricDialogOpen.open}
        onOpenChange={(open) =>
          setMetricDialogOpen((prev) => ({ ...prev, open }))
        }
        metricKey={metricDialogOpen.key}
        title={metricDialogOpen.title}
        currentValue={metricDialogOpen.currentValue}
        unit={metricDialogOpen.unit}
        description={metricDialogOpen.description}
        links={metricDialogOpen.links}
        mobileSheet
      />
    </div>
  );
}
