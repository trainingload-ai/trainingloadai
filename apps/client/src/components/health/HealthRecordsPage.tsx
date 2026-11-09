"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useHealthOverview, useHealthObservations } from "@/api/health-data";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { formatObservationTime } from "./health-record-format";
const metrics = [
  "DIETARY_ENERGY_KCAL",
  "DIETARY_CARBOHYDRATE_G",
  "DIETARY_FAT_G",
  "DIETARY_PROTEIN_G",
  "HYDRATION_ML",
  "SKIN_TEMPERATURE_DELTA_C",
] as const;
export function HealthRecordsPage() {
  const t = useTranslations("HealthRecords"),
    locale = useLocale();
  useSetPageTitle(t("title"));
  const [days, setDays] = useState(7),
    [expanded, setExpanded] = useState(false),
    daily = useHealthOverview(30),
    demo = usePublicDemo();
  const observations = useHealthObservations(
    days,
    daily.data?.endDate,
    !demo.active,
  );
  const quantityRows = useMemo(() => {
    const rows = daily.data?.days ?? [];
    return rows
      .slice(-days)
      .flatMap((day) =>
        day.metrics
          .filter((metric) =>
            (metrics as readonly string[]).includes(metric.type),
          )
          .map((metric) => ({ ...metric, date: day.date })),
      )
      .reverse();
  }, [daily.data?.days, days]);
  const readings = observations.data?.items ?? [],
    blood = readings.filter((row) => row.kind === "BLOOD_PRESSURE"),
    reports = observations.data?.reports ?? [];
  const breathing = useMemo(() => {
    const groups = new Map<string, typeof readings>();
    for (const row of readings)
      if (row.kind === "BREATHING_VARIATION") {
        const group = groups.get(row.groupId + ":" + row.localDate) ?? [];
        group.push(row);
        groups.set(row.groupId + ":" + row.localDate, group);
      }
    return [...groups.values()];
  }, [readings]);
  const number = (value: number | null, delta = false) =>
    value == null
      ? "—"
      : new Intl.NumberFormat(locale, {
          maximumFractionDigits: 1,
          ...(delta ? { signDisplay: "always" as const } : {}),
        }).format(value);
  const category = (code: string | null) =>
    code
      ? t.has(`categories.${code}`)
        ? t(`categories.${code}`)
        : code
      : t("noOverallCategory");
  const source = (provider: string, name: string | null) =>
    name ||
    (provider === "MANUAL"
      ? t("origins.MANUAL")
      : provider.replaceAll("_", " "));
  const rowsClass =
    "grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border py-3 last:border-b-0";
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 pb-24 pc:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Tabs
          value={String(days)}
          onValueChange={(value) => {
            setDays(Number(value));
            setExpanded(false);
          }}
        >
          <TabsList aria-label={t("range")}>
            {[1, 7, 30].map((value) => (
              <TabsTrigger key={value} value={String(value)}>
                {t("days", { count: value })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t("quantities")}</h2>
        {daily.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("loading")}
          </p>
        ) : daily.isError ? (
          <Button variant="outline" size="sm" onClick={() => daily.refetch()}>
            {t("retry")}
          </Button>
        ) : quantityRows.length ? (
          <div className="rounded-md border border-border px-3">
            {quantityRows.slice(0, expanded ? 180 : 12).map((row) => (
              <div key={row.date + row.type} className={rowsClass}>
                <div className="min-w-0">
                  <p className="text-sm">{t(`metrics.${row.type}`)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.date} · {source(row.provider ?? "", null)}
                  </p>
                  {row.type === "SKIN_TEMPERATURE_DELTA_C" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("deviationHint")}
                    </p>
                  )}
                </div>
                <p className="whitespace-nowrap text-sm font-medium">
                  {number(row.value, row.type === "SKIN_TEMPERATURE_DELTA_C")}{" "}
                  {row.type === "SKIN_TEMPERATURE_DELTA_C" ? "°C" : row.unit}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        {quantityRows.length > 12 && (
          <Button
            className="self-start"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t("less") : t("more")}
          </Button>
        )}
      </section>
      {!demo.active && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t("bloodPressure")}</h2>
            {observations.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t("loading")}
              </p>
            ) : observations.isError ? (
              <div className="flex items-center gap-3">
                <p role="alert" className="text-sm text-muted-foreground">
                  {t("failed")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => observations.refetch()}
                >
                  {t("retry")}
                </Button>
              </div>
            ) : blood.length ? (
              <div className="rounded-md border border-border px-3">
                {blood.slice(0, expanded ? 100 : 10).map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm">
                        {formatObservationTime(
                          row.measuredAt,
                          row.offsetSeconds,
                          row.timezone,
                          locale,
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {source(row.provider, row.sourceName)} ·{" "}
                        {t(`origins.${row.measurementOrigin ?? "UNKNOWN"}`)}
                        {!row.selected ? " · " + t("alternateSource") : ""}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <p className="text-sm font-medium">
                        {number(row.systolicMmHg)} / {number(row.diastolicMmHg)}{" "}
                        mmHg
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("pulse")}: {number(row.pulseBpm)} bpm
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            )}
            {blood.length > 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? t("less") : t("more")}
              </Button>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t("breathing")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("breathingHint")}
            </p>
            {observations.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t("loading")}
              </p>
            ) : observations.isError ? (
              <p className="text-sm text-muted-foreground">{t("failed")}</p>
            ) : breathing.length ? (
              <div className="flex flex-col gap-3">
                {breathing.slice(0, expanded ? 100 : 10).map((group) => {
                  const summary = group.find((row) => row.scope === "DAILY"),
                    head = summary ?? group[0],
                    periods = group
                      .filter((row) => row.scope === "INTERVAL")
                      .sort((a, b) =>
                        (a.intervalStart ?? "").localeCompare(
                          b.intervalStart ?? "",
                        ),
                      );
                  return (
                    <div
                      key={head.groupId}
                      className="rounded-md border border-border p-3"
                    >
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <span>
                          {head.localDate} ·{" "}
                          {source(head.provider, head.sourceName)}
                        </span>
                        <span className="font-medium">
                          {category(summary?.categoryCode ?? null)}
                        </span>
                      </div>
                      {periods.length ? (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer py-1 focus-visible:outline-2 focus-visible:outline-ring">
                            {t("periods", { count: periods.length })}
                          </summary>
                          <ul className="mt-2 flex flex-col gap-2">
                            {periods.map((row) => (
                              <li
                                key={row.id}
                                className="flex flex-col gap-1 border-t border-border pt-2"
                              >
                                <span>
                                  {formatObservationTime(
                                    row.intervalStart,
                                    row.offsetSeconds,
                                    row.timezone,
                                    locale,
                                  )}{" "}
                                  —{" "}
                                  {formatObservationTime(
                                    row.intervalEnd,
                                    row.offsetSeconds,
                                    row.timezone,
                                    locale,
                                  )}
                                </span>
                                <span>{category(row.categoryCode)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("dateOnly")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            )}
          </section>
          {reports.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{t("sourceReports")}</h2>
              <p className="text-xs text-muted-foreground">{t("reportHint")}</p>
              <div className="rounded-md border border-border px-3">
                {reports.slice(0, expanded ? 100 : 10).map((row) => (
                  <div key={row.id} className={rowsClass}>
                    <div>
                      <p className="text-sm">{t(`metrics.${row.type}`)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.localDate} · {source(row.provider, row.sourceName)}
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      {number(row.value)} {row.unit}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {(breathing.length > 10 || reports.length > 10) && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? t("less") : t("more")}
            </Button>
          )}
          {observations.data?.truncated && (
            <p role="status" className="text-xs text-muted-foreground">
              {t("truncated")}
            </p>
          )}
        </>
      )}
      <footer>
        <Button variant="outline" size="sm" asChild>
          <Link href="/account">{t("connections")}</Link>
        </Button>
      </footer>
    </main>
  );
}
