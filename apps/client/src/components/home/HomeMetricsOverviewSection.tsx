"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { Plus, Settings2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useHealthOverview } from "@/api/health-data";
import {
  buildOverviewMetricOptionGroups,
  getDashboardMetricChartStyle,
  getDashboardMetricTitle,
} from "@/app/[locale]/(main)/dashboard/components/Overview/overview-model";
import {
  getHealthOverviewCopy,
  HealthMetricCard,
  HealthMetricCardEmpty,
  HealthMetricCardLoading,
} from "@/components/health/HealthOverviewSection";
import {
  buildHealthOverviewCards,
  type HealthOverviewCard,
} from "@/components/health/health-overview-model";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOverviewMetricChartPolicy } from "@/components/metrics/metric-chart-policy";
import type { DashboardOverviewMetricKey } from "@/hooks/useDashboardOverviewConfig";
import {
  HOME_HEALTH_METRIC_KEYS,
  isHomeHealthMetricKey,
  type HomeHealthMetricKey,
  type HomeOverviewLayoutItem,
  type HomeOverviewMetricKey,
  useHomeMetricOverviewConfig,
} from "@/hooks/useHomeMetricOverviewConfig";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import {
  homeOverviewSpanClass,
  SortableHomeOverviewCard,
} from "./SortableHomeOverviewCard";

const OverviewMetricChart = dynamic(
  () =>
    import("@/app/[locale]/(main)/dashboard/components/Overview/OverviewMetricCharts").then(
      (module) => module.OverviewMetricChart,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[220px] rounded-xl" />,
  },
);

const COPY = {
  zh: {
    title: "概览",
    description: "24×7 健康与训练趋势",
    configure: "配置概览",
    cancel: "取消",
    save: "保存",
    add: "添加指标",
    addTitle: "添加健康指标",
    addDescription: "选择需要在首页查看的健康或概览指标。",
    added: "已添加",
    addAction: "添加",
    healthGroup: "24×7 健康",
    empty: "尚未选择指标，可通过“添加指标”进行配置。",
    remove: "移除指标",
    expand: "加宽卡片",
    shrink: "缩窄卡片",
  },
  en: {
    title: "Overview",
    description: "24×7 health and training trends",
    configure: "Configure overview",
    cancel: "Cancel",
    save: "Save",
    add: "Add metric",
    addTitle: "Add health metric",
    addDescription: "Choose health or overview metrics to show on Home.",
    added: "Added",
    addAction: "Add",
    healthGroup: "24×7 health",
    empty: "No metrics selected. Use Add metric to configure this section.",
    remove: "Remove metric",
    expand: "Make card wider",
    shrink: "Make card narrower",
  },
} as const;

type HomeMetricEntry = {
  item: HomeOverviewLayoutItem;
  healthCard?: HealthOverviewCard;
  kind: "health" | "health-empty" | "health-loading" | "overview";
};

type HomeMetricOptionGroup = {
  group: string;
  title: string;
  options: Array<{ key: HomeOverviewMetricKey; title: string }>;
};

