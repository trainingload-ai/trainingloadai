"use client";

import { useId, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  PlanCalendarMoveImpact,
  PlanProposalPresentation,
} from "@shared/plan-proposal";
import { CalendarMoveWeekComparison } from "../../calendar/components/calendar-move-week-comparison";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const sides = ["before", "after"] as const;

export function CoachScheduleComparison({
  proposal,
  initialMove,
  onOpenPreview,
}: {
  proposal: PlanProposalPresentation;
  initialMove?: PlanCalendarMoveImpact;
  onOpenPreview?: () => void;
}) {
  const t = useTranslations("CalendarMove");
  const workspace = useTranslations("AiCoachPage.workspace");
  const titleId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const invoker = useRef<HTMLButtonElement | null>(null);
  const changes = proposal.rows.filter(
    (row) => row.changeKind && row.changeKind !== "PRESERVED",
  );
  const entries = (side: (typeof sides)[number]) =>
    changes.flatMap((row, index) => {
      if (side === "before" && row.changeKind === "ADDED") return [];
      if (side === "after" && row.changeKind === "DELETED") return [];
      const date =
        side === "before"
          ? (row.beforeScheduledDate ??
            (row.workoutId === initialMove?.workoutId
              ? initialMove?.from
              : undefined))
          : row.scheduledDate;
      return [
        {
          name: side === "before" ? (row.beforeName ?? row.name) : row.name,
          date: date ?? null,
          text: row[side],
          number: index + 1,
        },
      ];
    });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {sides.map((side) => {
          const rows = entries(side);
          return (
            <Button
              key={side}
              type="button"
              variant="ghost"
              className="h-auto min-w-0 flex-col items-start justify-start gap-1 whitespace-normal bg-background/80 px-2 py-2 text-start dark:bg-background/45"
              onClick={(event) => {
                invoker.current = event.currentTarget;
                setDetailsOpen(true);
              }}
            >
              <span className="flex w-full items-center justify-between gap-1 text-xs">
                {t(side)}
                <ArrowUpRight aria-hidden />
              </span>
              {rows.slice(0, 2).map(({ name, date, number }) => (
                <span
                  key={number}
                  className="flex w-full min-w-0 items-baseline gap-1 text-[11px] text-muted-foreground"
                >
                  {date ? (
                    <time dateTime={date} className="shrink-0">
                      {date.slice(5)}
                    </time>
                  ) : null}
                  <span className="truncate">{name}</span>
                </span>
              ))}
              {rows.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : null}
              {rows.length > 2 ? (
                <span className="text-xs text-muted-foreground">
                  +{rows.length - 2}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>
      {onOpenPreview ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={onOpenPreview}
        >
          <CalendarDays aria-hidden />
          {workspace("openCalendar")}
          <ArrowUpRight className="ms-auto" aria-hidden />
        </Button>
      ) : null}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent
          aria-labelledby={titleId}
          className="max-h-[85dvh] max-w-3xl overflow-y-auto"
          onCloseAutoFocus={(event) => {
            if (!invoker.current?.isConnected) return;
            event.preventDefault();
            invoker.current.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle id={titleId}>{t("changeDetails")}</DialogTitle>
            <DialogDescription>{proposal.title}</DialogDescription>
          </DialogHeader>
          {proposal.calendarAdjustmentWeeks?.length ? (
            <CalendarMoveWeekComparison batchWeeks={proposal.calendarAdjustmentWeeks} />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {sides.map((side) => (
              <section key={side} className="flex min-w-0 flex-col gap-3">
                <h3 className="text-sm font-semibold">{t(side)}</h3>
                {entries(side).map(({ name, date, text, number }) => (
                  <div
                    key={number}
                    className="flex min-w-0 flex-col gap-1 rounded-md bg-muted p-3 text-sm"
                  >
                    <span className="font-medium">{name}</span>
                    {date ? (
                      <time
                        dateTime={date}
                        className="text-xs text-muted-foreground"
                      >
                        {date}
                      </time>
                    ) : null}
                    <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {text}
                    </pre>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
