"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, PencilLine, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  AskUserQuestionData,
  AskUserQuestionItem,
  AskUserQuestionOption,
} from "@shared/ai-coach-schema";

export type CoachQuestionOption = AskUserQuestionOption;
export type CoachQuestionItem = AskUserQuestionItem;

/** 与 `ask_user_question` 落库 JSON 一致，供 hydrate / 回复拼装使用 */
export type CoachQuestionPrompt = AskUserQuestionData;

type CoachQuestionCardProps = {
  prompt: CoachQuestionPrompt;
  disabled?: boolean;
  onSubmit: (payload: {
    answers: Record<string, string | string[]>;
    notes: Record<string, string>;
    skippedQuestionIds: string[];
  }) => void;
  onSkip: () => void;
  onDismiss?: () => void;
};

function isQuestionAnswered(
  question: CoachQuestionItem,
  selections: Record<string, string[]>,
  notes: Record<string, string>,
) {
  const picked = selections[question.id] ?? [];
  return (
    Boolean(notes[question.id]?.trim()) ||
    (question.multiSelect ? picked.length > 0 : picked.length === 1)
  );
}

export function CoachQuestionCard({
  prompt,
  disabled,
  onSubmit,
  onSkip,
  onDismiss,
}: CoachQuestionCardProps) {
  const t = useTranslations("AiCoachPage.questions");
  const instanceId = useId();
  const questions = prompt.questions ?? [];
  const multi = questions.length > 1;

  const [activeIndex, setActiveIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousIndex = useRef(activeIndex);
  useEffect(() => {
    if (previousIndex.current !== activeIndex) {
      headingRef.current?.focus({ preventScroll: true });
      previousIndex.current = activeIndex;
    }
  }, [activeIndex]);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<string[]>([]);

  const activeQuestion = questions[activeIndex] ?? questions[0];
  const isFirstQuestion = activeIndex === 0;
  const isLastQuestion = activeIndex === questions.length - 1;

  const completedCount = useMemo(
    () =>
      questions.reduce(
        (count, question) =>
          count +
          (isQuestionAnswered(question, selections, notes) ||
          skippedQuestionIds.includes(question.id)
            ? 1
            : 0),
        0,
      ),
    [questions, selections, notes, skippedQuestionIds],
  );

  const canAdvance = activeQuestion
    ? isQuestionAnswered(activeQuestion, selections, notes) ||
      skippedQuestionIds.includes(activeQuestion.id)
    : false;
  const canSubmit = questions.length > 0 && completedCount === questions.length;

  const toggleOption = (
    questionId: string,
    value: string,
    multiSelect: boolean,
  ) => {
    setSkippedQuestionIds((prev) => prev.filter((id) => id !== questionId));
    setSelections((prev) => {
      const current = prev[questionId] ?? [];
      if (!multiSelect) return { ...prev, [questionId]: [value] };
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, [questionId]: next };
    });
  };

  const submitCompletedQuestions = (skippedIds = skippedQuestionIds) => {
    const answers: Record<string, string | string[]> = {};
    const notesOut: Record<string, string> = {};
    for (const question of questions) {
      if (skippedIds.includes(question.id)) continue;
      const picked = selections[question.id] ?? [];
      answers[question.id] = question.multiSelect ? picked : (picked[0] ?? "");
      notesOut[question.id] = notes[question.id] ?? "";
    }
    onSubmit({
      answers,
      notes: notesOut,
      skippedQuestionIds: skippedIds,
    });
  };

  const handleSubmit = () => {
    if (!canSubmit || disabled) return;
    submitCompletedQuestions();
  };

  const handleSkipCurrent = () => {
    if (disabled) return;
    const questionId = activeQuestion.id;
    const nextSkippedIds = Array.from(
      new Set([...skippedQuestionIds, questionId]),
    );
    setSkippedQuestionIds(nextSkippedIds);
    setSelections((prev) => ({ ...prev, [questionId]: [] }));
    setNotes((prev) => ({ ...prev, [questionId]: "" }));
    if (!isLastQuestion) {
      setActiveIndex((current) => current + 1);
      return;
    }
    if (nextSkippedIds.length === questions.length) {
      onSkip();
      return;
    }
    submitCompletedQuestions(nextSkippedIds);
  };

  if (!activeQuestion) return null;

  const activeSelections = selections[activeQuestion.id] ?? [];

  return (
    <section
      data-coach-question
      aria-labelledby={`${instanceId}-question-title`}
      className={cn(
        "not-prose w-full bg-muted/45 text-foreground",
        !onDismiss && "rounded-md",
      )}
    >
      <header className="flex items-start gap-3 px-4 pb-2 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <h3
            ref={headingRef}
            id={`${instanceId}-question-title`}
            tabIndex={-1}
            className="m-0 text-sm font-normal leading-6 text-foreground outline-none"
          >
            {activeQuestion.question}
          </h3>
          {activeQuestion.multiSelect ? (
            <p className="m-0 text-xs leading-5 text-muted-foreground">
              {t("multiHint")}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 pt-0.5 text-mobile-caption pc:text-xs tabular-nums text-muted-foreground">
          {activeIndex + 1} / {questions.length}
        </span>
        {onDismiss ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("dismissAnswering")}
            title={t("dismissAnswering")}
            className="-mr-1 -mt-0.5 size-7 shrink-0 rounded-full"
            onClick={onDismiss}
          >
            <X aria-hidden className="size-4" />
          </Button>
        ) : null}
      </header>

      <div className="px-4 sm:px-5">
        <ul
          aria-label={activeQuestion.question}
          className="m-0 list-none space-y-0.5 p-0"
        >
          {activeQuestion.options.map((option, optionIndex) => {
            const checked = activeSelections.includes(option.value);
            const id = `${instanceId}-coach-q-${activeQuestion.id}-${option.value}`;
            const inputType = activeQuestion.multiSelect ? "checkbox" : "radio";

            return (
              <li key={option.value}>
                <Label
                  htmlFor={id}
                  className={cn(
                    "group relative flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm font-normal transition-colors focus-within:bg-background/70 dark:focus-within:bg-background/45",
                    checked
                      ? "bg-background dark:bg-background/55"
                      : "hover:bg-background/60 dark:hover:bg-background/35",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    id={id}
                    type={inputType}
                    name={`${instanceId}-coach-q-${activeQuestion.id}`}
                    checked={checked}
                    disabled={disabled}
                    onChange={() =>
                      toggleOption(
                        activeQuestion.id,
                        option.value,
                        Boolean(activeQuestion.multiSelect),
                      )
                    }
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full text-xs tabular-nums transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                      checked
                        ? "bg-foreground text-background"
                        : "bg-background/80 text-muted-foreground dark:bg-background/50",
                      activeQuestion.multiSelect && "rounded-sm",
                    )}
                  >
                    {checked ? (
                      <Check className="size-3" strokeWidth={2.5} />
                    ) : (
                      optionIndex + 1
                    )}
                  </span>
                  <span className="min-w-0 flex-1 leading-5">
                    <span className="text-sm font-normal text-foreground">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground sm:ml-2 sm:mt-0 sm:inline">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </Label>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="mx-4 flex flex-wrap items-end gap-x-2 gap-y-1 py-2 sm:mx-5">
        <div className="relative min-w-24 flex-1">
          <PencilLine
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-2 size-5 rounded-full bg-muted p-1 text-muted-foreground"
          />
          <Textarea
            id={`${instanceId}-coach-q-${activeQuestion.id}-note`}
            aria-label={t("noteLabel")}
            value={notes[activeQuestion.id] ?? ""}
            disabled={disabled}
            rows={1}
            onChange={(event) => {
              setSkippedQuestionIds((prev) =>
                prev.filter((id) => id !== activeQuestion.id),
              );
              setNotes((prev) => ({
                ...prev,
                [activeQuestion.id]: event.target.value,
              }));
            }}
            placeholder={t("notePlaceholder")}
            className="min-h-9 max-h-24 resize-none rounded-sm border-0 bg-transparent py-2 pl-8 pr-1 text-sm leading-5 shadow-none focus-visible:ring-inset"
          />
        </div>
        <div className="ml-auto flex min-h-9 items-center gap-2">
          {multi && !isFirstQuestion ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("back")}
              title={t("back")}
              className="rounded-full text-muted-foreground"
              disabled={disabled}
              onClick={() => setActiveIndex((current) => current - 1)}
            >
              <ChevronLeft aria-hidden className="size-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={handleSkipCurrent}
            className="rounded-full bg-background/80 px-3.5 text-xs font-normal shadow-none dark:bg-background/45"
          >
            {t("skip")}
          </Button>

          {multi && !isLastQuestion ? (
            <Button
              type="button"
              size="sm"
              className="rounded-full px-3.5 text-xs font-normal"
              disabled={disabled || !canAdvance}
              onClick={() => setActiveIndex((current) => current + 1)}
            >
              {t("next")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="rounded-full px-3.5 text-xs font-normal"
              disabled={disabled || !canSubmit}
              onClick={handleSubmit}
            >
              {multi ? t("submitAll") : t("submit")}
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}
