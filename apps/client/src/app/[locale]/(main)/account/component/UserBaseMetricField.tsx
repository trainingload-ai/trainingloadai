"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarSelect } from "@/components/calendar-select";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { BodyMetricType, BodyMetricTypes } from "@/api/settings";
import {
  useReplaceUserBodyMetrics,
  useUserBodyMetrics,
} from "@/hooks/useUserProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { MetricTileButton } from "./MetricTileButton";
import { TimezoneValueEditor } from "./TimezoneValueEditor";
import { settingsDialogDesktopClassName } from "@/components/ui/dialog-sizes";
import {
  type MetricHistoryRow,
  KNOWN_METRIC_SOURCE_LABEL_KEYS,
  filterTimezoneOptions,
  formatMetricDateInput,
  getDefaultMetricEffectiveDate,
  getTimezoneOptions,
  mapBodyMetricRows,
  metricSourceLabelKey,
  parseMetricDateInput,
} from "./user-profile-metric-model";

export function UserBaseMetricField({
  displayValue,
  label,
  type,
}: {
  displayValue: string;
  label: string;
  type: BodyMetricType;
}) {
  const t = useTranslations("UserProfile");
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const replaceBodyMetricsMutation = useReplaceUserBodyMetrics();
  const [timezoneOpenIndex, setTimezoneOpenIndex] = useState<number | null>(
    null,
  );
  const [timezoneQuery, setTimezoneQuery] = useState("");
  const { data, isLoading: isLoadingMetrics } = useUserBodyMetrics(type, open);
  const [rows, setRows] = useState<MetricHistoryRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(mapBodyMetricRows({ data, type }));
  }, [open, data, type]);

  const timezoneOptions = useMemo(
    () =>
      getTimezoneOptions(
        type === BodyMetricTypes.TIMEZONE
          ? [displayValue, ...rows.map((row) => row.value)]
          : [],
      ),
    [displayValue, rows, type],
  );
  const timezoneFilteredOptions = useMemo(
    () => filterTimezoneOptions(timezoneOptions, timezoneQuery),
    [timezoneOptions, timezoneQuery],
  );

  const validateValue = (raw: string, row: number) => {
    const value = String(raw ?? "").trim();
    if (!value) {
      return {
        ok: false as const,
        message: t("historyTable.validation.rowValueRequired", { row }),
      };
    }

    if (type === BodyMetricTypes.WEIGHT || type === BodyMetricTypes.HEIGHT) {
      const numericValue = Number.parseFloat(value);
      if (!Number.isFinite(numericValue)) {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowNumberRequired", { row }),
        };
      }
      if (numericValue <= 0) {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowPositiveRequired", { row }),
        };
      }
      return { ok: true as const };
    }

    if (type === BodyMetricTypes.BIRTHDAY) {
      const date = parseMetricDateInput(value);
      if (!date) {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowDateInvalid", { row }),
        };
      }
      return { ok: true as const };
    }

    if (type === BodyMetricTypes.GENDER) {
      if (value !== "male" && value !== "female" && value !== "other") {
        return {
          ok: false as const,
          message: t("historyTable.validation.rowGenderRequired", { row }),
        };
      }
      return { ok: true as const };
    }

    return { ok: true as const };
  };

  const validateRows = () => {
    if (type === BodyMetricTypes.BIRTHDAY && rows.length > 1) {
      return {
        ok: false as const,
        message: t("historyTable.validation.birthdaySingleRow"),
      };
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
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
      const valueResult = validateValue(row.value, i + 1);
      if (!valueResult.ok) {
        return {
          ok: false as const,
          message: valueResult.message,
        };
      }
    }

    return { ok: true as const };
  };

  const hasIncompleteRow = rows.length > 0 && validateRows().ok === false;
  const canAddRow =
    !isLoadingMetrics &&
    !hasIncompleteRow &&
    (type !== BodyMetricTypes.BIRTHDAY || rows.length === 0);

  const addRow = () => {
    if (isLoadingMetrics) return;
    if (type === BodyMetricTypes.BIRTHDAY && rows.length > 0) {
      toast.error(t("historyTable.validation.birthdaySingleRow"));
      return;
    }
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
    const key = metricSourceLabelKey(row.sourceInfo);
    if (KNOWN_METRIC_SOURCE_LABEL_KEYS.has(key)) {
      return t(`historyTable.sourceLabels.${key}`);
    }
    return key || t("historyTable.sourceLabels.unknown");
  };

  const save = async () => {
    const validated = validateRows();
    if (!validated.ok) {
      toast.error(validated.message);
      return;
    }

    const metrics = rows
      .map((row) => ({
        effectiveDate: String(row.effectiveDate).trim(),
        value: String(row.value).trim(),
      }))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

    await replaceBodyMetricsMutation.mutateAsync({ type, metrics });
    setOpen(false);
  };

  const renderValueEditor = (
    rowValue: string,
    onChange: (next: string) => void,
    rowIndex: number,
  ) => {
    if (type === BodyMetricTypes.WEIGHT || type === BodyMetricTypes.HEIGHT) {
      return (
        <Input
          type="number"
          step="0.1"
          value={rowValue}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }

    if (type === BodyMetricTypes.BIRTHDAY) {
      return (
        <CalendarSelect
          date={parseMetricDateInput(rowValue)}
          placeholder="YYYY-MM-DD"
          className="max-w-none"
          onSelect={(date) => onChange(date ? formatMetricDateInput(date) : "")}
        />
      );
    }

    if (type === BodyMetricTypes.TIMEZONE) {
      const isOpen = timezoneOpenIndex === rowIndex;
      return (
        <TimezoneValueEditor
          emptyLabel={t("empty")}
          isMobile={isMobile}
          label={t("fields.timezone.label")}
          open={isOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              setTimezoneQuery("");
              setTimezoneOpenIndex(rowIndex);
              return;
            }
            setTimezoneOpenIndex(null);
          }}
          onQueryChange={setTimezoneQuery}
          onSelect={(timezone) => {
            onChange(timezone);
            setTimezoneOpenIndex(null);
          }}
          options={timezoneFilteredOptions}
          placeholder={t("fields.timezone.placeholder")}
          query={timezoneQuery}
          value={rowValue}
        />
      );
    }

    return (
      <Select value={rowValue} onValueChange={onChange}>
        <SelectTrigger size="default" className="w-full bg-background">
          <SelectValue placeholder={t("fields.gender.placeholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="male">
            {t("fields.gender.options.male")}
          </SelectItem>
          <SelectItem value="female">
            {t("fields.gender.options.female")}
          </SelectItem>
          <SelectItem value="other">
            {t("fields.gender.options.other")}
          </SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const shownValue = displayValue && displayValue !== "-" ? displayValue : "-";

  return (
    <AdaptiveDialog open={open} onOpenChange={setOpen}>
      <AdaptiveDialogTrigger asChild>
        <MetricTileButton
          title={label}
          value={shownValue}
          mutedValue={shownValue === "-"}
          tabularValue
        />
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent desktopClassName={settingsDialogDesktopClassName}>
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle className="text-base font-medium">
            {label}
          </AdaptiveDialogTitle>
        </AdaptiveDialogHeader>
        <div className="space-y-2 p-2">
          <div className="flex items-center justify-between rounded-md bg-muted/25 px-3">
            <div className="text-sm text-muted-foreground">
              {t("historyHint")}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={addRow}
              disabled={!canAddRow}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="rounded-md border bg-background">
            <div className="min-h-[200px] max-h-[360px] overflow-auto">
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
                  {isLoadingMetrics && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {t("loading")}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingMetrics && rows.length === 0 && (
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
                        {renderValueEditor(
                          row.value,
                          (nextValue) => updateRow(index, { value: nextValue }),
                          index,
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="whitespace-nowrap">
                          {sourceLabel(row)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={save}
              size="sm"
              disabled={replaceBodyMetricsMutation.isPending}
              className="min-w-[84px]"
            >
              {replaceBodyMetricsMutation.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
