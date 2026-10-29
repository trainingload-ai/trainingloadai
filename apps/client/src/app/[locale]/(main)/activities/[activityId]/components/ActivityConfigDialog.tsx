"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useActivityConfig, PowerConfig } from "@/hooks/useActivityConfig";
import { useActivityDataChartConfig } from "@/hooks/useActivityDataChartConfig";
import { useActivityId } from "@/hooks/useActivityId";
import { useGetActivity } from "@/hooks/useActivities";
import { getMetricColor } from "@/lib/chart-data-utils";
import {
  getActivityDataChartsForSport,
  getVisibleActivityDataCharts,
  isActivityDataChartEnabled,
  type ActivityDataChartId,
  type ActivityDataChartDefinition,
} from "@/lib/activity-data-charts";
import {
  getActivityOverviewMetricsForSport,
  getVisibleActivityOverviewMetrics,
  isActivityOverviewMetricEnabled,
  type ActivityOverviewMetricDefinition,
} from "@/lib/activity-overview-metrics";
import OverviewMetricChart from "./charts/overview-metric-chart";
import { OverviewElevationChart } from "./charts/elevation-chart";
import OverviewPaceChart from "./charts/pace-chart";
import OverviewCadenceChart from "./charts/cadence-chart";
import OverviewStrideChart from "./charts/stride-chart";
import OverviewHeartRateChart from "./charts/heart-rate-chart";
import OverviewPowerChart from "./charts/power-chart";
import OverviewStanceTimeChart from "./charts/stance-time-chart";
import {
  isActivityDataChartAllowed,
  isActivityOverviewMetricVisible,
} from "@/lib/activity-detail-policy";
import { useActivityMetricAvailability } from "@/api/useActivityMetric";

export type ActivityConfigTab =
  | "overview"
  | "dataCharts"
  | "lap"
  | "heartrate"
  | "power";

const DEFAULT_TABS: ActivityConfigTab[] = ["overview", "dataCharts", "power"];

const tabsListColsClass: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

function CompactChartPreview({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[210px] overflow-hidden rounded-md border border-border/70 bg-background">
      <div className="w-[145%] origin-top-left scale-[0.69]">
        {children}
      </div>
    </div>
  );
}

interface ActivityConfigDialogProps {
  defaultTab?: ActivityConfigTab;
  tabs?: ActivityConfigTab[];
}

