"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { DemoTimeKey } from "./demo-types";

export function DemoDurationTable({
  segmentLabels,
  timeLabels,
  rowsByTime,
  formatValue,
  unit,
}: {
  segmentLabels: Array<{ key: string; label: string }>;
  timeLabels: Record<DemoTimeKey, string>;
  rowsByTime: Array<Record<string, number | string> & { timeKey: DemoTimeKey }>;
  formatValue?: (value: number) => string;
  unit?: string;
}) {
  const format = formatValue ?? ((value: number) => String(Math.round(value)));

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 md:hidden">
        {segmentLabels.map((segment) => {
          const values = rowsByTime.map((row) => Number(row[segment.key] ?? 0));
          const max = values.reduce(
            (acc, value) =>
              Number.isFinite(value) ? Math.max(acc, value) : acc,
            0,
          );
          const hasMax = Number.isFinite(max) && max > 0;

          return (
            <Card key={segment.key} className="overflow-hidden rounded-compact">
              <CardHeader className="space-y-0 p-3">
                <CardTitle className="text-sm font-medium">
                  {segment.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-t">
                  {rowsByTime.map((row) => {
                    const value = Number(row[segment.key] ?? 0);
                    const isMax =
                      hasMax &&
                      Number.isFinite(value) &&
                      value > 0 &&
                      Math.abs(value - max) < 1e-9;

                    return (
                      <div
                        key={`${segment.key}-${row.timeKey}`}
                        className="flex items-center justify-between gap-3 px-4 py-2"
                      >
                        <div className="min-w-0 truncate text-sm text-muted-foreground">
                          {timeLabels[row.timeKey]}
                        </div>
                        <div
                          className={cn(
                            "shrink-0 font-mono text-sm font-semibold tabular-nums",
                            isMax
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-foreground",
                          )}
                        >
                          {format(value)}
                          {unit ? (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              {unit}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="relative hidden overflow-hidden rounded-compact border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]" />
              {rowsByTime.map((row) => (
                <TableHead key={row.timeKey}>
                  {timeLabels[row.timeKey]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {segmentLabels.map((segment) => {
              const values = rowsByTime.map((row) =>
                Number(row[segment.key] ?? 0),
              );
              const max = values.reduce(
                (acc, value) =>
                  Number.isFinite(value) ? Math.max(acc, value) : acc,
                0,
              );
              const hasMax = Number.isFinite(max) && max > 0;

              return (
                <TableRow key={segment.key}>
                  <TableCell className="font-medium">{segment.label}</TableCell>
                  {rowsByTime.map((row) => {
                    const value = Number(row[segment.key] ?? 0);
                    const isMax =
                      hasMax &&
                      Number.isFinite(value) &&
                      value > 0 &&
                      Math.abs(value - max) < 1e-9;

                    return (
                      <TableCell
                        key={`${segment.key}-${row.timeKey}`}
                        className={cn(
                          "font-mono tabular-nums",
                          isMax
                            ? "font-semibold text-emerald-700 dark:text-emerald-300"
                            : "",
                        )}
                      >
                        {format(value)}
                        {unit ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {unit}
                          </span>
                        ) : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
