"use client";

import { useState } from "react";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { resolveDemoCopy } from "@/lib/demo-i18n";

import { metricDemoCopy } from "../copy";
import {
  DEMO_HEART_RATE_ROWS,
  DEMO_HEART_RATE_THRESHOLDS,
  DEMO_HEART_RATE_ZONES,
} from "../demo-fixtures";
import { DemoDurationTable } from "../shared/demo-duration-table";
import { DemoHeartRatePageLayout } from "../shared/demo-page-layouts";
import { DemoIndexedCurveChart } from "../shared/demo-indexed-curve-chart";
import { DemoZonesChart } from "../shared/demo-zones-chart";
import { useDemoFilters } from "../shared/demo-sub-header";
import {
  CHART_SERIES_COLORS,
  HR_CHART_DURATION_KEYS,
  HR_TABLE_DURATION_KEYS,
  type DemoTimeKey,
} from "../shared/demo-types";

export function HeartRateDemoApp({ lang }: { lang: string }) {
  const copy = resolveDemoCopy(metricDemoCopy, lang);
  const filters = useDemoFilters({ sportType: "all" });
  const [activeTab, setActiveTab] = useState("curve");

  const timeLabels = Object.fromEntries(
    copy.timeOptions.map((option) => [option.key, option.label]),
  ) as Record<DemoTimeKey, string>;

  const activeRows = DEMO_HEART_RATE_ROWS.filter((row) =>
    filters.times.includes(row.timeKey),
  );

  const tableSegments = HR_TABLE_DURATION_KEYS.map((key) => ({
    key,
    label:
      copy.heartRate.table[
        key === "5s"
          ? "fiveSeconds"
          : key === "30s"
            ? "thirtySeconds"
            : key === "1m"
              ? "oneMinute"
              : key === "3m"
                ? "threeMinutes"
                : key === "5m"
                  ? "fiveMinutes"
                  : key === "10m"
                    ? "tenMinutes"
                    : key === "20m"
                      ? "twentyMinutes"
                      : key === "60m"
                        ? "sixtyMinutes"
                        : key === "2h"
                          ? "twoHours"
                          : key === "3h"
                            ? "threeHours"
                            : "sixHours"
      ],
  }));

  const chartSegments = HR_CHART_DURATION_KEYS.map((key) => ({
    key,
    label:
      tableSegments.find((segment) => segment.key === key)?.label ?? key,
  }));

  const chartSeries = activeRows.map((row, index) => ({
    key: row.timeKey,
    label: timeLabels[row.timeKey],
    color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]!,
    values: HR_CHART_DURATION_KEYS.map((key) => row[key]),
  }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 md:gap-3">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <DemoHeartRatePageLayout
          activeTab={activeTab}
          sportType={filters.sportType}
          sportOptions={copy.sportOptions}
          onSportChange={filters.setSportType}
          times={filters.times}
          timeOptions={copy.timeOptions}
          onToggleTime={filters.toggleTime}
          tabs={[
            { value: "curve", label: copy.heartRate.tabs.curve },
            { value: "zones", label: copy.heartRate.tabs.zones },
          ]}
        >
          <TabsContent value="curve">
            <div className="grid grid-cols-1 gap-6">
              <DemoDurationTable
                segmentLabels={tableSegments}
                timeLabels={timeLabels}
                rowsByTime={activeRows}
                unit="bpm"
              />
              <DemoIndexedCurveChart
                title={copy.heartRate.chartTitle}
                labels={chartSegments.map((segment) => segment.label)}
                series={chartSeries}
                formatYValue={(value) => `${Math.round(value)} bpm`}
                referenceLines={[
                  {
                    value: DEMO_HEART_RATE_THRESHOLDS.lthr,
                    color: "#ea580c",
                    label: copy.heartRate.lthr,
                  },
                  {
                    value: DEMO_HEART_RATE_THRESHOLDS.maxHeartRate,
                    color: "#dc2626",
                    label: copy.heartRate.maxHr,
                  },
                ]}
                noDataLabel={copy.heartRate.noData}
              />
            </div>
          </TabsContent>
          <TabsContent value="zones">
            <DemoZonesChart
              title={copy.heartRate.zonesTitle}
              rows={DEMO_HEART_RATE_ZONES}
              timeLabels={timeLabels}
              activeTimes={filters.times}
              noDataLabel={copy.heartRate.noData}
            />
          </TabsContent>
        </DemoHeartRatePageLayout>
      </Tabs>
    </div>
  );
}
