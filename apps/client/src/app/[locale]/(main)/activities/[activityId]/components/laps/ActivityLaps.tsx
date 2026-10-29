"use client";

import type { ReactNode } from "react";
import type { ActivityLap } from "@/api/activities";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatBySettings } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { round } from "lodash";
import { useTranslations } from "next-intl";

interface ActivityLapsProps {
  laps: ActivityLap[];
  sportType?: string | null;
}

type DerivedLap = ActivityLap & { cumulativeTime: number };

type LapSummary = {
  index: string;
  timerTime: number;
  distance: number;
  avgSpeed: number;
  avgGradeAdjustedSpeed: number;
  avgHeartRate: number;
  maxHeartRate: number;
  avgPower: number;
  maxPower: number;
  avgCadence: number;
  ascent: number;
  descent: number;
  calories: number;
  avgTemperature: number;
  avgGroundContactTime: number;
  avgStrideLength: number;
  avgVerticalOscillation: number;
  avgVerticalRatio: number;
};

type LapColumn = {
  id: string;
  label: string;
  renderLap: (lap: DerivedLap) => ReactNode;
  renderSummary: (summary: LapSummary) => ReactNode;
  muted?: boolean;
};

type LapColumnGroup =
  | "lap"
  | "pace"
  | "heartRate"
  | "power"
  | "terrain"
  | "dynamics"
  | "other";

const LAP_GROUP_ORDER: LapColumnGroup[] = [
  "lap",
  "pace",
  "heartRate",
  "power",
  "terrain",
  "dynamics",
  "other",
];

export function getLapColumnGroup(columnId: string): LapColumnGroup {
  if (["index", "duration", "distance", "cumulativeTime"].includes(columnId)) {
    return "lap";
  }
  if (["speed", "paceDifference", "gap"].includes(columnId)) return "pace";
  if (["avgHeartRate", "maxHeartRate"].includes(columnId)) return "heartRate";
  if (["avgPower", "maxPower"].includes(columnId)) return "power";
  if (columnId === "elevation") return "terrain";
  if (
    [
      "cadence",
      "stride",
      "stanceTime",
      "verticalOscillation",
      "verticalRatio",
    ].includes(columnId)
  ) {
    return "dynamics";
  }
  return "other";
}

function groupHeaderClass(group: LapColumnGroup) {
  const classes: Record<LapColumnGroup, string> = {
    lap: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    pace: "bg-sky-50 text-sky-800 dark:bg-sky-950/35 dark:text-sky-300",
    heartRate:
      "bg-rose-50 text-rose-800 dark:bg-rose-950/35 dark:text-rose-300",
    power:
      "bg-amber-50 text-amber-800 dark:bg-amber-950/35 dark:text-amber-300",
    terrain:
      "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-300",
    dynamics: "bg-teal-50 text-teal-800 dark:bg-teal-950/35 dark:text-teal-300",
    other:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400",
  };
  return classes[group];
}

function groupValueClass(group: LapColumnGroup) {
  const classes: Record<LapColumnGroup, string> = {
    lap: "",
    pace: "text-sky-800 dark:text-sky-300",
    heartRate: "text-rose-800 dark:text-rose-300",
    power: "text-amber-800 dark:text-amber-300",
    terrain: "text-emerald-800 dark:text-emerald-300",
    dynamics: "text-teal-800 dark:text-teal-300",
    other: "text-muted-foreground",
  };
  return classes[group];
}

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const formatStrideLength = (value: number | undefined) =>
  positive(value) ? `${round((value ?? 0) / 1000, 2)} m` : "-";

type FormattableMetric = NonNullable<Parameters<typeof formatBySettings>[1]>;

const metricCell = (value: number | undefined, metric: FormattableMetric) =>
  positive(value) ? formatBySettings(value ?? 0, metric) : "-";

