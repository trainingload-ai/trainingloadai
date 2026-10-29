import {
  Activity,
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Flag,
  Gauge,
  HeartPulse,
  MoonStar,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlanScheduleViewTracker } from "@/components/PlanScheduleViewTracker";
import { WorkoutStructurePreview } from "@/components/WorkoutStructurePreview";
import { withLocalePath } from "@/lib/locale-url";
import { getRpeScaleContent, RPE_SCALE_PATH } from "@/lib/rpe-scale-content";
import type {
  LocalizedRunningPlanSchedule,
  RunningPlanDayKind,
} from "@/lib/running-plan-schedules";

const dayStyles: Record<
  RunningPlanDayKind,
  { card: string; icon: string; glyph: string; badge: string }
> = {
  REST: {
    card: "border-dashed border-neutral-200/80 bg-neutral-50/55 dark:border-white/10 dark:bg-white/[0.025]",
    icon: "bg-neutral-200/70 text-neutral-500 dark:bg-white/10 dark:text-neutral-400",
    glyph: "text-neutral-400 dark:text-neutral-500",
    badge:
      "bg-neutral-200/70 text-neutral-600 dark:bg-white/10 dark:text-neutral-300",
  },
  EASY: {
    card: "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-300/15 dark:bg-emerald-300/[0.06]",
    icon: "bg-emerald-500 text-white dark:bg-emerald-300 dark:text-neutral-950",
    glyph: "text-emerald-600 dark:text-emerald-300",
    badge:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200",
  },
  QUALITY: {
    card: "border-amber-200/90 bg-amber-50/80 dark:border-amber-300/20 dark:bg-amber-300/[0.07]",
    icon: "bg-amber-500 text-white dark:bg-amber-300 dark:text-neutral-950",
    glyph: "text-amber-500 dark:text-amber-300",
    badge:
      "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-100",
  },
  LONG: {
    card: "border-sky-200/90 bg-sky-50/75 dark:border-sky-300/20 dark:bg-sky-300/[0.07]",
    icon: "bg-sky-500 text-white dark:bg-sky-300 dark:text-neutral-950",
    glyph: "text-sky-600 dark:text-sky-300",
    badge: "bg-sky-100 text-sky-900 dark:bg-sky-300/15 dark:text-sky-100",
  },
  RACE: {
    card: "border-violet-300/90 bg-gradient-to-br from-violet-100 via-white to-emerald-50 dark:border-violet-300/25 dark:from-violet-300/15 dark:via-white/[0.04] dark:to-emerald-300/[0.08]",
    icon: "bg-violet-600 text-white dark:bg-violet-300 dark:text-neutral-950",
    glyph: "text-violet-600 dark:text-violet-300",
    badge:
      "bg-violet-200/80 text-violet-950 dark:bg-violet-300/20 dark:text-violet-100",
  },
  OTHER: {
    card: "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]",
    icon: "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-950",
    glyph: "text-neutral-700 dark:text-neutral-300",
    badge:
      "bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-neutral-300",
  },
};

const coachStageIcons = {
  TRACK: ClipboardCheck,
  ASSESS: HeartPulse,
  ADJUST: SlidersHorizontal,
} as const;

function DayIcon({ kind }: { kind: RunningPlanDayKind }) {
  const Icon =
    kind === "REST"
      ? MoonStar
      : kind === "EASY"
        ? Gauge
        : kind === "QUALITY"
          ? Zap
          : kind === "LONG"
            ? Route
            : kind === "RACE"
              ? Flag
              : Activity;
  return <Icon aria-hidden="true" className="size-3.5" />;
}

function phaseTextTone(phase: string) {
  const normalized = phase.toLowerCase();

  if (/恢复|恢復|回復|recovery/.test(normalized)) {
    return "text-sky-700 dark:text-sky-300";
  }
  if (/峰值|peak|ピーク/.test(normalized)) {
    return "text-violet-700 dark:text-violet-300";
  }
  if (/减量|減量|taper/.test(normalized)) {
    return "text-amber-700 dark:text-amber-300";
  }
  if (/比赛|比賽|race|レース/.test(normalized)) {
    return "text-rose-700 dark:text-rose-300";
  }
  if (/构建|構建|構築|build/.test(normalized)) {
    return "text-teal-700 dark:text-teal-300";
  }
  return "text-emerald-700 dark:text-emerald-300";
}