export function HomeMetricsOverviewSection() {
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  const locale = useLocale();
  const copy = locale.startsWith("zh") ? COPY.zh : COPY.en;
  const healthCopy = getHealthOverviewCopy(locale);
  const tDashboard = useTranslations("dashboard");
  const tFitness = useTranslations("dashboard.fitnessStatus");
  const tOverview = useTranslations("dashboard.overview");
  const healthQuery = useHealthOverview(30);
  const healthCards = useMemo(
    () => buildHealthOverviewCards(healthQuery.data?.days ?? []),
    [healthQuery.data?.days],
  );
  const healthCardsByKey = useMemo(
    () => new Map(healthCards.map((card) => [card.key, card])),
    [healthCards],
  );
  const overviewGroups = useMemo(
    () => buildOverviewMetricOptionGroups({ tDashboard, tFitness, tOverview }),
    [tDashboard, tFitness, tOverview],
  );
  const metricOptionGroups = useMemo<HomeMetricOptionGroup[]>(
    () => [
      {
        group: "health",
        title: copy.healthGroup,
        options: HOME_HEALTH_METRIC_KEYS.map((key) => ({
          key,
          title: healthCopy[key],
        })),
      },
      ...overviewGroups,
    ],
    [copy.healthGroup, healthCopy, overviewGroups],
  );
  const metricOptions = useMemo(
    () => metricOptionGroups.flatMap((group) => group.options),
    [metricOptionGroups],
  );
  const {
    layout,
    draftLayout,
    isEditing,
    setDraftLayout,
    startEditing,
    cancelEditing,
    commitDraft,
  } = useHomeMetricOverviewConfig();
  const [addOpen, setAddOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<HomeOverviewMetricKey>("sleep");
  const [activeDragKey, setActiveDragKey] =
    useState<HomeOverviewMetricKey | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const activeLayout = isEditing ? draftLayout : layout;
  const visibleEntries = activeLayout.flatMap<HomeMetricEntry>((item) => {
    if (!isHomeHealthMetricKey(item.key)) {
      return [{ item, kind: "overview" }];
    }
    const healthCard = healthCardsByKey.get(item.key);
    if (healthCard) return [{ item, healthCard, kind: "health" }];
    return [
      {
        item,
        kind: healthQuery.isPending ? "health-loading" : "health-empty",
      },
    ];
  });
  const selectedKeys = useMemo(
    () => new Set(draftLayout.map((item) => item.key)),
    [draftLayout],
  );
  const activeDragEntry = activeDragKey
    ? visibleEntries.find(({ item }) => item.key === activeDragKey)
    : null;

  const metricTitle = (key: DashboardOverviewMetricKey) =>
    getDashboardMetricTitle({ tDashboard, tFitness, metricKey: key });

  useEffect(() => {
    if (!addOpen) return;
    const preferred =
      metricOptions.find((option) => !selectedKeys.has(option.key))?.key ??
      metricOptions[0]?.key;
    if (preferred) setPreviewKey(preferred);
  }, [addOpen, metricOptions, selectedKeys]);

  const renderEntry = (entry: HomeMetricEntry) => {
    if (entry.kind === "health-loading") {
      return (
        <HealthMetricCardLoading
          metricKey={entry.item.key as HomeHealthMetricKey}
          copy={healthCopy}
          height="h-[220px]"
          appearance="soft"
        />
      );
    }
    if (entry.kind === "health-empty") {
      return (
        <HealthMetricCardEmpty
          metricKey={entry.item.key as HomeHealthMetricKey}
          copy={healthCopy}
          height="h-[220px]"
          appearance="soft"
        />
      );
    }
    if (entry.kind === "health" && entry.healthCard) {
      return (
        <HealthMetricCard
          card={entry.healthCard}
          referenceDate={healthQuery.data?.endDate}
          locale={locale}
          copy={healthCopy}
          height="h-[220px]"
          appearance="soft"
        />
      );
    }
    const key = entry.item.key as DashboardOverviewMetricKey;
    const chartStyle = getDashboardMetricChartStyle(key);
    const policy = getOverviewMetricChartPolicy(key);
    return (
      <OverviewMetricChart
        metricKey={key}
        height="h-[220px]"
        title={metricTitle(key)}
        accentColor={chartStyle.accentColor}
        comparisonColor={chartStyle.comparisonColor}
        titleIcon={chartStyle.icon}
        defaultRangeDays={policy.defaultRangeDays}
        appearance="soft"
      />
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragKey(null);
    if (!over || active.id === over.id) return;
    setDraftLayout((current) => {
      const oldIndex = current.findIndex((item) => item.key === active.id);
      const newIndex = current.findIndex((item) => item.key === over.id);
      return oldIndex < 0 || newIndex < 0
        ? current
        : arrayMove(current, oldIndex, newIndex);
    });
  };

  const addMetric = (key: HomeOverviewMetricKey) => {
    if (selectedKeys.has(key)) return;
    setDraftLayout((current) => [
      ...current,
      { key, span: key === "sleep" ? 2 : 1 },
    ]);

    const nextSelectedKeys = new Set(selectedKeys);
    nextSelectedKeys.add(key);
    const next = metricOptions.find(
      (option) => !nextSelectedKeys.has(option.key),
    )?.key;
    if (next) setPreviewKey(next);
  };

  const renderMetricPreview = (key: HomeOverviewMetricKey) => {
    if (isHomeHealthMetricKey(key)) {
      const card = healthCardsByKey.get(key);
      if (card) {
        return (
          <HealthMetricCard
            card={card}
            referenceDate={healthQuery.data?.endDate}
            locale={locale}
            copy={healthCopy}
            height="h-[220px]"
            appearance="soft"
          />
        );
      }
      return healthQuery.isPending ? (
        <HealthMetricCardLoading
          metricKey={key}
          copy={healthCopy}
          height="h-[220px]"
          appearance="soft"
        />
      ) : (
        <HealthMetricCardEmpty
          metricKey={key}
          copy={healthCopy}
          height="h-[220px]"
          appearance="soft"
        />
      );
    }

    const chartStyle = getDashboardMetricChartStyle(key);
    const policy = getOverviewMetricChartPolicy(key);
    return (
      <OverviewMetricChart
        metricKey={key}
        height="h-[220px]"
        title={metricTitle(key)}
        accentColor={chartStyle.accentColor}
        comparisonColor={chartStyle.comparisonColor}
        titleIcon={chartStyle.icon}
        defaultRangeDays={policy.defaultRangeDays}
        appearance="soft"
      />
    );
  };

  const editLabels = {
    remove: copy.remove,
    expand: copy.expand,
    shrink: copy.shrink,
  };
  const gridClass = "grid grid-cols-1 gap-3 sm:grid-cols-2";

  return (
    <section className="space-y-3" aria-labelledby="home-metrics-overview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2
            id="home-metrics-overview"
            className="text-sm font-semibold text-foreground"
          >
            {copy.title}
          </h2>
          <span className="text-mobile-caption pc:text-xs text-muted-foreground">
            {copy.description}
          </span>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                cancelEditing();
                setAddOpen(false);
              }}
            >
              {copy.cancel}
            </Button>
            <Button type="button" size="sm" onClick={commitDraft}>
              {copy.save}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {copy.add}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={copy.configure}
            title={
              publicDemo.active ? demoText("readOnlyAction") : copy.configure
            }
            disabled={publicDemo.active}
            onClick={() => {
              if (!publicDemo.active) startEditing();
            }}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {isEditing ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) =>
            setActiveDragKey(active.id as HomeOverviewMetricKey)
          }
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragKey(null)}
        >
          <SortableContext
            items={visibleEntries.map(({ item }) => item.key)}
            strategy={rectSortingStrategy}
          >
            <div className={gridClass}>
              {visibleEntries.map((entry) => (
                <SortableHomeOverviewCard
                  key={entry.item.key}
                  item={entry.item}
                  labels={editLabels}
                  onRemove={() =>
                    setDraftLayout((current) =>
                      current.filter((item) => item.key !== entry.item.key),
                    )
                  }
                  onSpanChange={(span) =>
                    setDraftLayout((current) =>
                      current.map((item) =>
                        item.key === entry.item.key ? { ...item, span } : item,
                      ),
                    )
                  }
                >
                  {renderEntry(entry)}
                </SortableHomeOverviewCard>
              ))}
              {visibleEntries.length === 0 ? (
                <div className="col-span-1 rounded-xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground sm:col-span-2">
                  {copy.empty}
                </div>
              ) : null}
            </div>
          </SortableContext>
          <DragOverlay adjustScale={false}>
            {activeDragEntry ? (
              <div className={homeOverviewSpanClass(activeDragEntry.item.span)}>
                {renderEntry(activeDragEntry)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : visibleEntries.length > 0 ? (
        <div className={gridClass}>
          {visibleEntries.map((entry) => (
            <div
              key={entry.item.key}
              className={homeOverviewSpanClass(entry.item.span)}
            >
              {renderEntry(entry)}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
          {copy.empty}
        </div>
      )}

      <AdaptiveDialog open={addOpen} onOpenChange={setAddOpen}>
        <AdaptiveDialogContent
          className="max-h-[calc(100vh-2rem)] max-w-4xl overflow-hidden flex flex-col"
          mobileClassName="max-h-[90vh] overflow-hidden flex flex-col"
        >
          <div className="flex shrink-0 items-start justify-between gap-3">
            <AdaptiveDialogHeader>
              <AdaptiveDialogTitle>{copy.addTitle}</AdaptiveDialogTitle>
              <AdaptiveDialogDescription>
                {copy.addDescription}
              </AdaptiveDialogDescription>
            </AdaptiveDialogHeader>
            <div className="pt-0.5 text-sm text-muted-foreground">
              {draftLayout.length}/{metricOptions.length}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Tabs
              value={previewKey}
              onValueChange={(value) =>
                setPreviewKey(value as HomeOverviewMetricKey)
              }
            >
              <div className="mt-3 space-y-2">
                {metricOptionGroups.map((group) => (
                  <div key={group.group}>
                    <div className="mb-2 text-mobile-caption pc:text-xs text-muted-foreground">
                      {group.title}
                    </div>
                    <TabsList className="w-full justify-start overflow-x-auto">
                      {group.options.map((option) => (
                        <TabsTrigger
                          key={option.key}
                          value={option.key}
                          className="shrink-0"
                          disabled={selectedKeys.has(option.key)}
                        >
                          {option.title}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                {metricOptions.map((option) => {
                  const selected = selectedKeys.has(option.key);
                  return (
                    <TabsContent
                      key={option.key}
                      value={option.key}
                      className="mt-0"
                    >
                      {renderMetricPreview(option.key)}
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          disabled={selected}
                          onClick={() => addMetric(option.key)}
                        >
                          {selected ? copy.added : copy.addAction}
                        </Button>
                      </div>
                    </TabsContent>
                  );
                })}
              </div>
            </Tabs>
          </div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </section>
  );
}
