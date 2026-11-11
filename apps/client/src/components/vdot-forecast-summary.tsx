"use client";

import { useTranslations, useFormatter } from "next-intl";
import { useVdotForecast } from "@/api/vdot-forecast";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function VdotForecastSummary({
  compact = false,
  enabled = true,
}: {
  compact?: boolean;
  enabled?: boolean;
}) {
  const t = useTranslations("VdotForecast");
  const format = useFormatter();
  const query = useVdotForecast(enabled);
  const forecast = query.data;
  if (!enabled || query.isPending) return null;
  if (!forecast || forecast.status !== "READY") {
    return (
      <p className="text-mobile-caption pc:text-xs text-muted-foreground">
        {t(forecast?.status ?? "MODEL_UNAVAILABLE")}
      </p>
    );
  }
  const final = forecast.forecasts.at(-1);
  if (!final) return null;
  const number = (value: number) =>
    format.number(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  if (compact)
    return (
      <p className="text-mobile-caption pc:text-xs text-muted-foreground tabular-nums">
        {t("expected", { value: number(final.point) })}
      </p>
    );
  return (
    <div
      className="flex flex-col gap-2 text-sm"
      data-testid="vdot-forecast-summary"
    >
      <p className="font-medium tabular-nums">
        {t("expected", { value: number(final.point) })}
      </p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {t("interval", {
          lower: number(final.lower80),
          upper: number(final.upper80),
        })}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("basis", { date: forecast.cutoffDate })}
      </p>
      <Button variant="outline" size="sm" asChild className="self-start">
        <Link href="/ai-coach?vdotQuestion=1">{t("askCoach")}</Link>
      </Button>
    </div>
  );
}
