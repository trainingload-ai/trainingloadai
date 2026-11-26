import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { CoachDemoCopy, CoachDemoSession } from "./types";

export function useCoachDemoCopy(): CoachDemoCopy {
  const t = useTranslations("home.demo.coach");

  return useMemo(() => {
    const weekdays = t.raw("planDraft.weekdays") as string[];
    return {
      review: t("review"),
      history: t("history"),
      newChat: t("newChat"),
      today: t("today"),
      yesterday: t("yesterday"),
      past: t("past"),
      composerHint: t("composerHint"),
      thinking: t("thinking"),
      send: t("send"),
      questions: {
        title: t("questions.title"),
        answeredBadge: t("questions.answeredBadge"),
        submit: t("questions.submit"),
        answeredCount: (answered, total) =>
          t("questions.answeredCount", { answered, total }),
      },
      readCards: {
        toggleDetails: t("readCards.toggleDetails"),
      },
      workoutAdjustment: {
        before: t("workoutAdjustment.before"),
        after: t("workoutAdjustment.after"),
        apply: t("workoutAdjustment.apply"),
        changes: t("workoutAdjustment.changes"),
        position: (week, day) =>
          t("workoutAdjustment.position", {
            week,
            day,
            weekday: weekdays[day - 1] ?? day,
          }),
      },
      planDraft: {
        weekColumn: t("planDraft.weekColumn"),
        weekdays,
        weekLabel: (week) => t("planDraft.weekLabel", { week }),
        restLabel: t("planDraft.restLabel"),
        summary: (weeks, sessions) => t("planDraft.summary", { weeks, sessions }),
        createPlan: t("planDraft.createPlan"),
      },
      sessions: t.raw("sessions") as CoachDemoSession[],
    };
  }, [t]);
}
