"use client";

import { Fragment, useMemo, useState } from "react";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveDemoCopy } from "@/lib/demo-i18n";
import { cn } from "@/lib/utils";

import { metricDemoCopy } from "../copy";
import {
  DEMO_PACE_CS,
  DEMO_PACE_ROWS,
  DEMO_PACE_ZONES,
  formatDurationSec,
  formatPaceSec,
} from "../demo-fixtures";
import { DemoIndexedCurveChart } from "../shared/demo-indexed-curve-chart";
import { DemoPacePageLayout } from "../shared/demo-page-layouts";
import { DemoZonesChart } from "../shared/demo-zones-chart";
import { useDemoFilters } from "../shared/demo-sub-header";
import {
  CHART_SERIES_COLORS,
  PACE_DISTANCE_KEYS,
  type DemoTimeKey,
} from "../shared/demo-types";

export function PaceDemoApp({ lang }: { lang: string }) {
  const copy = resolveDemoCopy(metricDemoCopy, lang);
  const filters = useDemoFilters({ sportType: "RUN" });
  const [activeTab, setActiveTab] = useState("curve");

  const timeLabels = Object.fromEntries(
    copy.timeOptions.map((option) => [option.key, option.label]),
  ) as Record<DemoTimeKey, string>;

  const activeRows = DEMO_PACE_ROWS.filter((row) =>
    filters.times.includes(row.timeKey),
  );

  const distanceLabels = PACE_DISTANCE_KEYS.map((key) => ({
    key,
    label: copy.pace.distances[key],
  }));

  const chartSeries = activeRows.map((row, index) => ({
    key: row.timeKey,
    label: timeLabels[row.timeKey],
    color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]!,
    values: PACE_DISTANCE_KEYS.map((key) => row[key]?.paceSec ?? 0),
  }));

  const csSeries = useMemo(
    () =>
      PACE_DISTANCE_KEYS.map((_, index) =>
        Math.max(60, 120 - index * 6 + DEMO_PACE_CS * 10),
      ),
    [],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 md:gap-3">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <DemoPacePageLayout
          activeTab={activeTab}
          sportType={filters.sportType}
          sportOptions={copy.sportOptions}
          onSportChange={filters.setSportType}
          times={filters.times}
          timeOptions={copy.timeOptions}
          onToggleTime={filters.toggleTime}
          tabs={[
            { value: "curve", label: copy.pace.tabs.curve },
            { value: "zones", label: copy.pace.tabs.zones },
          ]}
        >
          <TabsContent value="curve">
            <div className="grid grid-cols-1 gap-6">
              <div className="relative hidden overflow-hidden rounded-compact border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.pace.table.segment}</TableHead>
                      {activeRows.map((row) => (
                        <TableHead key={row.timeKey} colSpan={2}>
                          {timeLabels[row.timeKey]}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableHead />
                      {activeRows.map((row) => (
                        <Fragment key={row.timeKey}>
                          <TableHead>{copy.pace.table.pace}</TableHead>
                          <TableHead>{copy.pace.table.time}</TableHead>
                        </Fragment>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {distanceLabels.map((distance) => {
                      const paceSecs = activeRows.map((row) => {
                        const cell = row[distance.key];
                        return cell?.paceSec ?? Infinity;
                      });
                      const minPace = Math.min(...paceSecs);

                      return (
                        <TableRow key={distance.key}>
                          <TableCell className="font-medium">
                            {distance.label}
                          </TableCell>
                          {activeRows.map((row) => {
                            const cell = row[distance.key];
                            const isBest =
                              cell &&
                              Number.isFinite(cell.paceSec) &&
                              cell.paceSec === minPace;
                            return (
                              <Fragment key={`${distance.key}-${row.timeKey}`}>
                                <TableCell
                                  className={cn(
                                    "font-mono tabular-nums",
                                    isBest &&
                                      "font-semibold text-emerald-700 dark:text-emerald-300",
                                  )}
                                >
                                  {cell ? formatPaceSec(cell.paceSec) : "--"}
                                </TableCell>
                                <TableCell className="font-mono tabular-nums text-muted-foreground">
                                  {cell
                                    ? formatDurationSec(cell.timeSec)
                                    : "--"}
                                </TableCell>
                              </Fragment>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 md:hidden">
                {distanceLabels.map((distance) => (
                  <Card
                    key={distance.key}
                    className="overflow-hidden rounded-compact"
                  >
                    <CardHeader className="space-y-0 p-3">
                      <CardTitle className="text-sm font-medium">
                        {distance.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="border-t">
                        {activeRows.map((row) => {
                          const cell = row[distance.key];
                          return (
                            <div
                              key={`${distance.key}-${row.timeKey}`}
                              className="flex items-center justify-between gap-3 px-4 py-2"
                            >
                              <span className="text-sm text-muted-foreground">
                                {timeLabels[row.timeKey]}
                              </span>
                              <div className="text-right text-sm font-semibold tabular-nums">
                                {cell ? formatPaceSec(cell.paceSec) : "--"}
                                <div className="text-xs font-normal text-muted-foreground">
                                  {cell
                                    ? formatDurationSec(cell.timeSec)
                                    : "--"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <DemoIndexedCurveChart
                title={copy.pace.chartTitle}
                labels={distanceLabels.map((distance) => distance.label)}
                series={[
                  ...chartSeries,
                  {
                    key: "cs",
                    label: copy.pace.cs,
                    color: "#a78bfa",
                    values: csSeries,
                    dash: [6, 4],
                  },
                ]}
                formatYValue={(value) => formatPaceSec(value)}
                noDataLabel={copy.pace.noData}
              />
            </div>
          </TabsContent>
          <TabsContent value="zones">
            <DemoZonesChart
              title={copy.pace.zonesTitle}
              rows={DEMO_PACE_ZONES}
              timeLabels={timeLabels}
              activeTimes={filters.times}
              noDataLabel={copy.pace.noData}
            />
          </TabsContent>
        </DemoPacePageLayout>
      </Tabs>
    </div>
  );
}
