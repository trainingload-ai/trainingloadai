"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronRight, MinusCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CoachQuestionReplyToolResultPayload } from "./coach-message-meta";
import type { CoachQuestionPrompt } from "./coach-question-card";

type CoachQuestionAnsweredViewProps = {
  /** skip 时可省略 */
  prompt?: CoachQuestionPrompt | null;
  reply: CoachQuestionReplyToolResultPayload;
  className?: string;
};

export function CoachQuestionAnsweredView({
  prompt,
  reply,
  className,
}: CoachQuestionAnsweredViewProps) {
  const t = useTranslations("AiCoachPage.questions");

  if (reply.kind === "coach_question_skip") {
    return (
      <div
        className={cn(
          "not-prose flex w-full items-center gap-2 py-1 text-sm text-muted-foreground",
          className,
        )}
      >
        <MinusCircle aria-hidden="true" className="size-4 shrink-0" />
        <span>{t("answeredSkipped")}</span>
      </div>
    );
  }

  const { answers, notes } = reply;
  const questions = prompt?.questions ?? [];
  if (questions.length === 0) return null;

  const sectionNames = questions
    .map((question) => question.header.trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <details open className={cn("group not-prose w-full", className)}>
      <summary className="flex w-fit max-w-full cursor-pointer list-none items-center gap-2 rounded-sm py-1 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <CheckCircle2
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="shrink-0">{t("confirmed")}</span>
        {sectionNames ? (
          <span className="min-w-0 truncate">· {sectionNames}</span>
        ) : null}
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
        />
      </summary>

      <ol className="m-0 ml-6 mt-2 list-none space-y-4 rounded-md bg-muted/45 p-4">
        {questions.map((question, index) => {
          const skipped = reply.skippedQuestionIds?.includes(question.id);
          const raw = answers[question.id];
          const picked = Array.isArray(raw) ? raw : raw ? [raw] : [];
          const note = (notes[question.id] ?? "").trim();
          const selectedLabels = question.options
            .filter((option) => picked.includes(option.value))
            .map((option) => option.label);

          return (
            <li key={question.id} className="flex items-start gap-2.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-background/80 text-xs tabular-nums text-muted-foreground dark:bg-background/45">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-normal leading-5 text-foreground">
                  {question.question}
                </p>
                <p className="m-0 mt-0.5 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  {skipped ? t("answeredSkipped") : selectedLabels.join(" · ")}
                </p>
                {note ? (
                  <p className="m-0 mt-0.5 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                    {t("noteLabel")}：{note}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