export function ActivityConfigDialog({
  defaultTab = "overview",
  tabs = DEFAULT_TABS,
}: ActivityConfigDialogProps) {
  const t = useTranslations("ActivityPowerPage");
  const tOverview = useTranslations("Overview");
  const tCommon = useTranslations("ActivityDetail");
  const tDashboardOverview = useTranslations("dashboard.overview");
  const tElevation = useTranslations("ElevationChart");
  const tPace = useTranslations("PaceChart");
  const tCadence = useTranslations("CadenceChart");
  const tStride = useTranslations("StrideChart");
  const tHeartRate = useTranslations("HeartRateChart");
  const tPower = useTranslations("PowerChart");
  const tStanceTime = useTranslations("StanceTimeChart");
  const activityId = useActivityId();
  const { data: activity } = useGetActivity(activityId || "");
  const { config, togglePowerMetric, toggleOverviewMetric, isMounted } =
    useActivityConfig();
  const {
    charts: dataChartConfig,
    toggleDataChart,
    isMounted: isDataChartMounted,
  } = useActivityDataChartConfig();
  const activeTabs = tabs.length > 0 ? tabs : DEFAULT_TABS;
  const resolvedDefaultTab = activeTabs.includes(defaultTab)
    ? defaultTab
    : activeTabs[0];
  const overviewMetrics = getActivityOverviewMetricsForSport(
    activity?.sportType,
  ).filter((metric) =>
    isActivityOverviewMetricVisible(activity, metric.id),
  );
  const visibleOverviewMetrics = getVisibleActivityOverviewMetrics(
    activity?.sportType,
    config.overview,
  ).filter((metric) =>
    isActivityOverviewMetricVisible(activity, metric.id),
  );
  const candidateDataCharts = activeTabs.includes("dataCharts")
    ? getActivityDataChartsForSport(activity?.sportType).filter((chart) =>
        isActivityDataChartAllowed(activity, chart.id),
      )
    : [];
  const { availableMetrics, isLoading: isChartAvailabilityLoading } =
    useActivityMetricAvailability(
      activityId || "",
      candidateDataCharts.map((chart) => chart.metric),
    );
  const dataCharts = candidateDataCharts.filter((chart) =>
    availableMetrics.has(chart.metric),
  );
  const visibleDataCharts = getVisibleActivityDataCharts(
    activity?.sportType,
    dataChartConfig,
  ).filter(
    (chart) =>
      isActivityDataChartAllowed(activity, chart.id) &&
      availableMetrics.has(chart.metric),
  );
  const [overviewMetricTab, setOverviewMetricTab] = React.useState("");
  const [dataChartTab, setDataChartTab] = React.useState("");

  React.useEffect(() => {
    if (!overviewMetrics.length) return;
    if (overviewMetrics.some((metric) => metric.id === overviewMetricTab)) {
      return;
    }
    setOverviewMetricTab(overviewMetrics[0].id);
  }, [overviewMetricTab, overviewMetrics]);

  React.useEffect(() => {
    if (!dataCharts.length) return;
    if (dataCharts.some((chart) => chart.id === dataChartTab)) return;
    setDataChartTab(dataCharts[0].id);
  }, [dataChartTab, dataCharts]);

  const getDataChartLabel = (chart: ActivityDataChartDefinition) => {
    switch (chart.labelNamespace) {
      case "ElevationChart":
        return tElevation("title");
      case "PaceChart":
        return tPace("title");
      case "CadenceChart":
        return tCadence("title");
      case "StrideChart":
        return tStride("title");
      case "HeartRateChart":
        return tHeartRate("title");
      case "PowerChart":
        return tPower("title");
      case "StanceTimeChart":
        return tStanceTime("title");
    }
  };

  const getOverviewMetricLabel = (
    metric: ActivityOverviewMetricDefinition,
  ) => tOverview(`stats.${metric.labelKey}`);

  const renderDataChartPreview = (chartId: ActivityDataChartId) => {
    const resolvedActivityId = activityId || "";

    switch (chartId) {
      case "elevation":
        return <OverviewElevationChart activityId={resolvedActivityId} />;
      case "pace":
        return <OverviewPaceChart activityId={resolvedActivityId} />;
      case "cadence":
        return <OverviewCadenceChart activityId={resolvedActivityId} />;
      case "stride":
        return <OverviewStrideChart activityId={resolvedActivityId} />;
      case "heartRate":
        return <OverviewHeartRateChart activityId={resolvedActivityId} />;
      case "power":
        return <OverviewPowerChart activityId={resolvedActivityId} />;
      case "stanceTime":
        return <OverviewStanceTimeChart activityId={resolvedActivityId} />;
    }
  };

  const renderSelectionAction = ({
    selected,
    disabled,
    onClick,
  }: {
    selected: boolean;
    disabled: boolean;
    onClick: () => void;
  }) => (
    <div className="mt-3 flex items-center justify-between gap-3">
      <div className="text-mobile-caption pc:text-xs text-muted-foreground">
        {selected ? tDashboardOverview("added") : tDashboardOverview("add")}
      </div>
      <Button
        size="sm"
        variant={selected ? "outline" : "default"}
        disabled={disabled}
        onClick={onClick}
      >
        {selected ? tDashboardOverview("remove") : tDashboardOverview("add")}
      </Button>
    </div>
  );

  // Metrics list for Power
  const powerMetrics: { key: keyof PowerConfig; label: string }[] = [
    { key: "avgPower", label: t("basicStats.avgPower") },
    { key: "maxPower", label: t("basicStats.maxPower") },
    { key: "normalizedPower", label: t("basicStats.normalizedPower") },
    { key: "xPower", label: "xPower" },
    { key: "trainingStressScore", label: t("basicStats.trainingStressScore") },
    { key: "etss", label: "BikeScore" },
    { key: "intensityFactor", label: t("basicStats.intensityFactor") },
    { key: "relativeIntensity", label: t("basicStats.relativeIntensity") },
    { key: "variabilityIndex", label: t("basicStats.variabilityIndex") },
    {
      key: "variabilityIndexSkiba",
      label: `${t("basicStats.variabilityIndex")} (Skiba)`,
    },
    { key: "powerWeightRatio", label: t("basicStats.powerWeightRatio") },
    { key: "ftp", label: "FTP" },
    { key: "cp", label: "CP" },
    { key: "efficiencyFactor", label: t("basicStats.efficiencyFactor") },
    { key: "powerHeartRateRatio", label: t("basicStats.powerHeartRateRatio") },
  ];

  if (!isMounted || !isDataChartMounted || isChartAvailabilityLoading) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled
        aria-label={tCommon("configuration")}
        title={tCommon("configuration")}
      >
        <Settings className="h-4 w-4" />
      </Button>
    );
  }

  if (
    activeTabs.every(
      (tab) =>
        (tab !== "overview" || overviewMetrics.length === 0) &&
        (tab !== "dataCharts" || dataCharts.length === 0) &&
        tab !== "power",
    )
  ) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label={tCommon("configuration")}
          title={tCommon("configuration")}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[82vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            {tCommon("configuration") || "Configuration"}
          </DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue={resolvedDefaultTab}
          className="flex-1 overflow-hidden flex flex-col"
        >
          {activeTabs.length > 1 ? (
            <TabsList
              className={`grid w-full ${tabsListColsClass[activeTabs.length] ?? "grid-cols-3"}`}
            >
              {activeTabs.map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  disabled={tab === "lap" || tab === "heartrate"}
                >
                  {tab === "overview"
                    ? tCommon("tabs.overview")
                    : tab === "dataCharts"
                      ? tCommon("dataCharts")
                      : tab === "power"
                        ? tCommon("tabs.power")
                        : tCommon(`tabs.${tab}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}

          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="overview" className="mt-0">
              <Tabs value={overviewMetricTab} onValueChange={setOverviewMetricTab}>
                <TabsList className="w-full justify-start overflow-x-auto">
                  {overviewMetrics.map((metric) => {
                    const selected = isActivityOverviewMetricEnabled(
                      config.overview,
                      activity?.sportType,
                      metric.id,
                    );
                    return (
                      <TabsTrigger
                        key={metric.id}
                        value={metric.id}
                        className="shrink-0 gap-2"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-micro"
                          style={{ backgroundColor: getMetricColor(metric.metric) }}
                        />
                        {getOverviewMetricLabel(metric)}
                        {selected ? " ✓" : ""}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                <div className="mt-3">
                  {overviewMetrics.map((metric) => {
                    const selected = isActivityOverviewMetricEnabled(
                      config.overview,
                      activity?.sportType,
                      metric.id,
                    );
                    const disableRemove =
                      selected && visibleOverviewMetrics.length <= 1;

                    return (
                      <TabsContent
                        key={metric.id}
                        value={metric.id}
                        className="mt-0"
                      >
                        <CompactChartPreview>
                          <OverviewMetricChart metricId={metric.id} />
                        </CompactChartPreview>
                        {renderSelectionAction({
                          selected,
                          disabled: disableRemove,
                          onClick: () =>
                            toggleOverviewMetric(activity?.sportType, metric.id),
                        })}
                      </TabsContent>
                    );
                  })}
                </div>
              </Tabs>
            </TabsContent>

            <TabsContent value="dataCharts" className="mt-0">
              <Tabs value={dataChartTab} onValueChange={setDataChartTab}>
                <TabsList className="w-full justify-start overflow-x-auto">
                  {dataCharts.map((chart) => {
                    const selected = isActivityDataChartEnabled(
                      dataChartConfig,
                      activity?.sportType,
                      chart.id,
                    );
                    return (
                      <TabsTrigger
                        key={chart.id}
                        value={chart.id}
                        className="shrink-0 gap-2"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-micro"
                          style={{
                            backgroundColor: getMetricColor(chart.colorMetric),
                          }}
                        />
                        {getDataChartLabel(chart)}
                        {selected ? " ✓" : ""}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                <div className="mt-3">
                  {dataCharts.map((chart) => {
                    const selected = isActivityDataChartEnabled(
                      dataChartConfig,
                      activity?.sportType,
                      chart.id,
                    );
                    const disableRemove =
                      selected && visibleDataCharts.length <= 1;

                    return (
                      <TabsContent
                        key={chart.id}
                        value={chart.id}
                        className="mt-0"
                      >
                        <CompactChartPreview>
                          {renderDataChartPreview(chart.id)}
                        </CompactChartPreview>
                        {renderSelectionAction({
                          selected,
                          disabled: disableRemove,
                          onClick: () =>
                            toggleDataChart(activity?.sportType, chart.id),
                        })}
                      </TabsContent>
                    );
                  })}
                </div>
              </Tabs>
            </TabsContent>

            <TabsContent value="power" className="mt-0 space-y-1">
              {powerMetrics.map((metric) => (
                <Item key={metric.key} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>
                      <Label
                        htmlFor={`power-${metric.key}`}
                        className="cursor-pointer font-normal"
                      >
                        {metric.label}
                      </Label>
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      id={`power-${metric.key}`}
                      checked={config.power[metric.key]}
                      onCheckedChange={() => togglePowerMetric(metric.key)}
                    />
                  </ItemActions>
                </Item>
              ))}
            </TabsContent>

            {/* Placeholders for other tabs */}
            <TabsContent value="lap">
              <div className="p-4 text-center text-muted-foreground">
                Coming soon...
              </div>
            </TabsContent>
            <TabsContent value="heartrate">
              <div className="p-4 text-center text-muted-foreground">
                Coming soon...
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
