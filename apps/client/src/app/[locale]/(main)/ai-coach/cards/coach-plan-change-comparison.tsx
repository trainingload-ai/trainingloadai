import { Fragment, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { isCalendarDate } from "@shared/plan-calendar";
import {
  planProposalComparisonKind,
  planProposalComparisonMetadata,
  type PlanCalendarMoveImpact,
  type PlanProposalMode,
  type PlanProposalPresentationRow,
} from "@shared/plan-proposal";
import { cn } from "@/lib/utils";

export const planChangeVersionStyles = {
  before: "border-palette-sky-200 border-s-palette-sky-500 bg-palette-sky-50 dark:border-palette-sky-900 dark:border-s-palette-sky-500 dark:bg-palette-sky-500/10",
  after: "border-palette-emerald-200 border-s-palette-emerald-500 bg-palette-emerald-50 dark:border-palette-emerald-900 dark:border-s-palette-emerald-500 dark:bg-palette-emerald-500/10",
  removed: "border-palette-rose-200 border-s-palette-rose-500 bg-palette-rose-50 dark:border-palette-rose-900 dark:border-s-palette-rose-500 dark:bg-palette-rose-500/10",
  preserved: "border-border bg-background/60",
  empty: "border-dashed border-border",
};

const protectedReasonKeys = {
  OUTSIDE_RANGE: "protectedOutsideRange",
  PLAN_STATUS: "protectedPlanStatus",
  WORKOUT_STATUS: "protectedWorkoutStatus",
  ACTIVITY_LINKED: "protectedActivityLinked",
  HISTORY: "protectedHistory",
  PENDING_SUPERSESSION: "protectedSuccessor",
} as const;

const comparisonColumns = "grid-cols-1 @min-[26rem]:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)]";

export function CoachPlanChangeComparison({ rows, mode, effectiveFrom, initialMove, footer }: {
  rows: PlanProposalPresentationRow[];
  mode: PlanProposalMode;
  effectiveFrom?: string;
  initialMove?: PlanCalendarMoveImpact;
  footer?: ReactNode;
}) {
  const t = useTranslations("AiCoachPage.decision");
  const move = useTranslations("CalendarMove");
  const sports = useTranslations("SportCatalog");
  const locale = useLocale();
  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric", weekday: "short", timeZone: "UTC",
  });
  const compactDateFormat = new Intl.DateTimeFormat(locale, {
    month: "short", day: "numeric", timeZone: "UTC",
  });
  function sportLabel(sport?: string) {
    if (!sport) return "";
    const sportKey = `sports.${sport === "STRENGTH" ? "STRENGTH_TRAINING" : sport}` as Parameters<typeof sports>[0];
    const familyKey = `families.${sport}` as Parameters<typeof sports>[0];
    return sports.has(sportKey) ? sports(sportKey) : sports.has(familyKey) ? sports(familyKey) : sport;
  }
  if (!rows.length) return null;

  return (
    <div className="@container space-y-2.5">
      <div aria-hidden className={cn("hidden gap-2 text-xs font-semibold @min-[26rem]:grid", comparisonColumns)}>
        <span className="px-2.5 text-palette-sky-800 dark:text-palette-sky-300 @min-[26rem]:px-3">{move("before")}</span>
        <span className="px-2.5 text-palette-emerald-800 dark:text-palette-emerald-300 @min-[26rem]:col-start-3 @min-[26rem]:px-3">{move("after")}</span>
      </div>
      <ul className="space-y-3">
        {rows.map((row, index) => {
          const kind = planProposalComparisonKind(row, mode, effectiveFrom);
          const { beforeDate, beforeSportType, dateChanged, sportChanged, yearChanged } =
            planProposalComparisonMetadata(row, mode, kind, initialMove?.workoutId === row.workoutId ? initialMove?.from : undefined);
          const protectedReason = row.protectedReason
            ? t(protectedReasonKeys[row.protectedReason as keyof typeof protectedReasonKeys] ?? "protected")
            : undefined;
          const versions = [
            {
              side: "before" as const,
              tone: kind === "ADDED" ? "empty" : kind === "DELETED" ? "removed" : kind === "PRESERVED" ? "preserved" : "before",
              name: kind === "ADDED" ? undefined : row.beforeName || row.name,
              date: beforeDate,
              sport: sportLabel(beforeSportType),
              highlight: "font-semibold text-palette-sky-800 dark:text-palette-sky-300",
              description: row.before,
              status: kind === "DELETED" ? t("deleted") : undefined,
            },
            {
              side: "after" as const,
              tone: kind === "DELETED" || kind === "REPLACED" ? "empty" : kind === "PRESERVED" ? "preserved" : "after",
              name: kind === "DELETED" || kind === "REPLACED" ? undefined : row.name,
              date: row.scheduledDate,
              sport: sportLabel(row.sportType),
              highlight: "font-semibold text-palette-emerald-800 dark:text-palette-emerald-300",
              description: row.after,
              status: kind === "ADDED" ? t("added") : kind === "PRESERVED" ? protectedReason ?? t("preserved") : undefined,
            },
          ] as const;
          return (
            <li key={`${row.workoutId ?? row.candidateKey ?? row.name}:${index}`} className="space-y-1.5">
              <div className={cn("grid gap-2", comparisonColumns)}>
                {versions.map(({ side, tone, name, date, sport, highlight, description, status }) => (
                  <Fragment key={side}>
                    <div role="group" aria-label={move(side)} className={cn(
                      "min-w-0 rounded-md border border-s-2 px-2.5 py-2.5 [overflow-wrap:anywhere] @min-[26rem]:px-3",
                      side === "after" && "@min-[26rem]:col-start-3",
                      planChangeVersionStyles[tone],
                    )}>
                      <p className={cn(
                        "mb-1 text-[11px] font-semibold @min-[26rem]:hidden",
                        side === "before"
                          ? "text-palette-sky-800 dark:text-palette-sky-300"
                          : "text-palette-emerald-800 dark:text-palette-emerald-300",
                      )}>
                        {move(side)}
                      </p>
                      {name ? (
                        <>
                          <p className="text-sm font-semibold text-foreground">{name}</p>
                          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
                            {isCalendarDate(date) ? (
                              <time dateTime={date} className={cn(dateChanged && highlight)}>
                                {yearChanged ? dateFormat.format(new Date(`${date}T00:00:00Z`)) : (
                                  <>
                                    <span className="@min-[26rem]:hidden">{compactDateFormat.format(new Date(`${date}T00:00:00Z`))}</span>
                                    <span className="hidden @min-[26rem]:inline">{dateFormat.format(new Date(`${date}T00:00:00Z`))}</span>
                                  </>
                                )}
                              </time>
                            ) : null}
                            {sport ? <span className={cn(sportChanged && highlight)}>{sport}</span> : null}
                          </div>
                          {description ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">{description}</p> : null}
                        </>
                      ) : <p className="text-xs text-muted-foreground">{kind === "REPLACED" ? description || "—" : "—"}</p>}
                      {status ? <p className="mt-1 text-xs font-medium text-muted-foreground">{status}</p> : null}
                    </div>
                    {side === "before" && kind === "CHANGED" ? (
                      <ArrowRight aria-hidden className="hidden size-4 self-center justify-self-center text-palette-sky-700 rtl:rotate-180 dark:text-palette-sky-400 @min-[26rem]:block" />
                    ) : null}
                  </Fragment>
                ))}
              </div>
              {row.rationale ? <p className="px-1 text-xs leading-5 text-muted-foreground">{row.rationale}</p> : null}
            </li>
          );
        })}
      </ul>
      {footer}
    </div>
  );
}
