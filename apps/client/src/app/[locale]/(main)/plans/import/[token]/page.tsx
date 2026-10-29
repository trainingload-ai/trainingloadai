"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  getVdotPlanImportPreview,
  importVdotPlanDraft,
  type VdotPlanImportPreview,
} from "@/api/plans";
import { formatVdotPaceRange } from "@shared/vdot";
import { getVdotPlanImportCopy } from "@/lib/vdot-plan-import-content";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

export default function VdotPlanImportPage() {
  const locale = useLocale();
  const copy = getVdotPlanImportCopy(locale);
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<VdotPlanImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [importError, setImportError] = useState("");
  useSetPageTitle(copy.title);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await getVdotPlanImportPreview(params.token);
      if (!result) throw new Error("empty_preview");
      setPreview(result);
    } catch {
      setFailed(true);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [params.token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    if (confirming) return;
    setConfirming(true);
    setImportError("");
    try {
      const plan = await importVdotPlanDraft(params.token);
      if (!plan) throw new Error("empty_plan");
      router.replace(`/plans/${plan.id}`);
    } catch {
      setImportError(copy.importError);
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center p-6">
        <div
          role="status"
          className="flex items-center gap-3 text-sm text-muted-foreground"
        >
          <LoaderCircle className="h-5 w-5 animate-spin" />
          {copy.loading}
        </div>
      </main>
    );
  }

  if (failed || !preview) {
    return (
      <main className="mx-auto max-w-3xl p-6 py-16">
        <div className="rounded-2xl border bg-card p-7 shadow-sm">
          <TriangleAlert className="h-7 w-7 text-amber-600" />
          <h1 className="mt-5 text-2xl font-bold">{copy.errorTitle}</h1>
          <p className="mt-3 leading-7 text-muted-foreground">
            {copy.errorText}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {copy.retry}
            </button>
            <Link
              href="/plans"
              className="rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              {copy.back}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { draft, summary } = preview;

  return (
    <main className="mx-auto max-w-6xl p-4 pb-24 pt-8 sm:p-6 sm:pt-10">
      <Link
        href="/plans"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {copy.back}
      </Link>

      <div className="mt-7 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">{copy.subtitle}</p>
      </div>

      <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{summary.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{summary.goal}</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            GENERATED · DRAFT
          </span>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t pt-6 sm:grid-cols-4">
          {[
            [copy.vdot, summary.vdot],
            [copy.weeks, summary.periodWeeks],
            [copy.workouts, summary.workoutCount],
            [copy.starts, summary.startDate],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 font-mono text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 font-mono text-xs text-muted-foreground">
          {copy.generated}:{" "}
          {new Date(summary.generatedAt).toLocaleString(locale)}
        </p>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-7">
        <h2 className="font-bold">{copy.paces}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(["E", "M", "T", "I", "R"] as const).map((zone) => (
            <div key={zone} className="rounded-xl bg-muted/50 p-4">
              <p className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {zone} · {copy.zones[zone]}
              </p>
              <p className="mt-2 font-mono text-xs font-semibold">
                {formatVdotPaceRange(draft.paceSnapshot.zones[zone], "METRIC")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
          <h2 className="font-bold">{copy.schedule}</h2>
        </div>
        <div className="mt-4 space-y-4">
          {draft.weeks.map((week) => {
            const workouts = draft.workouts.filter(
              (workout) => workout.weekIndex === week.weekIndex,
            );
            return (
              <details
                key={week.weekIndex}
                className="rounded-2xl border bg-card p-5 open:shadow-sm"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-bold">
                        {copy.week} {week.weekIndex}
                      </span>
                      <span className="ml-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {week.phase}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {week.plannedTrainingDistanceKm.toFixed(1)} km
                    </span>
                  </div>
                </summary>
                <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                  {workouts.map((workout) => (
                    <article
                      key={`${workout.dayIndex}-${workout.sessionIndex}`}
                      className="rounded-xl bg-muted/50 p-4"
                    >
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {copy.weekdays[workout.dayIndex - 1]}
                      </p>
                      <h3 className="mt-1 text-sm font-bold">{workout.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {workout.plannedDistanceKm.toFixed(1)} km ·{" "}
                        {workout.intent.primary}
                      </p>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        {workout.notes}
                      </p>
                    </article>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <aside className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        {copy.disclosure}
      </aside>

      {draft.validation.warnings.length > 0 && (
        <aside className="mt-4 rounded-2xl border border-amber-200 p-5">
          <h2 className="font-bold">{copy.warning}</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {draft.validation.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
        </aside>
      )}

      <div className="mt-8 rounded-2xl border bg-card p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.draftNote}
        </p>
        <div className="mt-5 flex shrink-0 flex-wrap gap-3 sm:mt-0">
          <Link
            href="/plans"
            className="inline-flex h-11 items-center rounded-lg border px-5 text-sm font-semibold"
          >
            {copy.cancel}
          </Link>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={confirming}
            className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {confirming ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {confirming ? copy.confirming : copy.confirm}
          </button>
        </div>
        {importError && (
          <p
            role="alert"
            className="mt-3 text-sm font-semibold text-destructive"
          >
            {importError}
          </p>
        )}
      </div>
    </main>
  );
}
