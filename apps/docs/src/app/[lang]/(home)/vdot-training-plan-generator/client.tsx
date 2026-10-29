"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  Download,
  ExternalLink,
  LoaderCircle,
  Printer,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  VDOT_GOAL_DISTANCES,
  VdotPlanGenerationError,
  generateVdotPlan,
  type VdotGoalDistance,
  type VdotPlanDraftV1,
  type VdotPlanBriefV1,
  type VdotPlanWorkoutV1,
} from "@shared/vdot-plan";
import type {
  EndurancePlanBlock,
  EnduranceWorkRestStep,
} from "@shared/endurance-workout-ir";
import { formatVdotPaceRange } from "@shared/vdot";
import { localePrefix } from "@/lib/locale-url";
import { appImportBase, getVdotGeneratorCopy } from "@/lib/vdot-plan-content";
import { elapsedMilliseconds, trackToolEvent } from "@/lib/tool-analytics";
import { DOCS_BROWSER_API_BASE_URL } from "@/lib/docs-api-base-url";

type Props = {
  lang: string;
  defaultStartDate: string;
  initialVdot?: string;
  initialGoal?: string;
  initialWeeks?: string;
};

type FormState = {
  vdot: string;
  goal: VdotGoalDistance;
  weeks: string;
  weeklyDistance: string;
  longestRun: string;
  runsPerWeek: "3" | "4" | "5" | "6" | "7";
  longRunDay: string;
  startDate: string;
  unit: "METRIC" | "IMPERIAL";
  unavailable: number[];
  goalTime: string;
};

const GOAL_LIMITS: Record<VdotGoalDistance, [number, number]> = {
  "5K": [6, 16],
  "10K": [8, 16],
  HALF_MARATHON: [10, 20],
  MARATHON: [12, 24],
};

const GOAL_DISPLAY_DISTANCE: Record<
  FormState["unit"],
  Record<VdotGoalDistance, string>
> = {
  METRIC: {
    "5K": "5 km",
    "10K": "10 km",
    HALF_MARATHON: "21.1 km",
    MARATHON: "42.2 km",
  },
  IMPERIAL: {
    "5K": "3.1 mi",
    "10K": "6.2 mi",
    HALF_MARATHON: "13.1 mi",
    MARATHON: "26.2 mi",
  },
};

const MILES_TO_KM = 1.609344;

function validGoal(value?: string): VdotGoalDistance {
  return VDOT_GOAL_DISTANCES.includes(value as VdotGoalDistance)
    ? (value as VdotGoalDistance)
    : "10K";
}

function clampWeeks(goal: VdotGoalDistance, value?: string) {
  const [minimum, maximum] = GOAL_LIMITS[goal];
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return goal === "MARATHON" ? 16 : 12;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function parseGoalTime(value: string) {
  if (!value.trim()) return undefined;
  const parts = value.split(":").map(Number);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !Number.isFinite(part) || part < 0)
  ) {
    return Number.NaN;
  }
  const [hours, minutes, seconds = 0] =
    parts.length === 2 ? [0, parts[0], parts[1]] : parts;
  if (minutes >= 60 || seconds >= 60) return Number.NaN;
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDistance(km: number, unit: FormState["unit"]) {
  const value = unit === "IMPERIAL" ? km / MILES_TO_KM : km;
  return `${value.toFixed(1)} ${unit === "IMPERIAL" ? "mi" : "km"}`;
}

function goalOptionLabel(
  goal: VdotGoalDistance,
  unit: FormState["unit"],
  name: string,
) {
  if (unit === "METRIC" && (goal === "5K" || goal === "10K")) {
    return name;
  }
  return `${name} · ${GOAL_DISPLAY_DISTANCE[unit][goal]}`;
}

function dateForWorkout(startDate: string, workout: VdotPlanWorkoutV1) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(
    date.getUTCDate() + (workout.weekIndex - 1) * 7 + workout.dayIndex - 1,
  );
  return date.toISOString().slice(0, 10);
}

