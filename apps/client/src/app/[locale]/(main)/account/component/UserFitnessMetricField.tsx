"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PaceInput } from "@/components/ui/pace-input";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarSelect } from "@/components/calendar-select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Plus, Trash2 } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  getUserEstimatedFitnessMetric,
  getUserFitnessMetricEffectiveHistory,
  useUserFitnessMetricPairs,
  replaceUserFitnessMetricManualHistory,
  type UserFitnessMetricType,
  type UserProfile,
} from "@/api/settings";
import { queryKeys } from "@/lib/query-keys";
import { SportType } from "@/api/activities";
import { MetricTileButton } from "./MetricTileButton";
import { settingsDialogDesktopClassName } from "@/components/ui/dialog-sizes";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import {
  type MetricHistoryRow,
  KNOWN_METRIC_SOURCE_LABEL_KEYS,
  formatMetricDateInput,
  formatPaceSeconds,
  getDefaultMetricEffectiveDate,
  mapFitnessMetricEffectiveRows,
  metricSourceLabelKey,
  normalizeMetricNumber,
  parseMetricDateInput,
} from "./user-profile-metric-model";

type ActiveSport = "DEFAULT" | SportType;

export function UserFitnessMetricField({
  activeSport,
  label,
  profileType,
  type,
  value,
}: {
  activeSport: ActiveSport;
  label: string;
  profileType: UserProfile["type"] | undefined;
  type: UserFitnessMetricType;
  value: number | undefined;
}) {
  const t = useTranslations("UserProfile");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sportType: SportType =
    activeSport === "DEFAULT"
      ? ((profileType as SportType | undefined) ?? SportType.UNKNOWN)
      : activeSport;

  const isPaceMetric = type === "CS" || type === "TP";
  const { data: metricPairs } = useUserFitnessMetricPairs(sportType);

  const {
    data: estimatedValue = null,
    isFetching: isFetchingPair,
    refetch: refetchEstimatedValue,
  } = useQuery({
    queryKey: queryKeys.user.fitnessMetricDialog(type, sportType),
    queryFn: () => getUserEstimatedFitnessMetric(type, sportType),
    enabled: !publicDemo.active,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const { data: effectiveHistory, isFetching: isFetchingHistory } = useQuery({
    queryKey: queryKeys.user.fitnessMetricEffectiveHistory(type, sportType),
    queryFn: () => getUserFitnessMetricEffectiveHistory(type, sportType),
    enabled: open && !publicDemo.active,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const [rows, setRows] = useState<MetricHistoryRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(mapFitnessMetricEffectiveRows(effectiveHistory));
  }, [open, effectiveHistory]);

  const validateRows = (workingRows: MetricHistoryRow[]) => {
    for (let i = 0; i < workingRows.length; i += 1) {
      const row = workingRows[i];
      if (row.editable === false) continue;
      const effective = String(row.effectiveDate ?? "").trim();
      if (!effective) {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowEffectiveDateRequired", {
            row: i + 1,
          }),
        };
      }
      if (!parseMetricDateInput(effective)) {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowEffectiveDateInvalid", {
            row: i + 1,
          }),
        };
      }
      const raw = String(row.value ?? "").trim();
      if (!raw) {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowValueRequired", {
            row: i + 1,
          }),
        };
      }
      const numericValue = Number.parseFloat(raw);
      if (!Number.isFinite(numericValue)) {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowNumberRequired", {
            row: i + 1,
          }),
        };
      }
      if (numericValue <= 0) {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowPositiveRequired", {
            row: i + 1,
          }),
        };
      }
    }

    return { ok: true as const };
  };

  const hasIncompleteRow = rows.length > 0 && validateRows(rows).ok === false;
  const canAddRow = !isFetchingHistory && !hasIncompleteRow;

  const addRow = () => {
    if (publicDemo.active || isFetchingHistory) return;
    if (hasIncompleteRow) {
      toast.error(t("historyTable.validation.completeRowFirst"));
      return;
    }

    const defaultEffectiveDate = getDefaultMetricEffectiveDate(rows.length > 0);
    setRows((prev) => [
      ...prev,
      { effectiveDate: defaultEffectiveDate, value: "" },
    ]);
  };

  const updateRow = (index: number, patch: Partial<MetricHistoryRow>) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const sourceLabel = (row: MetricHistoryRow) => {
    const key = metricSourceLabelKey(row.sourceInfo, row.source);
    if (KNOWN_METRIC_SOURCE_LABEL_KEYS.has(key)) {
      return t(`historyTable.sourceLabels.${key}`);
    }
    return key || t("historyTable.sourceLabels.unknown");
  };

  const save = async (nextRows?: MetricHistoryRow[]) => {
    if (publicDemo.active || isSaving) return;
    const workingRows = nextRows ?? rows;
    const validated = validateRows(workingRows);
    if (!validated.ok) {
      toast.error(validated.message);
      return;
    }

    const metrics = workingRows
      .filter((row) => row.editable !== false)
      .map((row) => ({
        effectiveDate: String(row.effectiveDate).trim(),
        value: String(row.value).trim(),
      }))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

    try {
      setIsSaving(true);
      await replaceUserFitnessMetricManualHistory(type, metrics, sportType);
      queryClient.invalidateQueries({ queryKey: queryKeys.root.userProfile });
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.fitnessMetricPairs(sportType),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.fitnessMetricDialog(type, sportType),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.fitnessMetricEffectiveHistory(type, sportType),
      });
      toast.success(t("updateSuccess"));
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const applyEstimate = async () => {
    if (publicDemo.active) return;
    const latestEstimate = await refetchEstimatedValue();
    if (!latestEstimate.isSuccess) return;
    const normalizedEstimate = normalizeMetricNumber(latestEstimate.data);
    if (!normalizedEstimate || normalizedEstimate <= 0) return;

    const now = dayjs().toDate();
    const effectiveDate = Number.isFinite(now.getTime())
      ? now.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const entries = new Map<string, string>();
    for (const row of rows) {
      if (row.editable === false) continue;
      entries.set(String(row.effectiveDate).trim(), String(row.value).trim());
    }
    entries.set(effectiveDate, String(normalizedEstimate));

    const nextRows = Array.from(entries.entries())
      .map(([date, nextValue]) => ({ effectiveDate: date, value: nextValue }))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

    await save(nextRows);
  };

  const displayedCurrent = (() => {
    const effectiveValue =
      metricPairs?.effective?.[type] === null ||
      metricPairs?.effective?.[type] === undefined
        ? null
        : Number(metricPairs.effective[type]);
    const normalizedValue = normalizeMetricNumber(
      effectiveValue && effectiveValue > 0 ? effectiveValue : value,
    );
    if (normalizedValue === null || normalizedValue <= 0) return "";
    return isPaceMetric
      ? formatPaceSeconds(normalizedValue)
      : String(normalizedValue);
  })();

  const displayedEstimated = (() => {
    const normalizedEstimate = normalizeMetricNumber(estimatedValue);
    if (normalizedEstimate === null || normalizedEstimate <= 0) return "";
    return isPaceMetric
      ? formatPaceSeconds(normalizedEstimate)
      : String(normalizedEstimate);
  })();

  const estimateDelta = (() => {
    const normalizedValue = normalizeMetricNumber(value);
    const normalizedEstimate = normalizeMetricNumber(estimatedValue);
    if (
      normalizedValue === null ||
      normalizedEstimate === null ||
      normalizedValue <= 0 ||
      normalizedEstimate <= 0
    ) {
      return null;
    }
    return normalizedEstimate - normalizedValue;
  })();

  const estimateSecondary = (() => {
    if (!displayedEstimated) return null;
    if (!estimateDelta || Math.abs(estimateDelta) < 1e-6) {
      return (
        <span className="text-muted-foreground">{displayedEstimated}</span>
      );
    }
    const isUp = estimateDelta > 0;
    return (
      <span
        className={
          isUp
            ? "inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"
            : "inline-flex items-center gap-0.5 text-red-600 dark:text-red-400"
        }
      >
        {displayedEstimated}
        {isUp ? (
          <ArrowUp className="h-2.5 w-2.5" />
        ) : (
          <ArrowDown className="h-2.5 w-2.5" />
        )}
      </span>
    );
  })();

  return (
    <AdaptiveDialog open={open} onOpenChange={setOpen}>
      <AdaptiveDialogTrigger asChild>
        <MetricTileButton
          title={label}
          value={displayedCurrent || "-"}
          secondaryValue={estimateSecondary}
          secondaryValueClassName="text-mobile-unit pc:text-[10px] leading-tight"
          secondaryValuePlacement="bottom-right"
          mutedValue={!displayedCurrent}
          tabularValue
          disabled={publicDemo.active}
          disabledReason={
            publicDemo.active ? demoText("readOnlyAction") : undefined
          }
        />
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent desktopClassName={settingsDialogDesktopClassName}>
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle className="text-base font-semibold">
            {label}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="text-mobile-caption pc:text-xs text-muted-foreground">
            {sportType === SportType.RUN ||
            sportType === SportType.CYCLING ||
            sportType === SportType.SWIM
              ? t("fitnessMetricDialog.context.sport", {
                  sport: t(
                    sportType === SportType.RUN
                      ? "tabs.run"
                      : sportType === SportType.CYCLING
                        ? "tabs.cycling"
                        : "tabs.swim",
                  ),
                })
              : t("fitnessMetricDialog.context.default")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <div className="space-y-3">
          <section className="space-y-2">
            <div className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
              {t("fitnessMetricDialog.sections.proposed")}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
              <div className="truncate text-sm font-medium text-foreground">
                {displayedEstimated || t("empty")}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={applyEstimate}
                disabled={!displayedEstimated || isFetchingPair || isSaving}
              >
                {t("fitnessMetricDialog.actions.apply")}
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
                {t("fitnessMetricDialog.sections.active")}
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={addRow}
                disabled={!canAddRow || isSaving}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-[200px] max-h-[360px] overflow-auto rounded-md border border-border/70 bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">
                      {t("historyTable.columns.effectiveDate")}
                    </TableHead>
                    <TableHead>{t("historyTable.columns.value")}</TableHead>
                    <TableHead className="w-[140px]">
                      {t("historyTable.columns.source")}
                    </TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isFetchingHistory && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {t("loading")}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isFetchingHistory && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {t("empty")}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((row, index) => (
                    <TableRow key={`${row.effectiveDate}-${index}`}>
                      <TableCell>
                        <CalendarSelect
                          date={parseMetricDateInput(row.effectiveDate)}
                          placeholder="YYYY-MM-DD"
                          className="max-w-none"
                          disabled={row.editable === false}
                          onSelect={(date) =>
                            updateRow(index, {
                              effectiveDate: date
                                ? formatMetricDateInput(date)
                                : "",
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {isPaceMetric ? (
                          <PaceInput
                            value={
                              Number.isFinite(Number(row.value)) &&
                              Number(row.value) > 0
                                ? Number(row.value)
                                : undefined
                            }
                            onChange={(nextValue) =>
                              updateRow(index, {
                                value:
                                  nextValue && nextValue > 0
                                    ? String(nextValue)
                                    : "",
                              })
                            }
                            placeholder="mm:ss"
                            disabled={row.editable === false}
                          />
                        ) : (
                          <Input
                            type="number"
                            value={row.value}
                            disabled={row.editable === false}
                            onChange={(event) =>
                              updateRow(index, { value: event.target.value })
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="whitespace-nowrap">
                          {sourceLabel(row)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.editable !== false ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:bg-muted hover:text-destructive"
                            onClick={() => removeRow(index)}
                            disabled={isSaving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => save()}
              disabled={isSaving}
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
