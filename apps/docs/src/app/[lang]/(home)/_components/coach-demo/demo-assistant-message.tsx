"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  PencilLine,
} from "lucide-react";
import type {
  AskUserQuestionData,
  CoachPlanDraftData,
  CoachQuestionReplyToolResultPayload,
  PlanWorkoutAdjustmentDraftData,
} from "@shared/ai-coach-schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { CoachCard } from "./coach-card";
import { COACH_ASSISTANT_PROSE_CLASS } from "./coach-assistant-prose";
import { DemoAssistantText } from "./demo-user-message";
import type {
  CoachDemoAssistantPart,
  CoachDemoCopy,
  CoachDemoReadCard,
} from "./types";

function DemoReadToolCard({
  card,
  toggleLabel,
}: {
  card: CoachDemoReadCard;
  toggleLabel: string;
}) {
  const icon =
    card.name === "PlanDayView" ? (
      <CalendarDays className="h-4 w-4" />
    ) : card.name === "ActivityRecent" ? (
      <Activity className="h-4 w-4" />
    ) : (
      <BarChart3 className="h-4 w-4" />
    );

  const title = card.subtitle ? (
    <>
      {card.title}
      <span className="font-normal text-muted-foreground/80">
        {" "}
        · {card.subtitle}
      </span>
    </>
  ) : (
    card.title
  );

  return (
    <CoachCard
      tone="neutral"
      icon={icon}
      title={title}
      dense
      appearance="strip"
      collapsible
      defaultCollapsed
      toggleAriaLabel={toggleLabel}
    >
      {card.stats?.length ? (
        <CoachCard.StatGrid items={card.stats} />
      ) : (
        <p className="text-xs text-muted-foreground">—</p>
      )}
    </CoachCard>
  );
}

