"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  getCompetitionEvents,
  type CompetitionEvent,
} from "@/api/competition-events";
import { CompetitionEventDialog } from "@/components/competition/competition-event-dialog";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function localTodayYmd() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function CompetitionsPage() {
  const t = useTranslations("CompetitionEvents");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentYear = new Date().getFullYear();
  const requestedYear = Number(searchParams.get("year"));
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 1970 &&
    requestedYear <= 2200
      ? requestedYear
      : currentYear;
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CompetitionEvent | null>(
    null,
  );
  useSetPageTitle(t("page.title"));

  const eventsQuery = useQuery({
    queryKey: [
      ...queryKeys.competitionEvents.range(startDate, endDate),
      "ALL_STATUSES",
    ],
    queryFn: async () => {
      const [active, cancelled] = await Promise.all([
        getCompetitionEvents(startDate, endDate),
        getCompetitionEvents(startDate, endDate, "CANCELLED"),
      ]);
      return [...active, ...cancelled].sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      );
    },
    staleTime: 60_000,
  });
  const events = eventsQuery.data ?? [];
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        weekday: "short",
      }),
    [locale],
  );
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale],
  );
  const grouped = useMemo(() => {
    const result = new Map<string, CompetitionEvent[]>();
    for (const event of events) {
      const key = event.startDate.slice(0, 7);
      const values = result.get(key) ?? [];
      values.push(event);
      result.set(key, values);
    }
    return [...result.entries()];
  }, [events]);

  const setYear = (nextYear: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(nextYear));
    router.replace(`/competitions?${params.toString()}`);
  };
  const openCreate = () => {
    setSelectedEvent(null);
    setDialogOpen(true);
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-2 py-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {t("page.title")}
          </h1>
          <div className="inline-flex items-center gap-1 rounded-control bg-neutral-100 p-0.5 dark:bg-muted/45">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t("page.previousYear")}
              onClick={() => setYear(year - 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-3.5" />
            </Button>
            <span className="px-1.5 text-xs font-medium tabular-nums text-foreground">
              {t("page.yearLabel", { year })}
            </span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t("page.nextYear")}
              onClick={() => setYear(year + 1)}
            >
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
          <span className="text-mobile-caption text-muted-foreground pc:text-xs">
            {t("page.count", { count: events.length })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button asChild size="sm" variant="ghost">
            <Link href="/calendar">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              {t("page.openCalendar")}
            </Link>
          </Button>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus aria-hidden="true" className="size-3.5" />
            {t("page.add")}
          </Button>
        </div>
      </header>

      <section className="space-y-3">
        {eventsQuery.isPending ? (
          <div
            aria-live="polite"
            className="rounded-surface bg-neutral-100 px-4 py-8 text-sm text-muted-foreground dark:bg-muted/45"
          >
            {t("page.loading")}
          </div>
        ) : eventsQuery.isError ? (
          <div
            role="alert"
            className="rounded-surface border border-destructive/30 bg-destructive/5 px-4 py-8 text-sm text-destructive"
          >
            {t("page.error")}
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-surface bg-neutral-100 px-6 py-12 text-center dark:bg-muted/45">
            <h2 className="text-sm font-semibold text-foreground">
              {t("page.empty", { year })}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("page.emptyDescription")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={openCreate}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              {t("page.add")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([month, monthEvents]) => {
              const monthDate = new Date(
                Number(month.slice(0, 4)),
                Number(month.slice(5, 7)) - 1,
                1,
              );
              return (
                <section key={month} className="space-y-1.5">
                  <h3 className="px-1 text-mobile-caption font-medium text-muted-foreground pc:text-xs">
                    {monthFormatter.format(monthDate)}
                  </h3>
                  <div className="space-y-1.5">
                    {monthEvents.map((event) => {
                      const eventDate = new Date(`${event.startDate}T00:00:00`);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => {
                            setSelectedEvent(event);
                            setDialogOpen(true);
                          }}
                          className="block w-full rounded-surface bg-neutral-100 px-4 py-3 text-left transition-colors hover:bg-neutral-200/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted/45 dark:hover:bg-muted/70"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "truncate text-sm font-semibold text-foreground",
                                  event.status === "CANCELLED" &&
                                    "line-through text-muted-foreground",
                                )}
                              >
                                {event.title}
                              </span>
                              <span className="rounded-compact bg-background/80 px-1.5 py-0.5 text-mobile-caption font-medium text-muted-foreground pc:text-[11px]">
                                {t(`status.${event.status}`)}
                              </span>
                              <span className="rounded-compact bg-rose-50 px-1.5 py-0.5 text-mobile-caption font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-200 pc:text-[11px]">
                                {t(`importance.${event.importance}.label`)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-mobile-caption text-muted-foreground pc:text-xs">
                              <span>{dateFormatter.format(eventDate)}</span>
                              <span>{t(`sports.${event.sportType}`)}</span>
                              {event.distanceMeters ? (
                                <span>
                                  {numberFormatter.format(
                                    event.distanceMeters / 1000,
                                  )}{" "}
                                  km
                                </span>
                              ) : null}
                              {event.location ? (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                  <MapPin
                                    aria-hidden="true"
                                    className="h-3 w-3 shrink-0"
                                  />
                                  <span className="truncate">
                                    {event.location}
                                  </span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>

      <CompetitionEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={selectedEvent}
        defaultDate={year === currentYear ? localTodayYmd() : `${year}-01-01`}
      />
    </main>
  );
}
