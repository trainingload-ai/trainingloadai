"use client";

import { useMemo, useState } from "react";

import { resolveDemoCopy } from "@/lib/demo-i18n";

import {
  buildHomeDayPlanFixture,
  HOME_DEMO_ISO_DATE,
  homeDayDemoCopy,
  type HomeDaySourceCopy,
} from "./copy";
import {
  HomeDayDemoCoachCard,
  HomeDayDemoHeader,
  HomeDayDemoOverview,
  HomeDayDemoUploadDesktop,
  HomeDayDemoUploadMobile,
  HomeDayDemoWeekContext,
  HomeDayDemoWorkoutTimeline,
  shiftDemoDate,
} from "./home-day-demo-panels";
import type { DayPlanDemoData } from "./types";

const weekdayShortByLang: Record<string, Record<string, string>> = {
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  zh: { mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日" },
  "zh-hant": { mon: "週一", tue: "週二", wed: "週三", thu: "週四", fri: "週五", sat: "週六", sun: "週日" },
  ja: { mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" },
  de: { mon: "Mo", tue: "Di", wed: "Mi", thu: "Do", fri: "Fr", sat: "Sa", sun: "So" },
  es: { mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" },
  fr: { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu", fri: "Ven", sat: "Sam", sun: "Dim" },
  it: { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Gio", fri: "Ven", sat: "Sab", sun: "Dom" },
  ko: { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" },
  "pt-BR": { mon: "Seg", tue: "Ter", wed: "Qua", thu: "Qui", fri: "Sex", sat: "Sáb", sun: "Dom" },
};

function buildPlanFromSource(
  source: HomeDaySourceCopy,
  lang: string,
  dateKey: string,
  coachTitle: string,
): DayPlanDemoData {
  const weekdayShort = weekdayShortByLang[lang] ?? weekdayShortByLang.en;
  const base = buildHomeDayPlanFixture({
    cycle: source.currentPlan.cycle,
    weekLabel: source.currentPlan.weekLabel,
    intent: source.currentPlan.todayFocus,
    coachTitle,
    coachBody: source.today.summary,
    coachTags: source.today.tags,
    askCoach: source.today.askCoach,
    workout: {
      title: source.todayExecution.workoutTitle,
      status: source.todayExecution.status,
      sport: source.todayExecution.sport,
      duration: source.todayExecution.duration,
      focus: source.todayExecution.focus,
      linked: source.todayExecution.linked,
      session: "1",
    },
    weekdayShort,
  });

  if (dateKey === HOME_DEMO_ISO_DATE) {
    return base;
  }

  return {
    ...base,
    date: dateKey,
    summary: {
      plannedLoad: 0,
      completedLoad: 0,
      plannedDuration: "--",
      completedCount: 0,
      totalCount: 0,
    },
    workouts: [],
    weekContext: base.weekContext.map((item) => ({ ...item, load: 0, active: false })),
  };
}

export function HomeDayDemoApp({
  lang,
  sourceCopy,
  onBackHome,
  initialDateKey = HOME_DEMO_ISO_DATE,
}: {
  lang: string;
  sourceCopy: HomeDaySourceCopy;
  onBackHome?: () => void;
  initialDateKey?: string;
}) {
  const copy = resolveDemoCopy(homeDayDemoCopy, lang);
  const [dateKey, setDateKey] = useState(initialDateKey);

  const dayPlanData = useMemo(
    () =>
      buildPlanFromSource(sourceCopy, lang, dateKey, copy.coachTitle),
    [sourceCopy, lang, dateKey, copy.coachTitle],
  );

  const completedPercent = dayPlanData.summary.plannedLoad
    ? Math.round(
        (dayPlanData.summary.completedLoad / dayPlanData.summary.plannedLoad) *
          100,
      )
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 md:gap-3">
      <HomeDayDemoHeader
        copy={copy}
        dayPlanData={dayPlanData}
        onBackHome={onBackHome}
        onPreviousDay={() => setDateKey((current) => shiftDemoDate(current, -1))}
        onNextDay={() => setDateKey((current) => shiftDemoDate(current, 1))}
      />

      <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-3">
        <div className="order-1 min-w-0 md:col-start-2 md:row-start-1 md:order-none">
          <HomeDayDemoCoachCard dayPlanData={dayPlanData} />
        </div>
        <div className="order-2 min-w-0 md:col-start-2 md:row-start-2 md:order-none">
          <HomeDayDemoWeekContext copy={copy} dayPlanData={dayPlanData} />
        </div>
        <div className="order-3 md:hidden">
          <HomeDayDemoUploadMobile copy={copy} disabled />
        </div>
        <main className="order-4 flex min-w-0 flex-col gap-2 md:col-start-1 md:row-span-3 md:row-start-1 md:gap-3 md:order-none">
          <HomeDayDemoOverview
            copy={copy}
            dayPlanData={dayPlanData}
            completedPercent={completedPercent}
          />
          <HomeDayDemoWorkoutTimeline copy={copy} dayPlanData={dayPlanData} />
        </main>
        <div className="order-5 min-w-0 md:col-start-2 md:row-start-3 md:order-none">
          <HomeDayDemoUploadDesktop copy={copy} disabled />
        </div>
      </div>
    </div>
  );
}