function stepDistance(step: EnduranceWorkRestStep) {
  const meta = step.durationMeta;
  if (!meta) return "";
  if (meta.kind === "DISTANCE" && meta.value != null) {
    return meta.unit === "KILOMETERS"
      ? `${meta.value.toFixed(1)} km`
      : `${Math.round(meta.value)} m`;
  }
  if (meta.kind === "TIME" && meta.value != null) {
    return `${Math.round(meta.value / 60)} min`;
  }
  return meta.kind.toLowerCase();
}

function stepLabel(step: EnduranceWorkRestStep) {
  const target = step.primaryTargetMeta;
  return [
    step.stepKind?.toLowerCase().replaceAll("_", " "),
    stepDistance(step),
    target?.zoneLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

function blockLabels(block: EndurancePlanBlock) {
  if (block.type === "repeat") {
    return [
      `${block.count} ×`,
      ...block.children.flatMap((child) =>
        child.steps.map((step) => stepLabel(step)),
      ),
    ];
  }
  return block.steps.map((step) => stepLabel(step));
}

function WorkoutSteps({ workout }: { workout: VdotPlanWorkoutV1 }) {
  if (
    workout.definition.source !== "STRUCTURE" ||
    workout.definition.structure.kind !== "ENDURANCE"
  ) {
    return null;
  }

  return (
    <ol className="mt-3 space-y-1 border-l border-neutral-200 pl-4 text-xs leading-5 text-neutral-600 dark:border-white/10 dark:text-neutral-400">
      {workout.definition.structure.blocks
        .flatMap(blockLabels)
        .map((label, index) => (
          <li key={`${label}-${index}`}>{label}</li>
        ))}
    </ol>
  );
}

export default function VdotPlanGeneratorClient({
  lang,
  defaultStartDate,
  initialVdot,
  initialGoal,
  initialWeeks,
}: Props) {
  const copy = getVdotGeneratorCopy(lang);
  const prefix = localePrefix(lang);
  const firstGoal = validGoal(initialGoal);
  const [form, setForm] = useState<FormState>({
    vdot:
      initialVdot && Number.isFinite(Number(initialVdot)) ? initialVdot : "",
    goal: firstGoal,
    weeks: String(clampWeeks(firstGoal, initialWeeks)),
    weeklyDistance: "",
    longestRun: "",
    runsPerWeek: "5",
    longRunDay: "7",
    startDate: defaultStartDate,
    unit: "METRIC",
    unavailable: [],
    goalTime: "",
  });
  const [draft, setDraft] = useState<VdotPlanDraftV1 | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    trackToolEvent("tool_viewed", "vdot_plan_generator", { lang });
  }, [lang]);

  const goalLimits = GOAL_LIMITS[form.goal];
  const periodOptions = Array.from(
    { length: goalLimits[1] - goalLimits[0] + 1 },
    (_, index) => goalLimits[0] + index,
  );
  const groupedWorkouts = useMemo(() => {
    if (!draft) return [];
    return draft.weeks.map((week) => ({
      week,
      workouts: draft.workouts.filter(
        (workout) => workout.weekIndex === week.weekIndex,
      ),
    }));
  }, [draft]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDraft(null);
    setMessage("");
    setError("");
  }

  function changeGoal(goal: VdotGoalDistance) {
    update("goal", goal);
    update("weeks", String(clampWeeks(goal, form.weeks)));
  }

  function changeUnit(unit: FormState["unit"]) {
    if (unit === form.unit) return;
    const conversion =
      form.unit === "METRIC" && unit === "IMPERIAL"
        ? (value: number) => value / MILES_TO_KM
        : (value: number) => value * MILES_TO_KM;
    const convert = (value: string) => {
      if (!value.trim() || !Number.isFinite(Number(value))) return value;
      return String(Math.round(conversion(Number(value)) * 10) / 10);
    };
    setForm((current) => ({
      ...current,
      unit,
      weeklyDistance: convert(current.weeklyDistance),
      longestRun: convert(current.longestRun),
    }));
    setDraft(null);
    setMessage("");
    setError("");
  }

  function toggleUnavailable(dayIndex: number) {
    setDraft(null);
    setMessage("");
    setError("");
    setForm((current) => ({
      ...current,
      unavailable: current.unavailable.includes(dayIndex)
        ? current.unavailable.filter((day) => day !== dayIndex)
        : [...current.unavailable, dayIndex],
    }));
  }

  function createBrief(): VdotPlanBriefV1 {
    const distanceFactor = form.unit === "IMPERIAL" ? MILES_TO_KM : 1;
    const optionalGoalTimeSec = parseGoalTime(form.goalTime);
    return {
      schemaVersion: 1,
      vdot: Number(form.vdot),
      goalDistance: form.goal,
      periodWeeks: Number(form.weeks),
      startDate: form.startDate,
      unitSystem: form.unit,
      currentWeeklyDistanceKm: Number(form.weeklyDistance) * distanceFactor,
      currentLongestRunKm: form.longestRun
        ? Number(form.longestRun) * distanceFactor
        : undefined,
      runsPerWeek: Number(form.runsPerWeek) as VdotPlanBriefV1["runsPerWeek"],
      longRunDayIndex: Number(
        form.longRunDay,
      ) as VdotPlanBriefV1["longRunDayIndex"],
      unavailableDayIndexes:
        form.unavailable as VdotPlanBriefV1["unavailableDayIndexes"],
      optionalGoalTimeSec,
    };
  }

  function issueMessage(code: string) {
    switch (code) {
      case "VDOT_OUT_OF_RANGE":
        return copy.messages.vdotError;
      case "PERIOD_OUT_OF_RANGE":
        return copy.messages.periodError;
      case "START_DATE_INVALID":
        return copy.messages.startDateError;
      case "WEEKLY_DISTANCE_INVALID":
        return form.unit === "IMPERIAL"
          ? copy.messages.weeklyDistanceErrorImperial
          : copy.messages.weeklyDistanceError;
      case "LONGEST_RUN_INVALID":
        return form.unit === "IMPERIAL"
          ? copy.messages.longestRunErrorImperial
          : copy.messages.longestRunError;
      case "RUN_DAYS_INVALID":
        return copy.messages.runDaysError;
      case "NOT_ENOUGH_AVAILABLE_DAYS":
        return copy.messages.unavailableDaysError;
      case "LONG_RUN_DAY_UNAVAILABLE":
        return copy.messages.longRunDayError;
      case "GOAL_TIME_INVALID":
        return copy.messages.goalTimeError;
      case "MARATHON_FOUNDATION_INSUFFICIENT":
        return copy.messages.marathonFoundationError;
      default:
        return copy.messages.inputError;
    }
  }

  function generate() {
    // This runs from the Generate button handler, not during render.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = performance.now();
    setError("");
    setMessage("");
    trackToolEvent("tool_started", "vdot_plan_generator", {
      input_method: "direct_vdot",
      lang,
    });
    try {
      const nextDraft = generateVdotPlan(createBrief(), { locale: lang });
      setDraft(nextDraft);
      setMessage(copy.messages.generated);
      trackToolEvent("tool_completed", "vdot_plan_generator", {
        duration_ms: elapsedMilliseconds(startedAt),
        status: nextDraft.validation.status.toLowerCase(),
        lang,
      });
      requestAnimationFrame(() =>
        document
          .getElementById("vdot-plan-result")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (cause) {
      setDraft(null);
      setError(
        cause instanceof VdotPlanGenerationError
          ? [
              ...new Set(cause.issues.map((issue) => issueMessage(issue.code))),
            ].join(" ")
          : copy.messages.inputError,
      );
      trackToolEvent("tool_failed", "vdot_plan_generator", {
        duration_ms: elapsedMilliseconds(startedAt),
        error_code: "invalid_input",
        lang,
      });
    }
  }

  function downloadJson() {
    if (!draft) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vdot-${draft.brief.goalDistance.toLowerCase()}-${draft.periodWeeks}-weeks.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    trackToolEvent("tool_exported", "vdot_plan_generator", {
      export_format: "json",
      lang,
    });
  }

  async function prepareImport() {
    if (!draft || importing) return;
    setImporting(true);
    setError("");
    try {
      const response = await fetch(
        `${DOCS_BROWSER_API_BASE_URL}/public/plan-import-drafts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft }),
        },
      );
      if (!response.ok) throw new Error("request_failed");
      const json = await response.json();
      const payload = json?.data ?? json;
      if (!payload?.token) throw new Error("response_invalid");
      trackToolEvent("tool_app_cta_clicked", "vdot_plan_generator", {
        action: "import_plan",
        cta_placement: "result",
        destination: "plan_import",
        lang,
      });
      window.location.assign(
        `${appImportBase(lang)}/plans/import/${encodeURIComponent(payload.token)}`,
      );
    } catch {
      setError(copy.messages.importError);
      setImporting(false);
    }
  }

  const fieldClass =
    "mt-2 h-11 w-full rounded-compact border border-neutral-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/15 dark:bg-neutral-950";

  return (
    <div className="mt-12">
      <div className="print:hidden rounded-compact border border-neutral-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-950 md:p-8">
        <fieldset className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-6 dark:border-white/10">
          <legend className="sr-only">{copy.labels.unit}</legend>
          <div>
            <p className="text-sm font-black">{copy.labels.unit}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {form.unit === "METRIC" ? "km · min/km" : "mi · min/mi"}
            </p>
          </div>
          <div
            role="group"
            aria-label={copy.labels.unit}
            className="inline-flex rounded-compact border border-neutral-300 bg-neutral-100 p-1 dark:border-white/15 dark:bg-white/5"
          >
            {(
              [
                ["METRIC", `${copy.units.metric} · km`],
                ["IMPERIAL", `${copy.units.imperial} · mi`],
              ] as const
            ).map(([unit, label]) => {
              const selected = form.unit === unit;
              return (
                <button
                  key={unit}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => changeUnit(unit)}
                  className={`h-9 rounded px-4 text-xs font-black transition ${
                    selected
                      ? "bg-white text-emerald-700 shadow-sm dark:bg-neutral-900 dark:text-emerald-300"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-bold">
            {copy.labels.vdot}
            <input
              className={fieldClass}
              type="number"
              min="20"
              max="85"
              step="0.1"
              value={form.vdot}
              onChange={(event) => update("vdot", event.target.value)}
            />
          </label>
          <label className="text-sm font-bold">
            {copy.labels.goal}
            <select
              className={fieldClass}
              value={form.goal}
              onChange={(event) =>
                changeGoal(event.target.value as VdotGoalDistance)
              }
            >
              {VDOT_GOAL_DISTANCES.map((goal) => (
                <option key={goal} value={goal}>
                  {goalOptionLabel(goal, form.unit, copy.goals[goal])}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            {copy.labels.weeks}
            <select
              className={fieldClass}
              value={form.weeks}
              onChange={(event) => update("weeks", event.target.value)}
            >
              {periodOptions.map((weeks) => (
                <option key={weeks} value={weeks}>
                  {lang.startsWith("zh") ? `${weeks} 周` : `${weeks} weeks`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            {copy.labels.startDate}
            <input
              className={fieldClass}
              type="date"
              value={form.startDate}
              onChange={(event) => update("startDate", event.target.value)}
            />
          </label>
          <label className="text-sm font-bold">
            {copy.labels.weeklyDistance} (
            {form.unit === "IMPERIAL" ? "mi" : "km"})
            <input
              className={fieldClass}
              type="number"
              min="1"
              step="0.1"
              placeholder={form.unit === "IMPERIAL" ? "22" : "35"}
              value={form.weeklyDistance}
              onChange={(event) => update("weeklyDistance", event.target.value)}
            />
          </label>
          <label className="text-sm font-bold">
            {copy.labels.longestRun} ({form.unit === "IMPERIAL" ? "mi" : "km"})
            <input
              className={fieldClass}
              type="number"
              min="1"
              step="0.1"
              placeholder={form.unit === "IMPERIAL" ? "9" : "14"}
              value={form.longestRun}
              onChange={(event) => update("longestRun", event.target.value)}
            />
          </label>
          <label className="text-sm font-bold">
            {copy.labels.runsPerWeek}
            <select
              className={fieldClass}
              value={form.runsPerWeek}
              onChange={(event) =>
                update(
                  "runsPerWeek",
                  event.target.value as FormState["runsPerWeek"],
                )
              }
            >
              {[3, 4, 5, 6, 7].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            {copy.labels.longRunDay}
            <select
              className={fieldClass}
              value={form.longRunDay}
              onChange={(event) => update("longRunDay", event.target.value)}
            >
              {copy.weekdays.map((day, index) => (
                <option key={day} value={index + 1}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            {copy.labels.goalTime}
            <input
              className={fieldClass}
              type="text"
              inputMode="numeric"
              placeholder="HH:MM:SS"
              value={form.goalTime}
              onChange={(event) => update("goalTime", event.target.value)}
            />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-bold">
              {copy.labels.unavailable}
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {copy.weekdays.map((day, index) => {
                const dayIndex = index + 1;
                const checked = form.unavailable.includes(dayIndex);
                return (
                  <label
                    key={day}
                    className={`cursor-pointer rounded-compact border px-3 py-2 text-xs font-bold ${
                      checked
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-neutral-300 dark:border-white/15"
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleUnavailable(dayIndex)}
                    />
                    {day}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <p className="mt-5 text-xs leading-5 text-neutral-500">
          {copy.messages.volumeExplanation}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            className="inline-flex h-12 items-center justify-center rounded-compact bg-emerald-600 px-6 text-sm font-black text-white transition hover:bg-emerald-700 dark:bg-emerald-400 dark:text-neutral-950 dark:hover:bg-emerald-300"
          >
            <Sparkles className="mr-2 size-4" />
            {draft ? copy.actions.regenerate : copy.actions.generate}
          </button>
          <Link
            href={`${prefix}/vdot-calculator`}
            className="inline-flex h-12 items-center rounded-compact border border-neutral-300 px-5 text-sm font-bold dark:border-white/15"
          >
            {copy.actions.calculate}
          </Link>
          {message && (
            <span
              role="status"
              className="text-sm font-bold text-emerald-700 dark:text-emerald-300"
            >
              {message}
            </span>
          )}
          {error && (
            <span
              role="alert"
              className="inline-flex items-center text-sm font-bold text-red-700 dark:text-red-300"
            >
              <TriangleAlert className="mr-2 size-4" />
              {error}
            </span>
          )}
        </div>
      </div>

      {!draft ? (
        <div className="print:hidden mt-6 rounded-compact border border-dashed border-neutral-300 px-5 py-10 text-center text-sm text-neutral-500 dark:border-white/15">
          {copy.messages.noResult}
        </div>
      ) : (
        <section id="vdot-plan-result" className="scroll-mt-6 pt-12">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                VDOT {draft.brief.vdot}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
                {draft.title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                {draft.description}
              </p>
              <p className="mt-2 font-mono text-xs text-neutral-500">
                {copy.result.generated}:{" "}
                {new Date(draft.generatedAt).toLocaleString(lang)}
              </p>
            </div>
            <div className="print:hidden flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  window.print();
                  trackToolEvent("tool_exported", "vdot_plan_generator", {
                    export_format: "print",
                    lang,
                  });
                }}
                className="inline-flex h-10 items-center rounded-compact border border-neutral-300 px-4 text-xs font-black dark:border-white/15"
              >
                <Printer className="mr-2 size-4" />
                {copy.actions.print}
              </button>
              <button
                type="button"
                onClick={downloadJson}
                className="inline-flex h-10 items-center rounded-compact border border-neutral-300 px-4 text-xs font-black dark:border-white/15"
              >
                <Download className="mr-2 size-4" />
                {copy.actions.json}
              </button>
              <button
                type="button"
                onClick={prepareImport}
                disabled={importing}
                className="inline-flex h-10 items-center rounded-compact bg-neutral-950 px-4 text-xs font-black text-white disabled:opacity-60 dark:bg-white dark:text-neutral-950"
              >
                {importing ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 size-4" />
                )}
                {copy.actions.import}
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-5">
            {(["E", "M", "T", "I", "R"] as const).map((zone) => (
              <article
                key={zone}
                className="rounded-compact border border-neutral-200 p-4 dark:border-white/10"
              >
                <p className="font-mono text-xl font-black text-emerald-700 dark:text-emerald-300">
                  {copy.zones[zone][0]}
                </p>
                <p className="mt-2 font-mono text-sm font-bold">
                  {formatVdotPaceRange(
                    draft.paceSnapshot.zones[zone],
                    form.unit,
                  )}
                </p>
                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  {copy.zones[zone][1]}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-compact border border-neutral-200 p-5 dark:border-white/10">
            <h3 className="font-black">{copy.result.phases}</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              {draft.phases.map((phase) => (
                <div key={phase.key}>
                  <p className="font-mono text-xs font-black text-emerald-700 dark:text-emerald-300">
                    W{phase.startWeek}–{phase.endWeek}
                  </p>
                  <p className="mt-1 text-xs font-bold">{phase.key}</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    {phase.purpose}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-emerald-600" />
              <h3 className="text-xl font-black">{copy.result.schedule}</h3>
            </div>
            <div className="mt-5 space-y-5">
              {groupedWorkouts.map(({ week, workouts }) => (
                <article
                  key={week.weekIndex}
                  className="break-inside-avoid rounded-compact border border-neutral-200 p-5 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-black">
                      {copy.result.week} {week.weekIndex} · {week.phase}
                    </h4>
                    <p className="font-mono text-xs text-neutral-500">
                      {formatDistance(
                        week.plannedTrainingDistanceKm,
                        form.unit,
                      )}{" "}
                      {copy.result.total}
                      {week.plannedRaceDistanceKm > 0 &&
                        ` + ${formatDistance(week.plannedRaceDistanceKm, form.unit)} ${copy.result.race}`}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {workouts.map((workout) => (
                      <details
                        key={`${workout.dayIndex}-${workout.sessionIndex}`}
                        className="group rounded-compact bg-neutral-50 p-4 dark:bg-white/[0.035]"
                      >
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                {copy.weekdays[workout.dayIndex - 1]} ·{" "}
                                {dateForWorkout(draft.brief.startDate, workout)}
                              </p>
                              <p className="mt-1 text-sm font-black">
                                {workout.name}
                              </p>
                              <p className="mt-1 text-xs text-neutral-500">
                                {formatDistance(
                                  workout.plannedDistanceKm,
                                  form.unit,
                                )}
                              </p>
                            </div>
                            <ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" />
                          </div>
                        </summary>
                        <p className="mt-3 text-xs leading-5 text-neutral-600 dark:text-neutral-400">
                          {workout.notes}
                        </p>
                        <WorkoutSteps workout={workout} />
                      </details>
                    ))}
                  </div>
                  <div className="hidden print:block">
                    {workouts.map((workout) => (
                      <div
                        key={`print-${workout.dayIndex}-${workout.sessionIndex}`}
                        className="mt-3"
                      >
                        <p className="text-xs font-bold">
                          {copy.weekdays[workout.dayIndex - 1]} · {workout.name}{" "}
                          ·{" "}
                          {formatDistance(workout.plannedDistanceKm, form.unit)}
                        </p>
                        <WorkoutSteps workout={workout} />
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          {draft.validation.warnings.length > 0 && (
            <aside className="mt-8 rounded-compact border border-amber-300 bg-amber-50 p-5 text-amber-950">
              <h3 className="font-black">{copy.result.warning}</h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {draft.validation.warnings.map((warning) => (
                  <li key={warning.code}>{warning.message}</li>
                ))}
              </ul>
            </aside>
          )}

          <p className="mt-8 border-t border-neutral-200 pt-5 text-xs leading-5 text-neutral-500 dark:border-white/10">
            {copy.result.disclaimer}
          </p>
        </section>
      )}
    </div>
  );
}
