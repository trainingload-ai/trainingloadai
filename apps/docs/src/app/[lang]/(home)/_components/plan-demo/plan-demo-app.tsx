"use client";

import { useMemo, useState } from "react";

import { resolveDemoCopy } from "@/lib/demo-i18n";

import { useDemoSubView } from "../home-demo/shared/use-demo-sub-view";
import {
  buildHomeDaySourceCopy,
  HOME_DEMO_ISO_DATE,
} from "../home-day-demo/copy";
import { HomeDayDemoApp } from "../home-day-demo/home-day-demo-app";

import { planDemoCopy } from "./copy";
import {
  PlanDemoCoachAdvice,
  PlanDemoHeader,
  PlanDemoTodayWorkout,
  PlanDemoWeekGoal,
  PlanDemoWeekLoadMap,
  PlanDemoWeekStrip,
  PlanDemoWorkoutList,
} from "./plan-demo-panels";
import type { PlanDemoCopy } from "./types";

export function PlanDemoApp({
  lang,
  interactive = false,
}: {
  lang: string;
  interactive?: boolean;
}) {
  const copy = resolveDemoCopy(planDemoCopy, lang);
  const { view, openDay, goMain } = useDemoSubView({ lang, interactive });
  const [selectedWeek, setSelectedWeek] = useState(copy.payload.selectedWeek);
  const [dayDateKey, setDayDateKey] = useState(HOME_DEMO_ISO_DATE);
  const sourceCopy = useMemo(() => buildHomeDaySourceCopy(lang), [lang]);

  const displayCopy = useMemo<PlanDemoCopy>(
    () => ({
      ...copy,
      payload: {
        ...copy.payload,
        selectedWeek,
      },
    }),
    [copy, selectedWeek],
  );

  const openWorkoutDay = (isoDate: string) => {
    setDayDateKey(isoDate);
    openDay();
  };

  const openToday = () => {
    const isoDate =
      displayCopy.payload.todayWorkout?.isoDate ?? HOME_DEMO_ISO_DATE;
    openWorkoutDay(isoDate);
  };

  if (view === "day" && interactive) {
    return (
      <HomeDayDemoApp
        lang={lang}
        sourceCopy={sourceCopy}
        initialDateKey={dayDateKey}
        onBackHome={goMain}
      />
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 bg-background pb-3 md:gap-4">
      <PlanDemoHeader copy={displayCopy} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4">
        <main className="flex min-h-0 flex-col gap-4">
          <PlanDemoWeekStrip
            copy={displayCopy}
            interactive={interactive}
            onSelectWeek={setSelectedWeek}
          />
          <PlanDemoWeekLoadMap copy={displayCopy} />
          <PlanDemoWorkoutList
            copy={displayCopy}
            interactive={interactive}
            onOpenWorkout={(workout) => openWorkoutDay(workout.isoDate)}
          />
        </main>
        <aside className="flex min-h-0 flex-col gap-3">
          <PlanDemoTodayWorkout
            copy={displayCopy}
            interactive={interactive}
            onOpenToday={openToday}
          />
          <PlanDemoWeekGoal copy={displayCopy} />
          <PlanDemoCoachAdvice copy={displayCopy} />
        </aside>
      </div>
    </div>
  );
}
