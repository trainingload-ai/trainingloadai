"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { useVdotForecast } from "@/api/vdot-forecast";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function VdotForecastSummary({
  currentValue,
  compact = false,
  enabled = true,
}: {
  currentValue: string;
  compact?: boolean;
  enabled?: boolean;
}) {
  const t = useTranslations("VdotForecast");
  const format = useFormatter();
  const query = useVdotForecast(enabled);
  const forecast = query.data;
  if (!enabled) return null;

  const final =
    forecast?.status === "READY" ? forecast.forecasts.at(-1) : undefined;
  const current = currentValue.trim() ? Number(currentValue) : NaN;
  const hasCurrent = Number.isFinite(current) && current > 0;
  const difference =
    final && hasCurrent
      ? Math.round(final.point * 10) - Math.round(current * 10)
      : null;
  const direction =
    difference === null
      ? null
      : difference > 0
        ? "higher"
        : difference < 0
          ? "lower"
          : "unchanged";
  const DirectionIcon =
    direction === "higher"
      ? ArrowUpRight
      : direction === "lower"
        ? ArrowDownRight
        : Minus;
  const number = (value: number) =>
    format.number(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const projection = final ? (
    <div
      className={cn("flex shrink-0 flex-col gap-1", compact && "items-end")}
      data-testid={compact ? "vdot-forecast-compact" : undefined}
    >
      <span className="text-xs text-muted-foreground">{t("inFourWeeks")}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-semibold leading-none tabular-nums",
          compact ? "text-xl" : "text-3xl",
          direction === "higher"
            ? "text-success"
            : direction === "lower"
              ? "text-destructive"
              : "text-muted-foreground",
        )}
        aria-label={`${t("expected", { value: number(final.point) })}${direction ? `, ${t(direction)}` : ""}`}
      >
        {direction ? (
          <DirectionIcon
            className={compact ? "size-4" : "size-5"}
            aria-hidden="true"
          />
        ) : null}
        {number(final.point)}
      </span>
    </div>
  ) : null;

  const unavailable = query.isPending ? null : (
    <p
      className={cn(
        "text-xs text-muted-foreground",
        compact && "max-w-40 text-right",
      )}
    >
      {t(
        forecast?.status === "READY"
          ? "MODEL_UNAVAILABLE"
          : (forecast?.status ?? "MODEL_UNAVAILABLE"),
      )}
    </p>
  );
  if (compact) return projection ?? unavailable;

  return (
    <div
      className="flex flex-col gap-3 text-sm pc:flex-row pc:items-center pc:gap-6"
      data-testid="vdot-forecast-summary"
    >
      <div
        className="flex flex-wrap items-end gap-x-8 gap-y-3 pc:shrink-0"
        data-testid="vdot-current-and-forecast"
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("current")}</span>
          <span className="text-4xl font-bold leading-none tracking-tight text-foreground tabular-nums">
            {hasCurrent
              ? format.number(current, { maximumFractionDigits: 1 })
              : currentValue}
          </span>
        </div>
        {projection}
      </div>
      <div
        className="flex items-center justify-between gap-4 pc:min-w-0 pc:flex-1"
        data-testid="vdot-forecast-context"
      >
        <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          {final ? (
            <>
              <p className="tabular-nums">
                {t("interval", {
                  lower: number(final.lower80),
                  upper: number(final.upper80),
                })}
              </p>
              <p>{t("basis", { date: forecast!.cutoffDate })}</p>
            </>
          ) : (
            unavailable
          )}
        </div>
        <Button variant="default" size="sm" asChild className="shrink-0">
          <Link href="/ai-coach?metricQuestion=vo2Max">{t("askCoach")}</Link>
        </Button>
      </div>
    </div>
  );
}