function phaseSurfaceTone(phase: string) {
  const normalized = phase.toLowerCase();

  if (/恢复|恢復|回復|recovery/.test(normalized)) {
    return "border-t-sky-400 bg-sky-50/70 dark:border-t-sky-400 dark:bg-sky-300/[0.06]";
  }
  if (/峰值|peak|ピーク/.test(normalized)) {
    return "border-t-violet-400 bg-violet-50/70 dark:border-t-violet-400 dark:bg-violet-300/[0.06]";
  }
  if (/减量|減量|taper/.test(normalized)) {
    return "border-t-amber-400 bg-amber-50/70 dark:border-t-amber-400 dark:bg-amber-300/[0.06]";
  }
  if (/比赛|比賽|race|レース/.test(normalized)) {
    return "border-t-rose-400 bg-rose-50/70 dark:border-t-rose-400 dark:bg-rose-300/[0.06]";
  }
  if (/构建|構建|構築|build/.test(normalized)) {
    return "border-t-teal-400 bg-teal-50/70 dark:border-t-teal-400 dark:bg-teal-300/[0.06]";
  }
  return "border-t-emerald-400 bg-emerald-50/70 dark:border-t-emerald-400 dark:bg-emerald-300/[0.06]";
}

function splitWorkout(workout: string) {
  const [headline, ...noteParts] = workout.split(" — ");
  const match = headline.match(/^(.*) · (RPE [^·]+)$/);
  const titleParts = (match?.[1] ?? headline).split(" · ");
  return {
    title: titleParts[0],
    prescription: titleParts.slice(1).join(" · "),
    intensity: match?.[2],
    notes: noteParts.join(" — "),
  };
}

function formatWeekTitle(label: string, week: number) {
  if (label === "第") return `第 ${week} 周`;
  if (label === "週") return `${week} 週`;
  return `${label} ${week}`;
}

function formatWeekColumnLabel(label: string) {
  if (label === "第") return "周次";
  if (label === "週") return "週次";
  return label;
}