function DemoQuestionCard({
  data,
  reply,
  ui,
}: {
  data: AskUserQuestionData;
  reply: CoachQuestionReplyToolResultPayload;
  ui: CoachDemoCopy["questions"];
}) {
  const questions = data.questions ?? [];
  const answeredCount = questions.length;
  const prosePanelClass = cn(
    COACH_ASSISTANT_PROSE_CLASS,
    "[&_h3:first-of-type]:mt-0",
  );

  return (
    <div className="w-full max-w-[860px] overflow-hidden rounded-overlay border border-border/70 bg-neutral-100/85 text-foreground shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:bg-muted/35 dark:shadow-none">
      <div className="border-b border-border/70 bg-background/80 px-3 py-3 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {ui.title}
          </p>
          <div className="min-w-[160px] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>{ui.answeredCount(answeredCount, questions.length)}</span>
              <span>100%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full rounded-full bg-emerald-500 transition-[width] duration-200" />
            </div>
          </div>
        </div>
      </div>

      <div className="p-2">
        {questions.map((question) => {
          const raw = reply.answers[question.id];
          const selectedValues = Array.isArray(raw) ? raw : raw ? [raw] : [];
          const selectedOptions = question.options.filter((option) =>
            selectedValues.includes(option.value),
          );

          return (
            <div
              key={question.id}
              className={cn(
                prosePanelClass,
                "rounded-control bg-background/65 p-3",
              )}
            >
              <section className="not-prose space-y-4">
                <div className="space-y-1.5">
                  <h3 className="m-0 text-base font-semibold leading-6 tracking-[-0.01em] text-foreground">
                    {question.header}
                  </h3>
                  <p className="m-0 text-sm leading-6 text-muted-foreground">
                    {question.question}
                  </p>
                </div>
                <ul className="m-0 list-none space-y-2.5 p-0">
                  {selectedOptions.map((option) => (
                    <li key={option.value}>
                      <div className="flex items-start gap-3 rounded-surface border border-foreground/20 bg-background px-3.5 py-3 text-sm shadow-[0_1px_0_rgba(15,23,42,0.04)] ring-1 ring-foreground/10 dark:bg-background/80">
                        <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-foreground bg-foreground text-background">
                          <Check className="size-3" />
                        </span>
                        <span className="min-w-0 flex-1 leading-5">
                          <span className="text-[13px] font-semibold text-foreground">
                            {option.label}
                          </span>
                          {option.description ? (
                            <span className="mt-1 block text-[12px] leading-5 text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-border/70 bg-background/85 px-4 py-3 dark:bg-background/70 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-muted-foreground">{ui.answeredBadge}</p>
        <Button type="button" size="sm" disabled className="w-full sm:w-auto">
          {ui.submit}
        </Button>
      </div>
    </div>
  );
}

function WorkoutPane({
  title,
  workout,
  position,
}: {
  title: string;
  workout: PlanWorkoutAdjustmentDraftData["before"];
  position: string;
}) {
  return (
    <div className="min-w-0 rounded-compact bg-background/70 p-3 dark:bg-background/40">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">
        {workout.name || workout.sportType}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {position}
        {workout.scheduledDate ? ` · ${workout.scheduledDate}` : ""}
      </div>
      <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-neutral-100/80 p-2 text-xs leading-5 text-foreground dark:bg-muted/40">
        {workout.text}
      </pre>
    </div>
  );
}

function DemoPlanAdjustmentCard({
  draft,
  ui,
}: {
  draft: PlanWorkoutAdjustmentDraftData;
  ui: CoachDemoCopy["workoutAdjustment"];
}) {
  const applyButton = (
    <Button
      type="button"
      size="sm"
      disabled
      className="w-full shrink-0 sm:w-auto"
    >
      <CheckCircle2 className="mr-1.5 h-4 w-4" />
      {ui.apply}
    </Button>
  );

  return (
    <CoachCard
      tone="info"
      icon={<PencilLine className="h-4 w-4" />}
      title={draft.title}
      subtitle={draft.reason}
      footer={applyButton}
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <WorkoutPane
          title={ui.before}
          workout={draft.before}
          position={ui.position(draft.before.weekIndex, draft.before.dayIndex)}
        />
        <div className="hidden items-center justify-center text-muted-foreground md:flex">
          <ArrowRight className="h-4 w-4" />
        </div>
        <WorkoutPane
          title={ui.after}
          workout={draft.after}
          position={ui.position(draft.after.weekIndex, draft.after.dayIndex)}
        />
      </div>
      <div className="mt-3 rounded-compact bg-background/70 p-3 dark:bg-background/40">
        <CoachCard.SectionTitle>{ui.changes}</CoachCard.SectionTitle>
        <div className="mt-2 space-y-1.5">
          {draft.changes.map((change, index) => (
            <div key={`${change.field}-${index}`} className="text-xs leading-5">
              <span className="font-medium text-foreground">
                {change.field}
              </span>
              <span className="text-muted-foreground">
                ：{change.before} → {change.after}
              </span>
            </div>
          ))}
        </div>
      </div>
    </CoachCard>
  );
}

function buildPlanGrid(draft: CoachPlanDraftData) {
  const grid: Array<
    Array<Array<{ sportType?: string; text: string; name?: string }>>
  > = Array.from({ length: draft.periodWeeks }, () =>
    Array.from({ length: 7 }, () => []),
  );

  for (const workout of draft.workouts) {
    const wi = workout.weekIndex - 1;
    const di = workout.dayIndex - 1;
    if (wi < 0 || wi >= draft.periodWeeks || di < 0 || di > 6) continue;
    const text = workout.text?.trim();
    if (!text) continue;
    grid[wi]![di]!.push({
      sportType: workout.sportType,
      text,
      name: workout.name,
    });
  }

  return grid;
}

function DemoPlanDraftCalendar({
  draft,
  ui,
}: {
  draft: CoachPlanDraftData;
  ui: CoachDemoCopy["planDraft"];
}) {
  const grid = buildPlanGrid(draft);
  const sessionCount = draft.workouts.filter((w) => w.text?.trim()).length;

  return (
    <div className="relative overflow-hidden rounded-surface bg-neutral-100 shadow-none dark:bg-muted/45">
      <div className="p-2 sm:p-3">
        <div className="overflow-hidden rounded-surface bg-neutral-100 shadow-none dark:bg-muted/45">
          <div className="px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
              <div className="min-w-0 flex-1 text-sm font-semibold leading-snug tracking-tight text-foreground sm:text-[15px]">
                {draft.title}
              </div>
              <p className="inline-flex shrink-0 items-center gap-1.5 rounded-compact bg-neutral-200/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:bg-muted/55">
                {ui.summary(draft.periodWeeks, sessionCount)}
              </p>
            </div>
            {draft.description ? (
              <div className="mt-1.5 min-h-[2lh] text-sm leading-snug text-muted-foreground">
                {draft.description}
              </div>
            ) : null}
          </div>
          <div className="max-h-[min(42vh,320px)] overflow-auto">
            <div className="w-full min-w-0 px-px pb-px">
              <div className="flex w-full min-w-0 flex-col gap-px bg-neutral-300/35 dark:bg-white/[0.08]">
                <div className="sticky top-0 z-10 grid min-w-0 grid-cols-8 gap-px text-xs">
                  <div className="min-w-0 bg-background p-1.5 font-medium text-muted-foreground sm:p-2">
                    {ui.weekColumn}
                  </div>
                  {ui.weekdays.map((label) => (
                    <div
                      key={label}
                      className="min-w-0 bg-background p-1.5 text-center font-medium text-muted-foreground sm:p-2"
                    >
                      {label}
                    </div>
                  ))}
                </div>
                {grid.map((weekRow, weekIndex) => (
                  <div
                    key={weekIndex}
                    className="grid min-w-0 grid-cols-8 gap-px"
                  >
                    <div className="min-w-0 bg-background p-1.5 text-xs font-medium text-muted-foreground sm:p-2">
                      {ui.weekLabel(weekIndex + 1)}
                    </div>
                    {weekRow.map((cell, dayIndex) => {
                      const filled = cell.length > 0;
                      return (
                        <div
                          key={dayIndex}
                          className={cn(
                            "flex min-h-[64px] min-w-0 flex-col p-1.5 text-left sm:min-h-[72px] sm:p-2",
                            filled
                              ? "bg-background"
                              : "bg-background/90 dark:bg-background/80",
                          )}
                        >
                          {filled ? (
                            <div className="flex min-h-0 flex-1 flex-col gap-1">
                              {cell.map((workout, workoutIndex) => (
                                <div
                                  key={workoutIndex}
                                  className="rounded-compact bg-neutral-200/70 px-1.5 py-1 dark:bg-muted/50"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      {workout.sportType ?? "RUN"}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 break-words text-[11px] leading-snug text-foreground sm:text-xs">
                                    {workout.text}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/70">
                              {ui.restLabel}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            size="sm"
            disabled
            className="w-full shrink-0 sm:w-auto"
          >
            {ui.createPlan}
          </Button>
        </div>
      </div>
    </div>
  );
}

function renderAssistantPart(
  part: CoachDemoAssistantPart,
  copy: CoachDemoCopy,
  index: number,
) {
  switch (part.type) {
    case "text":
      return <DemoAssistantText key={`text-${index}`} text={part.text} />;
    case "readCards":
      return (
        <div key={`read-${index}`} className="space-y-2">
          {part.cards.map((card, cardIndex) => (
            <DemoReadToolCard
              key={`${card.name}-${cardIndex}`}
              card={card}
              toggleLabel={copy.readCards.toggleDetails}
            />
          ))}
        </div>
      );
    case "question":
      return (
        <DemoQuestionCard
          key={`question-${index}`}
          data={part.data}
          reply={part.reply}
          ui={copy.questions}
        />
      );
    case "planAdjustment":
      return (
        <DemoPlanAdjustmentCard
          key={`adjust-${index}`}
          draft={part.data}
          ui={copy.workoutAdjustment}
        />
      );
    case "planDraft":
      return (
        <DemoPlanDraftCalendar
          key={`draft-${index}`}
          draft={part.data}
          ui={copy.planDraft}
        />
      );
    default:
      return null;
  }
}

/** 镜像 client AuiAssistantMessage：Reasoning → Text → CoachV2AssistantCards */
export function DemoAssistantMessage({
  parts,
  copy,
}: {
  parts: CoachDemoAssistantPart[];
  copy: CoachDemoCopy;
}) {
  return (
    <div className="group flex justify-start gap-3">
      <div className="max-w-[860px] flex-1 space-y-3 text-foreground">
        {parts.map((part, index) => renderAssistantPart(part, copy, index))}
      </div>
    </div>
  );
}