export const ActivityLaps = ({ laps, sportType }: ActivityLapsProps) => {
  const t = useTranslations("ActivityLaps");
  const groupLabel = (group: LapColumnGroup) => t(`groups.${group}`);
  if (!laps.length) {
    return (
      <Card className="w-full">
        <CardContent className="flex h-40 items-center justify-center text-muted-foreground">
          {t("empty")}
        </CardContent>
      </Card>
    );
  }

  const isRun = sportType === "RUN";
  const sortedLaps = [...laps].sort((a, b) => (a.index || 0) - (b.index || 0));
  let currentCumulative = 0;
  const lapsWithDerivedData: DerivedLap[] = sortedLaps.map((lap) => {
    currentCumulative += lap.timerTime || 0;
    return { ...lap, cumulativeTime: currentCumulative };
  });

  const count = laps.length;
  const totalDuration = laps.reduce(
    (sum, lap) => sum + (lap.timerTime || 0),
    0,
  );
  const totalDistance = laps.reduce((sum, lap) => sum + (lap.distance || 0), 0);
  const weightedAverage = (key: keyof ActivityLap) => {
    if (totalDuration === 0) return 0;
    return (
      laps.reduce(
        (sum, lap) =>
          sum + ((lap[key] as number | undefined) ?? 0) * (lap.timerTime || 0),
        0,
      ) / totalDuration
    );
  };
  const average = (key: keyof ActivityLap) =>
    laps.reduce(
      (sum, lap) => sum + ((lap[key] as number | undefined) ?? 0),
      0,
    ) / count;

  const summary: LapSummary = {
    index: t("summary.average"),
    timerTime: totalDuration / count,
    distance: totalDistance / count,
    avgSpeed: totalDuration > 0 ? totalDistance / totalDuration : 0,
    avgGradeAdjustedSpeed: weightedAverage("avgGradeAdjustedSpeed"),
    avgHeartRate: weightedAverage("avgHeartRate"),
    maxHeartRate: Math.max(...laps.map((lap) => lap.maxHeartRate || 0)),
    avgPower: weightedAverage("avgPower"),
    maxPower: Math.max(...laps.map((lap) => lap.maxPower || 0)),
    avgCadence: weightedAverage("avgCadence"),
    ascent: average("ascent"),
    descent: average("descent"),
    calories: average("calories"),
    avgTemperature: weightedAverage("avgTemperature"),
    avgGroundContactTime: weightedAverage("avgGroundContactTime"),
    avgStrideLength: weightedAverage("avgStrideLength"),
    avgVerticalOscillation: weightedAverage("avgVerticalOscillation"),
    avgVerticalRatio: weightedAverage("avgVerticalRatio"),
  };

  const has = (key: keyof ActivityLap) =>
    laps.some((lap) => positive(lap[key]));
  const paceDifference = (lap: ActivityLap) => {
    const lapSpeed = lap.avgSpeed || 0;
    if (!lapSpeed || !summary.avgSpeed) return "-";
    const difference = 1000 / lapSpeed - 1000 / summary.avgSpeed;
    const absolute = Math.abs(difference);
    return `${difference > 0 ? "+" : "-"}${Math.floor(absolute / 60)}:${Math.round(
      absolute % 60,
    )
      .toString()
      .padStart(2, "0")}`;
  };

  const rawColumns: LapColumn[] = [
    {
      id: "index",
      label: t("columns.lap"),
      renderLap: (lap) => lap.index,
      renderSummary: (value) => value.index,
    },
    {
      id: "duration",
      label: t("columns.duration"),
      renderLap: (lap) => formatBySettings(lap.timerTime || 0, "duration"),
      renderSummary: (value) => formatBySettings(value.timerTime, "duration"),
    },
    ...(has("distance")
      ? [
          {
            id: "distance",
            label: t("columns.distance"),
            renderLap: (lap: DerivedLap) =>
              formatBySettings(lap.distance || 0, "distance"),
            renderSummary: (value: LapSummary) =>
              formatBySettings(value.distance, "distance"),
          },
        ]
      : []),
    {
      id: "cumulativeTime",
      label: t("columns.cumulativeTime"),
      muted: true,
      renderLap: (lap) => formatBySettings(lap.cumulativeTime, "duration"),
      renderSummary: () => "-",
    },
    ...(has("avgSpeed")
      ? [
          {
            id: "speed",
            label: isRun ? t("columns.pace") : t("columns.speed"),
            renderLap: (lap: DerivedLap) =>
              formatBySettings(lap.avgSpeed || 0, "speed"),
            renderSummary: (value: LapSummary) =>
              formatBySettings(value.avgSpeed, "speed"),
          },
          ...(isRun
            ? [
                {
                  id: "paceDifference",
                  label: t("columns.difference"),
                  muted: true,
                  renderLap: (lap: DerivedLap) => paceDifference(lap),
                  renderSummary: () => "-",
                },
              ]
            : []),
        ]
      : []),
    ...(isRun && has("avgGradeAdjustedSpeed")
      ? [
          {
            id: "gap",
            label: "GAP",
            muted: true,
            renderLap: (lap: DerivedLap) =>
              metricCell(lap.avgGradeAdjustedSpeed, "speed"),
            renderSummary: (value: LapSummary) =>
              metricCell(value.avgGradeAdjustedSpeed, "speed"),
          },
        ]
      : []),
    ...(has("avgHeartRate")
      ? [
          {
            id: "avgHeartRate",
            label: t("columns.avgHeartRate"),
            renderLap: (lap: DerivedLap) =>
              metricCell(lap.avgHeartRate, "heartRate"),
            renderSummary: (value: LapSummary) =>
              metricCell(value.avgHeartRate, "heartRate"),
          },
        ]
      : []),
    ...(has("maxHeartRate")
      ? [
          {
            id: "maxHeartRate",
            label: t("columns.maxHeartRate"),
            renderLap: (lap: DerivedLap) =>
              metricCell(lap.maxHeartRate, "heartRate"),
            renderSummary: (value: LapSummary) =>
              metricCell(value.maxHeartRate, "heartRate"),
          },
        ]
      : []),
    ...(has("avgPower")
      ? [
          {
            id: "avgPower",
            label: t("columns.avgPower"),
            renderLap: (lap: DerivedLap) => metricCell(lap.avgPower, "power"),
            renderSummary: (value: LapSummary) =>
              metricCell(value.avgPower, "power"),
          },
        ]
      : []),
    ...(has("maxPower")
      ? [
          {
            id: "maxPower",
            label: t("columns.maxPower"),
            renderLap: (lap: DerivedLap) => metricCell(lap.maxPower, "power"),
            renderSummary: (value: LapSummary) =>
              metricCell(value.maxPower, "power"),
          },
        ]
      : []),
    ...(has("ascent") || has("descent")
      ? [
          {
            id: "elevation",
            label: t("columns.elevation"),
            muted: true,
            renderLap: (lap: DerivedLap) =>
              `${metricCell(lap.ascent, "elevation")} / ${metricCell(
                lap.descent,
                "elevation",
              )}`,
            renderSummary: (value: LapSummary) =>
              `${metricCell(value.ascent, "elevation")} / ${metricCell(
                value.descent,
                "elevation",
              )}`,
          },
        ]
      : []),
    ...(has("calories")
      ? [
          {
            id: "calories",
            label: t("columns.calories"),
            muted: true,
            renderLap: (lap: DerivedLap) => Math.round(lap.calories || 0),
            renderSummary: (value: LapSummary) => Math.round(value.calories),
          },
        ]
      : []),
    ...(has("avgCadence")
      ? [
          {
            id: "cadence",
            label: isRun ? t("columns.avgRunCadence") : t("columns.avgCadence"),
            renderLap: (lap: DerivedLap) =>
              metricCell(lap.avgCadence, "cadence"),
            renderSummary: (value: LapSummary) =>
              metricCell(value.avgCadence, "cadence"),
          },
        ]
      : []),
    ...(isRun && has("avgStrideLength")
      ? [
          {
            id: "stride",
            label: t("columns.avgStrideLength"),
            muted: true,
            renderLap: (lap: DerivedLap) =>
              formatStrideLength(lap.avgStrideLength),
            renderSummary: (value: LapSummary) =>
              formatStrideLength(value.avgStrideLength),
          },
        ]
      : []),
    ...(isRun && has("avgGroundContactTime")
      ? [
          {
            id: "stanceTime",
            label: t("columns.avgGroundContactTime"),
            muted: true,
            renderLap: (lap: DerivedLap) =>
              `${Math.round(lap.avgGroundContactTime || 0)} ms`,
            renderSummary: (value: LapSummary) =>
              `${Math.round(value.avgGroundContactTime)} ms`,
          },
        ]
      : []),
    ...(isRun && has("avgVerticalOscillation")
      ? [
          {
            id: "verticalOscillation",
            label: t("columns.avgVerticalOscillation"),
            muted: true,
            renderLap: (lap: DerivedLap) =>
              `${round((lap.avgVerticalOscillation || 0) / 10, 1)} cm`,
            renderSummary: (value: LapSummary) =>
              `${round(value.avgVerticalOscillation / 10, 1)} cm`,
          },
        ]
      : []),
    ...(isRun && has("avgVerticalRatio")
      ? [
          {
            id: "verticalRatio",
            label: t("columns.avgVerticalRatio"),
            muted: true,
            renderLap: (lap: DerivedLap) =>
              positive(lap.avgVerticalRatio)
                ? `${round(lap.avgVerticalRatio ?? 0, 1)}%`
                : "-",
            renderSummary: (value: LapSummary) =>
              `${round(value.avgVerticalRatio, 1)}%`,
          },
        ]
      : []),
    ...(has("avgTemperature")
      ? [
          {
            id: "temperature",
            label: t("columns.temperature"),
            muted: true,
            renderLap: (lap: DerivedLap) =>
              `${Math.round(lap.avgTemperature || 0)}°C`,
            renderSummary: (value: LapSummary) =>
              `${Math.round(value.avgTemperature)}°C`,
          },
        ]
      : []),
  ];

  const columns = rawColumns.toSorted(
    (a, b) =>
      LAP_GROUP_ORDER.indexOf(getLapColumnGroup(a.id)) -
      LAP_GROUP_ORDER.indexOf(getLapColumnGroup(b.id)),
  );
  const groups = columns.reduce<
    Array<{ id: LapColumnGroup; columnCount: number }>
  >((result, column) => {
    const id = getLapColumnGroup(column.id);
    const current = result.at(-1);
    if (current?.id === id) current.columnCount += 1;
    else result.push({ id, columnCount: 1 });
    return result;
  }, []);
  const isGroupStart = (index: number) =>
    index === 0 ||
    getLapColumnGroup(columns[index - 1].id) !==
      getLapColumnGroup(columns[index].id);

  return (
    <Card className="w-full overflow-hidden">
      <div className="overflow-x-auto rounded-md border-none">
        <Table>
          <TableHeader>
            <TableRow>
              {groups.map((group) => (
                <TableHead
                  key={group.id}
                  colSpan={group.columnCount}
                  className={cn(
                    "h-8 border-b border-border px-4 text-center text-[11px] font-semibold tracking-wide",
                    groupHeaderClass(group.id),
                  )}
                >
                  {groupLabel(group.id)}
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="hover:bg-transparent">
              {columns.map((column, index) => {
                const group = getLapColumnGroup(column.id);
                return (
                  <TableHead
                    key={column.id}
                    className={cn(
                      "h-11 whitespace-nowrap px-4 text-right font-semibold first:text-center",
                      groupHeaderClass(group),
                      isGroupStart(index) &&
                        index > 0 &&
                        "border-l border-border",
                    )}
                  >
                    {column.label}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lapsWithDerivedData.map((lap) => (
              <TableRow
                key={lap.id}
                className="hover:bg-neutral-100 dark:hover:bg-muted/70"
              >
                {columns.map((column, index) => {
                  const group = getLapColumnGroup(column.id);
                  return (
                    <TableCell
                      key={column.id}
                      className={cn(
                        "whitespace-nowrap px-4 py-4 text-right font-mono first:text-center first:font-medium",
                        groupValueClass(group),
                        column.muted && "opacity-75",
                        isGroupStart(index) &&
                          index > 0 &&
                          "border-l border-border/70",
                      )}
                    >
                      {column.renderLap(lap)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="bg-neutral-100 font-bold dark:bg-muted/45">
            <TableRow>
              {columns.map((column, index) => {
                const group = getLapColumnGroup(column.id);
                return (
                  <TableCell
                    key={column.id}
                    className={cn(
                      "whitespace-nowrap px-4 py-4 text-right font-mono first:text-center",
                      groupValueClass(group),
                      column.muted && "opacity-75",
                      isGroupStart(index) &&
                        index > 0 &&
                        "border-l border-border",
                    )}
                  >
                    {column.renderSummary(summary)}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </Card>
  );
};
