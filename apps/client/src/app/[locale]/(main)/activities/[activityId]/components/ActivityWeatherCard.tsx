"use client";

import { CloudSun, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ActivityWeatherSnapshot } from "@shared/activity-weather";
import { useStore } from "@/lib/store";

function temperature(value: number, imperial: boolean) {
  const converted = imperial ? (value * 9) / 5 + 32 : value;
  return `${converted.toFixed(1)} °${imperial ? "F" : "C"}`;
}

function speed(value: number, imperial: boolean) {
  return imperial
    ? `${(value * 0.621371).toFixed(1)} mph`
    : `${value.toFixed(1)} km/h`;
}

export function ActivityWeatherCard({
  weather,
}: {
  weather: ActivityWeatherSnapshot | null | undefined;
}) {
  const t = useTranslations("ActivityWeather");
  const { systemUnit } = useStore();
  const imperial = systemUnit === "imperial";

  if (!weather) return null;
  if (weather.status === "PENDING") {
    return (
      <section className="rounded-md border border-border/70 bg-card px-4 py-3 text-mobile-caption text-muted-foreground pc:text-xs">
        {t("pending")}
      </section>
    );
  }
  if (weather.status !== "AVAILABLE") return null;

  const direction =
    weather.windDirectionDeg == null
      ? null
      : t(`directions.${Math.round(weather.windDirectionDeg / 45) % 8}`);
  const metrics: Array<{ label: string; value: string | null }> = [
    {
      label: t("apparentTemperature"),
      value:
        weather.apparentTemperatureC == null
          ? null
          : temperature(weather.apparentTemperatureC, imperial),
    },
    {
      label: t("dewPoint"),
      value:
        weather.dewPointC == null
          ? null
          : temperature(weather.dewPointC, imperial),
    },
    {
      label: t("wind"),
      value:
        weather.windSpeedKph == null
          ? null
          : `${direction ? `${direction} ` : ""}${speed(weather.windSpeedKph, imperial)}`,
    },
    {
      label: t("gust"),
      value:
        weather.windGustKph == null
          ? null
          : speed(weather.windGustKph, imperial),
    },
    {
      label: t("humidity"),
      value: weather.humidityPct == null ? null : `${weather.humidityPct}%`,
    },
    {
      label: t("cloudCover"),
      value: weather.cloudCoverPct == null ? null : `${weather.cloudCoverPct}%`,
    },
    {
      label: t("pressure"),
      value:
        weather.pressureHpa == null
          ? null
          : `${weather.pressureHpa.toFixed(1)} hPa`,
    },
    {
      label: t("windChill"),
      value:
        weather.windChillC == null
          ? null
          : temperature(weather.windChillC, imperial),
    },
    {
      label: t("heatIndex"),
      value:
        weather.heatIndexC == null
          ? null
          : temperature(weather.heatIndexC, imperial),
    },
  ].filter((item) => item.value != null);

  return (
    <section className="overflow-hidden rounded-md border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-full bg-sky-500/10 p-2 text-sky-600 dark:text-sky-300">
            <CloudSun className="h-5 w-5" />
          </div>
          <div>
            <div className="text-mobile-caption text-muted-foreground pc:text-xs">
              {t("title")}
            </div>
            <div className="font-semibold">
              {t(`conditions.${weather.conditionCode ?? "OTHER"}`)}
            </div>
          </div>
        </div>
        {weather.temperatureC == null ? null : (
          <div className="text-2xl font-semibold tabular-nums">
            {temperature(weather.temperatureC, imperial)}
          </div>
        )}
      </div>
      {metrics.length ? (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 px-4 py-4 pc:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt className="text-mobile-caption text-muted-foreground pc:text-xs">
                {metric.label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="border-t border-border/60 px-4 py-2.5 text-mobile-caption text-muted-foreground pc:text-xs">
        {weather.attribution.legalPageUrl ? (
          <a
            className="inline-flex items-center gap-1 hover:text-foreground"
            href={weather.attribution.legalPageUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("source", { name: weather.attribution.serviceName })}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          t("source", { name: weather.attribution.serviceName })
        )}
      </div>
    </section>
  );
}