function WeekHeader({
  week,
  weekTitle,
  current,
  total,
  toggleId,
}: {
  week: LocalizedRunningPlanSchedule["weeks"][number];
  weekTitle: string;
  current: number;
  total: number;
  toggleId?: string;
}) {
  const phaseTone = phaseTextTone(week.phase);
  const content = (
    <>
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-overlay bg-neutral-950 text-lg font-black tabular-nums text-white dark:bg-white dark:text-neutral-950">
          {week.week}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-black">{weekTitle}</h3>
          <p className={`mt-0.5 text-sm font-semibold ${phaseTone}`}>
            {week.phase}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-32 sm:w-48">
          <div className="mb-2 flex justify-end text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            <span className="tabular-nums">
              {current}/{total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={weekTitle}
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={current}
            className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
              style={{ width: `${(current / total) * 100}%` }}
            />
          </div>
        </div>
        {toggleId ? (
          <span
            aria-hidden="true"
            className="text-2xl font-light leading-none text-emerald-600 peer-checked:rotate-45 md:hidden dark:text-emerald-300"
          >
            +
          </span>
        ) : null}
      </div>
    </>
  );
  const className =
    "flex flex-col gap-4 border-b border-neutral-200/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/10";

  return toggleId ? (
    <label
      htmlFor={toggleId}
      className={`${className} cursor-pointer md:cursor-default`}
    >
      {content}
    </label>
  ) : (
    <div className={className}>{content}</div>
  );
}

const rpeRangeAnchors = new Set([
  "rpe-1-2",
  "rpe-3-4",
  "rpe-5-6",
  "rpe-7-8",
  "rpe-9",
  "rpe-10",
]);

function rpeGuideHref(lang: string, intensity?: string) {
  const range = intensity
    ?.match(/RPE\s*([0-9]+(?:\s*[–-]\s*[0-9]+)?)/)?.[1]
    ?.replace(/\s/g, "")
    .replace("–", "-");
  const anchor =
    range && rpeRangeAnchors.has(`rpe-${range}`) ? `rpe-${range}` : "rpe-scale";
  return `${withLocalePath(lang, RPE_SCALE_PATH)}#${anchor}`;
}

export function RunningPlanSchedule({
  schedule,
  slug,
  templateSlug,
  lang,
  collapsible = false,
  showOverview = false,
  overviewAfter,
  anchorPrefix = "",
  showGuidance = true,
}: {
  schedule: LocalizedRunningPlanSchedule;
  slug: string;
  templateSlug?: string;
  lang: string;
  collapsible?: boolean;
  showOverview?: boolean;
  overviewAfter?: ReactNode;
  anchorPrefix?: string;
  showGuidance?: boolean;
}) {
  const rpeCopy = getRpeScaleContent(lang);
  return (
    <section
      id={`${anchorPrefix}schedule`}
      className={
        showOverview
          ? "scroll-mt-24 overflow-hidden border-y border-neutral-200/70 bg-neutral-100/70 px-4 py-12 dark:border-white/10 dark:bg-white/[0.025] md:py-16"
          : "scroll-mt-24 overflow-hidden border-y border-neutral-200/70 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_34%),linear-gradient(to_bottom,rgba(255,255,255,0.86),rgba(250,250,250,0.96))] px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.10),transparent_32%),linear-gradient(to_bottom,rgba(10,10,10,0.96),rgba(17,24,39,0.96))]"
      }
    >
      <div className="mx-auto max-w-7xl">
        <PlanScheduleViewTracker
          slug={slug}
          templateSlug={templateSlug}
          weekCount={schedule.weeks.length}
          locale={lang}
        />
        <div className="max-w-3xl">
          <div
            className={
              showOverview
                ? "flex size-11 items-center justify-center rounded-compact bg-neutral-950 text-white dark:bg-emerald-300 dark:text-neutral-950"
                : "flex size-12 items-center justify-center rounded-overlay bg-neutral-950 text-white shadow-lg shadow-emerald-500/10 dark:bg-emerald-300 dark:text-neutral-950"
            }
          >
            <CalendarRange aria-hidden="true" className="size-6" />
          </div>
          <h2
            className={`mt-5 text-balance text-3xl font-black tracking-tight ${
              showOverview ? "md:text-4xl" : "md:text-5xl"
            }`}
          >
            {schedule.title}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {schedule.description}
          </p>
          <Link
            href={rpeGuideHref(lang)}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/80 bg-white/80 px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-emerald-300/20 dark:bg-emerald-300/[0.08] dark:text-emerald-200 dark:hover:bg-emerald-300/[0.12]"
          >
            <BookOpenCheck aria-hidden="true" className="size-4" />
            {rpeCopy.scheduleGuideLabel}
          </Link>
        </div>

        {showOverview ? (
          <div className="mt-8 overflow-x-auto pb-2 [scrollbar-width:thin]">
            <ol
              className="grid min-w-[880px] grid-cols-8 gap-px overflow-hidden rounded-compact border border-neutral-200 bg-neutral-200 dark:border-white/10 dark:bg-white/10"
              aria-label={schedule.tableCaption}
            >
              {schedule.weeks.map((week) => {
                const phaseTone = phaseTextTone(week.phase);
                const phaseSurface = phaseSurfaceTone(week.phase);
                const anchorIndex = week.dayKinds.findIndex(
                  (kind) => kind === "LONG" || kind === "RACE",
                );
                const anchorWorkout = splitWorkout(
                  week.days[Math.max(0, anchorIndex)],
                );
                return (
                  <li
                    key={week.week}
                    className={`min-w-0 border-t-2 ${phaseSurface}`}
                  >
                    <Link
                      href={`#${anchorPrefix}week-${week.week}`}
                      className="group flex min-h-40 flex-col p-3 transition hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:hover:brightness-110"
                    >
                      <span className={`text-[11px] font-black ${phaseTone}`}>
                        {formatWeekTitle(schedule.weekLabel, week.week)}
                      </span>
                      <strong className="mt-5 text-sm leading-tight">
                        {week.phase}
                      </strong>
                      <span className="mt-auto border-t border-neutral-200 pt-3 text-[11px] leading-4 text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                        <b className="block text-xs text-neutral-900 group-hover:text-emerald-800 dark:text-white dark:group-hover:text-emerald-200">
                          {anchorWorkout.prescription || anchorWorkout.title}
                        </b>
                        <span className="mt-1 block truncate">
                          {anchorWorkout.title}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <nav
            aria-label={schedule.tableCaption}
            className="mt-8 flex flex-wrap gap-2"
          >
            {schedule.weeks.map((week) => (
              <Link
                key={week.week}
                href={`#week-${week.week}`}
                className="inline-flex size-10 items-center justify-center rounded-full border border-neutral-300 bg-white text-sm font-black tabular-nums text-neutral-700 transition hover:border-emerald-500 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/15 dark:bg-white/[0.05] dark:text-neutral-200 dark:hover:border-emerald-300 dark:hover:text-emerald-200"
              >
                <span className="sr-only">{schedule.weekLabel} </span>
                {week.week}
              </Link>
            ))}
          </nav>
        )}

        {overviewAfter ? <div className="mt-10">{overviewAfter}</div> : null}

        <ol
          className={showOverview ? "mt-8 space-y-3" : "mt-10 space-y-5"}
          aria-label={schedule.tableCaption}
        >
          {schedule.weeks.map((week, weekIndex) => {
            const detailedDays = week.days
              .map((workout, dayIndex) => ({
                day: schedule.weekdays[dayIndex],
                kind: week.dayKinds[dayIndex] ?? "OTHER",
                structure: week.structures[dayIndex] ?? null,
                ...splitWorkout(workout),
              }))
              .filter((day) => day.kind !== "REST" && day.notes);
            const weekTitle = formatWeekTitle(schedule.weekLabel, week.week);
            const toggleId = collapsible
              ? `${anchorPrefix}${slug}-week-${week.week}-toggle`
              : undefined;

            if (showOverview) {
              return (
                <li
                  key={week.week}
                  id={`${anchorPrefix}week-${week.week}`}
                  data-plan-week={week.week}
                  className="scroll-mt-24 overflow-hidden rounded-compact border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.035]"
                >
                  {toggleId ? (
                    <input
                      id={toggleId}
                      type="checkbox"
                      defaultChecked={weekIndex === 0}
                      aria-label={weekTitle}
                      className="peer sr-only"
                    />
                  ) : null}

                  <label
                    htmlFor={toggleId}
                    className={`grid gap-5 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5 ${
                      toggleId ? "cursor-pointer" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-4">
                      <span className="font-mono text-3xl font-black tracking-[-0.08em] text-neutral-300 tabular-nums dark:text-neutral-700">
                        {String(week.week).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <strong className="block text-base font-black text-neutral-950 dark:text-white">
                          {weekTitle}
                        </strong>
                        <span
                          className={`mt-1 block text-xs font-bold ${phaseTextTone(week.phase)}`}
                        >
                          {week.phase}
                        </span>
                      </span>
                    </span>

                    <span className="flex items-center gap-4">
                      <span className="w-28 sm:w-40">
                        <span className="mb-2 block text-right font-mono text-[10px] font-bold text-neutral-500 tabular-nums dark:text-neutral-400">
                          {weekIndex + 1} / {schedule.weeks.length}
                        </span>
                        <span className="block h-1 overflow-hidden bg-neutral-200 dark:bg-white/10">
                          <span
                            className="block h-full bg-emerald-500"
                            style={{
                              width: `${((weekIndex + 1) / schedule.weeks.length) * 100}%`,
                            }}
                          />
                        </span>
                      </span>
                      {toggleId ? (
                        <ChevronDown
                          aria-hidden="true"
                          className="size-5 text-emerald-700 dark:text-emerald-300"
                        />
                      ) : null}
                    </span>
                  </label>

                  <div
                    className={
                      collapsible ? "hidden peer-checked:block" : undefined
                    }
                  >
                    <ol className="grid grid-cols-7 border-y border-neutral-200 dark:border-white/10">
                      {week.days.map((workout, dayIndex) => {
                        const kind = week.dayKinds[dayIndex] ?? "OTHER";
                        const content = splitWorkout(workout);
                        const tone = dayStyles[kind];
                        return (
                          <li
                            key={`${week.week}-${schedule.weekdays[dayIndex]}-rhythm`}
                            title={`${schedule.weekdays[dayIndex]}: ${content.title}`}
                            className="flex min-w-0 flex-col items-center gap-2 border-r border-neutral-200 px-1 py-3 text-center last:border-r-0 dark:border-white/10"
                          >
                            <span className="max-w-full truncate text-[10px] font-bold text-neutral-500 dark:text-neutral-400">
                              {schedule.weekdays[dayIndex]}
                            </span>
                            <span
                              className={`flex size-6 items-center justify-center ${tone.glyph}`}
                            >
                              <DayIcon kind={kind} />
                            </span>
                          </li>
                        );
                      })}
                    </ol>

                    {detailedDays.length > 0 ? (
                      <section
                        aria-labelledby={`${anchorPrefix}${slug}-week-${week.week}-details`}
                        className="px-4 py-2 md:px-5"
                      >
                        <h4
                          id={`${anchorPrefix}${slug}-week-${week.week}-details`}
                          className="sr-only"
                        >
                          {schedule.weekDetailsLabel}
                        </h4>
                        <ol className="divide-y divide-neutral-200 dark:divide-white/10">
                          {detailedDays.map((day) => {
                            const tone = dayStyles[day.kind];
                            return (
                              <li
                                key={`${week.week}-${day.day}-details`}
                                className="grid gap-3 py-4 md:grid-cols-[5.5rem_minmax(0,1fr)_12rem] md:items-center"
                              >
                                <div className="flex items-center gap-3 md:block">
                                  <span
                                    className={`flex size-7 shrink-0 items-center justify-center ${tone.glyph}`}
                                  >
                                    <DayIcon kind={day.kind} />
                                  </span>
                                  <span className="md:mt-2 md:block">
                                    <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                                      {day.day}
                                    </span>
                                    {day.intensity ? (
                                      <Link
                                        href={rpeGuideHref(lang, day.intensity)}
                                        prefetch={false}
                                        aria-label={`${day.intensity}: ${rpeCopy.intensityLinkLabel}`}
                                        className="mt-1 inline-flex text-[10px] font-black text-emerald-700 tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
                                      >
                                        {day.intensity}
                                      </Link>
                                    ) : null}
                                  </span>
                                </div>

                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <h5 className="font-black text-neutral-950 dark:text-white">
                                      {day.title}
                                    </h5>
                                    {day.prescription ? (
                                      <span className="font-mono text-xs font-bold text-neutral-500 dark:text-neutral-400">
                                        {day.prescription}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                                    {day.notes}
                                  </p>
                                </div>

                                <div className="w-full md:w-48 md:max-w-none md:justify-self-end">
                                  <WorkoutStructurePreview
                                    structure={day.structure}
                                    lang={lang}
                                    compact
                                  />
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </section>
                    ) : null}
                  </div>
                </li>
              );
            }

            return (
              <li
                key={week.week}
                id={`${anchorPrefix}week-${week.week}`}
                data-plan-week={week.week}
                className={
                  showOverview
                    ? "scroll-mt-24 overflow-hidden rounded-compact border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]"
                    : "scroll-mt-24 overflow-hidden rounded-feature border border-neutral-200/80 bg-white/80 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.045]"
                }
              >
                {toggleId ? (
                  <input
                    id={toggleId}
                    type="checkbox"
                    defaultChecked={weekIndex === 0}
                    aria-label={weekTitle}
                    className="peer sr-only md:hidden"
                  />
                ) : null}
                <WeekHeader
                  week={week}
                  weekTitle={weekTitle}
                  current={weekIndex + 1}
                  total={schedule.weeks.length}
                  toggleId={toggleId}
                />

                <div
                  className={
                    collapsible
                      ? "hidden peer-checked:block md:block"
                      : undefined
                  }
                >
                  <div className="grid grid-cols-2 gap-2.5 p-3 sm:p-5 md:grid-cols-4 lg:grid-cols-7">
                    {week.days.map((workout, dayIndex) => {
                      const kind = week.dayKinds[dayIndex] ?? "OTHER";
                      const content = splitWorkout(workout);
                      const styles = dayStyles[kind];
                      return (
                        <article
                          key={`${week.week}-${schedule.weekdays[dayIndex]}`}
                          className={`min-w-0 rounded-overlay border p-3.5 ${styles.card}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                              {schedule.weekdays[dayIndex]}
                            </p>
                            <span
                              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${styles.icon}`}
                            >
                              <DayIcon kind={kind} />
                            </span>
                          </div>
                          <h4 className="mt-5 break-words text-sm font-black leading-snug text-neutral-950 dark:text-white">
                            {content.title}
                          </h4>
                          {content.prescription ? (
                            <p className="mt-2 break-words text-xs font-semibold leading-5 text-neutral-600 dark:text-neutral-300">
                              {content.prescription}
                            </p>
                          ) : null}
                          {content.intensity ? (
                            <Link
                              href={rpeGuideHref(lang, content.intensity)}
                              prefetch={false}
                              aria-label={`${content.intensity}: ${rpeCopy.intensityLinkLabel}`}
                              className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black tabular-nums ${styles.badge}`}
                            >
                              {content.intensity}
                            </Link>
                          ) : null}
                          {kind !== "REST" ? (
                            <WorkoutStructurePreview
                              structure={week.structures[dayIndex]}
                              lang={lang}
                              compact
                            />
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  {detailedDays.length > 0 ? (
                    <section className="border-t border-neutral-200/80 px-5 py-5 dark:border-white/10">
                      <h4 className="text-sm font-black text-neutral-950 dark:text-white">
                        {schedule.weekDetailsLabel}
                      </h4>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {detailedDays.map((day) => {
                          const styles = dayStyles[day.kind];
                          return (
                            <article
                              key={`${week.week}-${day.day}-details`}
                              className={`rounded-overlay border p-4 ${styles.card}`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`flex size-7 shrink-0 items-center justify-center rounded-full ${styles.icon}`}
                                >
                                  <DayIcon kind={day.kind} />
                                </span>
                                <p className="text-xs font-black uppercase tracking-[0.12em] text-neutral-600 dark:text-neutral-300">
                                  {day.day}
                                </p>
                                {day.intensity ? (
                                  <Link
                                    href={rpeGuideHref(lang, day.intensity)}
                                    prefetch={false}
                                    aria-label={`${day.intensity}: ${rpeCopy.intensityLinkLabel}`}
                                    className={`rounded-full px-2 py-1 text-[10px] font-black tabular-nums ${styles.badge}`}
                                  >
                                    {day.intensity}
                                  </Link>
                                ) : null}
                              </div>
                              <h5 className="mt-3 font-black text-neutral-950 dark:text-white">
                                {day.title}
                              </h5>
                              {day.prescription ? (
                                <p className="mt-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                                  {day.prescription}
                                </p>
                              ) : null}
                              <WorkoutStructurePreview
                                structure={day.structure}
                                lang={lang}
                              />
                              <p className="mt-3 text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                                {day.notes}
                              </p>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {showGuidance && (
          <>
            {schedule.coachFlow ? (
              <section
                className={
                  showOverview
                    ? "mt-8 border-y border-neutral-200 bg-white px-5 py-7 dark:border-white/10 dark:bg-white/[0.035] md:px-6"
                    : "mt-8 rounded-feature border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-6 dark:border-emerald-300/15 dark:from-emerald-300/[0.08] dark:via-white/[0.04] dark:to-sky-300/[0.06] md:p-8"
                }
              >
                <div className="max-w-3xl">
                  <h3 className="text-balance text-2xl font-black">
                    {schedule.coachFlow.title}
                  </h3>
                  <p className="mt-2 text-pretty text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                    {schedule.coachFlow.summary}
                  </p>
                </div>
                <ol
                  className={
                    showOverview
                      ? "mt-6 grid border-l border-t border-neutral-200 lg:grid-cols-3 dark:border-white/10"
                      : "mt-6 grid gap-3 lg:grid-cols-3"
                  }
                >
                  {schedule.coachFlow.stages.map((stage) => {
                    const StageIcon = coachStageIcons[stage.id];
                    return (
                      <li
                        key={stage.id}
                        className={
                          showOverview
                            ? "border-b border-r border-neutral-200 p-5 dark:border-white/10"
                            : "rounded-overlay border border-white/80 bg-white/75 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.05]"
                        }
                      >
                        <StageIcon
                          aria-hidden="true"
                          className="size-5 text-emerald-600 dark:text-emerald-300"
                        />
                        <h4 className="mt-3 font-black">{stage.title}</h4>
                        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                          {stage.description}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}

            <div
              className={
                showOverview
                  ? "grid border-b border-neutral-200 bg-white lg:grid-cols-2 dark:border-white/10 dark:bg-white/[0.035]"
                  : "mt-10 grid gap-4 lg:grid-cols-2"
              }
            >
              <article
                className={
                  showOverview
                    ? "border-b border-neutral-200 p-6 lg:border-b-0 lg:border-r dark:border-white/10"
                    : "rounded-overlay border border-neutral-200 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                }
              >
                <BookOpenCheck
                  aria-hidden="true"
                  className="size-5 text-emerald-600 dark:text-emerald-300"
                />
                <h3 className="mt-4 text-xl font-black">
                  {schedule.effortTitle}
                </h3>
                <dl className="mt-5 space-y-4">
                  {schedule.effortItems.map(([term, detail]) => (
                    <div key={term}>
                      <dt className="font-bold">{term}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                        {detail}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>

              <article
                className={
                  showOverview
                    ? "p-6"
                    : "rounded-overlay border border-neutral-200 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                }
              >
                <ShieldCheck
                  aria-hidden="true"
                  className="size-5 text-emerald-600 dark:text-emerald-300"
                />
                <h3 className="mt-4 text-xl font-black">
                  {schedule.adjustmentTitle}
                </h3>
                <ul className="mt-5 space-y-3">
                  {schedule.adjustmentItems.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
                    >
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-300"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <aside
              className={
                showOverview
                  ? "border-b border-l-2 border-amber-400 bg-amber-50/55 p-6 text-amber-950 dark:border-amber-300/40 dark:bg-amber-300/[0.07] dark:text-amber-100"
                  : "mt-4 rounded-overlay border border-amber-300/70 bg-amber-50/90 p-6 text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100"
              }
            >
              <h3 className="text-lg font-black">{schedule.evidenceTitle}</h3>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold opacity-75">
                    {schedule.authorLabel}
                  </dt>
                  <dd className="mt-1 font-bold">{schedule.author}</dd>
                </div>
                <div>
                  <dt className="font-semibold opacity-75">
                    {schedule.updatedLabel}
                  </dt>
                  <dd className="mt-1 font-bold tabular-nums">
                    <time dateTime={schedule.updatedAt}>
                      {schedule.updatedAt}
                    </time>
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm leading-relaxed">
                {schedule.disclaimer}
              </p>
              <div className="mt-4">
                <p className="text-sm font-bold">{schedule.sourceLabel}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {schedule.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xs underline decoration-amber-700/40 underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 dark:decoration-amber-200/40 dark:focus-visible:ring-amber-200"
                      >
                        {source.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </>
        )}
      </div>
    </section>
  );
}
