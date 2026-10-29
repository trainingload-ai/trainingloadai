"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ToolFileDropzone } from "@/components/ToolClientControls";
import { elapsedMilliseconds, trackToolEvent } from "@/lib/tool-analytics";
import { buildToolAppUrl } from "@shared/product-analytics";
import { readNdjsonResponse } from "@/lib/ndjson-stream";
import {
  formatPublicReviewRecoveryTime,
  publicReviewErrorKey,
} from "@/lib/public-review-error";
import type { WorkoutRoutePoint } from "@/lib/workout-route-model";
import type { WorkoutTrendPoint } from "@/lib/workout-trend-model";
import { DOCS_BROWSER_API_BASE_URL } from "@/lib/docs-api-base-url";
import styles from "./workout-review.module.css";

const WorkoutRoute3D = dynamic(
  () => import("./workout-route-3d").then((module) => module.WorkoutRoute3D),
  { ssr: false },
);

const WorkoutTrendChart = dynamic(
  () =>
    import("./workout-trend-chart").then((module) => module.WorkoutTrendChart),
  { ssr: false },
);

const MAX_FILE_BYTES = 25 * 1024 * 1024;

type Visualization = {
  sport: string;
  route3d?: WorkoutRoutePoint[];
  elevationProfile?: Array<{ distanceM: number; altitudeM: number }>;
  trends?: WorkoutTrendPoint[];
  verticalExaggeration: number;
  warnings: string[];
};

type Review = {
  schemaVersion: "1.0";
  language: string;
  sport: string;
  verdict: string;
  overview: string;
  workoutType: { label: string; rationale: string };
  keyFindings: Array<{
    title: string;
    evidence: string;
    interpretation: string;
  }>;
  intensityAssessment: string;
  recoverySuggestion: string;
  nextWorkoutSuggestion: string;
  limitations: string[];
  disclaimer: string;
};

type Stage =
  | "idle"
  | "admission"
  | "parsing"
  | "sanitizing"
  | "reviewing"
  | "complete"
  | "error";

type SharedBudget = {
  rollingWindowWeightedTokenBudget: number;
  remainingWeightedTokens: number;
  available: boolean;
  nextRecoveryAt?: string;
  rollingWindowHours: number;
};

type VisitorQuota = {
  rollingWindowReviewLimit: number;
  usedReviews: number;
  remainingReviews: number;
  available: boolean;
  nextRecoveryAt?: string;
  rollingWindowHours: number;
};

type AdmissionLimit = {
  code: string;
  nextRecoveryAt?: string;
};

function responseErrorCode(payload: unknown, status: number) {
  const value = payload as {
    code?: unknown;
    data?: { code?: unknown };
    response?: { code?: unknown };
  } | null;
  for (const code of [value?.code, value?.data?.code, value?.response?.code]) {
    if (typeof code === "string" && code.trim()) return code;
  }
  return `HTTP_${status}`;
}

function responseRecoveryAt(payload: unknown) {
  const value = payload as {
    nextRecoveryAt?: unknown;
    data?: { nextRecoveryAt?: unknown };
    response?: { nextRecoveryAt?: unknown };
  } | null;
  for (const recoveryAt of [
    value?.nextRecoveryAt,
    value?.data?.nextRecoveryAt,
    value?.response?.nextRecoveryAt,
  ]) {
    if (typeof recoveryAt === "string" && recoveryAt.trim()) return recoveryAt;
  }
  return undefined;
}

function isSharedBudget(value: unknown): value is SharedBudget {
  const budget = value as Partial<SharedBudget> | null;
  return Boolean(
    budget &&
    Number.isFinite(budget.rollingWindowWeightedTokenBudget) &&
    Number.isFinite(budget.remainingWeightedTokens) &&
    typeof budget.available === "boolean" &&
    Number.isFinite(budget.rollingWindowHours) &&
    (budget.nextRecoveryAt === undefined ||
      typeof budget.nextRecoveryAt === "string"),
  );
}

function isVisitorQuota(value: unknown): value is VisitorQuota {
  const quota = value as Partial<VisitorQuota> | null;
  return Boolean(
    quota &&
    Number.isFinite(quota.rollingWindowReviewLimit) &&
    Number.isFinite(quota.usedReviews) &&
    Number.isFinite(quota.remainingReviews) &&
    typeof quota.available === "boolean" &&
    Number.isFinite(quota.rollingWindowHours) &&
    (quota.nextRecoveryAt === undefined ||
      typeof quota.nextRecoveryAt === "string"),
  );
}

function extension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "unknown";
}

function sizeBucket(bytes: number) {
  if (bytes < 1024 * 1024) return "lt_1mb";
  if (bytes < 10 * 1024 * 1024) return "1_10mb";
  return "10_25mb";
}

function isReview(value: unknown): value is Review {
  const item = value as Partial<Review> | null;
  return Boolean(
    item &&
    item.schemaVersion === "1.0" &&
    item.verdict &&
    item.overview &&
    Array.isArray(item.keyFindings),
  );
}

function reviewMarkdown(review: Review, labels: Record<string, string>) {
  return [
    `# ${review.verdict}`,
    `\n${review.overview}`,
    `\n## ${labels.workoutType}\n${review.workoutType.label} — ${review.workoutType.rationale}`,
    `\n## ${labels.findings}`,
    ...review.keyFindings.map(
      (item) =>
        `\n### ${item.title}\n- ${item.evidence}\n- ${item.interpretation}`,
    ),
    `\n## ${labels.intensity}\n${review.intensityAssessment}`,
    `\n## ${labels.recovery}\n${review.recoverySuggestion}`,
    `\n## ${labels.next}\n${review.nextWorkoutSuggestion}`,
    `\n## ${labels.limitations}\n${review.limitations.map((item) => `- ${item}`).join("\n")}`,
    `\n> ${review.disclaimer}`,
  ].join("\n");
}

function countdownUntil(value: string, now: number) {
  const remainingSeconds = Math.max(
    0,
    Math.floor((new Date(value).getTime() - now) / 1000),
  );
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function HeroBudgetCard({
  title,
  personalRemaining,
  sharedRemaining,
  recoveryLines,
  exhausted,
}: {
  title: string;
  personalRemaining: string;
  sharedRemaining: string;
  recoveryLines: string[];
  exhausted?: string;
}) {
  return (
    <aside className={styles.heroBudget}>
      <div className={styles.heroBudgetHeader}>
        <span>{title}</span>
        <span className={styles.statusDot} />
      </div>
      <div className={styles.heroBudgetBody}>
        <p className={styles.heroBudgetPersonal}>{personalRemaining}</p>
        <p className={styles.heroBudgetShared}>{sharedRemaining}</p>
        <div className={styles.heroBudgetCountdown}>
          {recoveryLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        {exhausted ? (
          <p role="status" className={styles.heroBudgetAlert}>
            {exhausted}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export function PublicReviewClient({
  lang,
  newUserGift,
}: {
  lang: string;
  newUserGift: { days: number; credits: string };
}) {
  const t = useTranslations("freeAiWorkoutReview");
  const copy = {
    badge: t("badge"),
    title: t("title"),
    subtitle: t("subtitle"),
    trust: t.raw("trust") as string[],
    form: t.raw("form") as Record<string, string>,
    stages: t.raw("stages") as Record<
      "admission" | "parsing" | "sanitizing" | "reviewing",
      string
    >,
    route: t.raw("route") as Record<string, string>,
    result: t.raw("result") as Record<string, string>,
    errors: t.raw("errors") as Record<string, string>,
    howTo: t.raw("howTo") as {
      title: string;
      steps: Array<{ title: string; body: string }>;
    },
    faqTitle: t("faqTitle"),
    faq: t.raw("faq") as Array<{ question: string; answer: string }>,
    signup: {
      kicker: t("signup.kicker"),
      title: t("signup.title", newUserGift),
      description: t("signup.description", newUserGift),
      cta: t("signup.cta"),
    },
  };
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [question, setQuestion] = useState("");
  const [rpe, setRpe] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [lthr, setLthr] = useState("");
  const [ftp, setFtp] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [visualization, setVisualization] = useState<Visualization | null>(
    null,
  );
  const [review, setReview] = useState<Review | null>(null);
  const [routeVisible, setRouteVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sharedBudget, setSharedBudget] = useState<SharedBudget | null>(null);
  const [visitorQuota, setVisitorQuota] = useState<VisitorQuota | null>(null);
  const [admissionLimit, setAdmissionLimit] = useState<AdmissionLimit | null>(
    null,
  );
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const visualizationRef = useRef<Visualization | null>(null);
  const sharedBudgetRecoveryAt = sharedBudget?.nextRecoveryAt;
  const visitorRecoveryAt = visitorQuota?.nextRecoveryAt;

  const requestAdmission = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(
        `${DOCS_BROWSER_API_BASE_URL}/public/ai-workout-review-admissions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "x-lang": lang },
          body: "{}",
          signal,
        },
      );
      const payload = await response.json();
      const admission = payload?.data ?? payload;
      if (isSharedBudget(admission?.sharedBudget)) {
        setSharedBudget(admission.sharedBudget);
      }
      if (isVisitorQuota(admission?.visitorQuota)) {
        setVisitorQuota(admission.visitorQuota);
      }
      if (admission?.status === "limit_reached") {
        setAdmissionLimit({
          code:
            typeof admission.limitCode === "string"
              ? admission.limitCode
              : "LIMIT_REACHED",
          nextRecoveryAt:
            admission.nextRecoveryAt ??
            admission.sharedBudget?.nextRecoveryAt ??
            undefined,
        });
      } else if (admission?.status === "eligible") {
        setAdmissionLimit(null);
      }
      return admission;
    },
    [lang],
  );

  useEffect(() => {
    const admissionAbort = new AbortController();
    const admissionTimer = window.setTimeout(() => {
      void requestAdmission(admissionAbort.signal).catch(() => undefined);
    }, 0);
    trackToolEvent("tool_viewed", "free_ai_workout_review", {
      lang,
      referrer_group: document.referrer ? "referral" : "direct",
    });
    return () => {
      window.clearTimeout(admissionTimer);
      admissionAbort.abort();
      abortRef.current?.abort();
    };
  }, [lang, requestAdmission]);

  useEffect(() => {
    if (!sharedBudgetRecoveryAt && !visitorRecoveryAt) return;
    const updateCountdown = () => setCountdownNow(Date.now());
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [sharedBudgetRecoveryAt, visitorRecoveryAt]);

  const selectFile = useCallback((next: File | null) => {
    setFile(next);
    setError(null);
    setReview(null);
    setVisualization(null);
    visualizationRef.current = null;
    if (next) {
      trackToolEvent("tool_file_selected", "free_ai_workout_review", {
        file_extension: extension(next),
        file_size_bucket: sizeBucket(next.size),
        status: next.size <= MAX_FILE_BYTES ? "accepted" : "rejected",
      });
    }
  }, []);

  const submit = async () => {
    if (
      !file ||
      file.size > MAX_FILE_BYTES ||
      !["fit", "gpx", "tcx"].includes(extension(file))
    ) {
      setError(copy.errors.file);
      return;
    }
    if (!consent) {
      setError(copy.errors.consent);
      return;
    }
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const startedAt = performance.now();
    let currentStage: Stage = "admission";
    let receivedResult = false;
    let limitRecoveryAt: unknown = visitorQuota?.nextRecoveryAt;
    const updateStage = (nextStage: Stage) => {
      currentStage = nextStage;
      setStage(nextStage);
    };
    setError(null);
    setReview(null);
    setVisualization(null);
    visualizationRef.current = null;
    updateStage("admission");
    try {
      const admission = await requestAdmission(abort.signal);
      if (admission.status === "limit_reached") {
        limitRecoveryAt =
          admission.nextRecoveryAt ?? admission.sharedBudget?.nextRecoveryAt;
        throw new Error(admission.limitCode || "LIMIT_REACHED");
      }
      if (admission.status !== "eligible" || !admission.admissionToken)
        throw new Error("UNAVAILABLE");

      const form = new FormData();
      form.set("file", file);
      form.set("language", lang);
      form.set("consent", "true");
      if (question.trim()) form.set("question", question.trim());
      if (rpe) form.set("perceivedEffort", rpe);
      if (maxHr) form.set("maxHeartRate", maxHr);
      if (lthr) form.set("lactateThresholdHr", lthr);
      if (ftp) form.set("ftp", ftp);
      updateStage("parsing");
      trackToolEvent("tool_started", "free_ai_workout_review", {
        lang,
        source_format: extension(file),
        question_preset: question.trim() ? "custom" : "none",
      });
      const response = await fetch(
        `${DOCS_BROWSER_API_BASE_URL}/public/ai-workout-reviews`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            Accept: "application/x-ndjson",
            "X-Public-Review-Admission": admission.admissionToken,
            "x-lang": lang,
          },
          body: form,
          signal: abort.signal,
        },
      );
      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        limitRecoveryAt = responseRecoveryAt(payload) ?? limitRecoveryAt;
        throw new Error(responseErrorCode(payload, response.status));
      }
      await readNdjsonResponse(response, (raw) => {
        const event = raw as {
          type?: string;
          stage?: Stage;
          data?: unknown;
          code?: string;
        };
        if (event.type === "progress" && event.stage) updateStage(event.stage);
        if (event.type === "visualization") {
          const next = event.data as Visualization;
          setVisualization(next);
          visualizationRef.current = next;
          trackToolEvent(
            "tool_visualization_rendered",
            "free_ai_workout_review",
            {
              renderer: next.route3d?.length ? "threejs" : "fallback",
              point_count_bucket: next.route3d
                ? next.route3d.length > 500
                  ? "501_1500"
                  : "1_500"
                : "0",
              duration_ms: elapsedMilliseconds(startedAt),
            },
          );
        }
        if (event.type === "result" && isReview(event.data)) {
          receivedResult = true;
          setReview(event.data);
          updateStage("complete");
          void requestAdmission().catch(() => undefined);
          trackToolEvent("tool_completed", "free_ai_workout_review", {
            duration_ms: elapsedMilliseconds(startedAt),
            source_format: extension(file),
            sport: event.data.sport,
            visualization_status: visualizationRef.current?.route3d?.length
              ? "3d"
              : "fallback",
          });
        }
        if (event.type === "error")
          throw new Error(event.code || "REQUEST_FAILED");
      });
      if (!receivedResult) throw new Error("RESPONSE_INVALID");
    } catch (caught) {
      if (abort.signal.aborted) return;
      const code = String((caught as Error)?.message ?? "REQUEST_FAILED");
      const errorKey = publicReviewErrorKey(code);
      setStage("error");
      if (
        [
          "limit",
          "visitorLimit",
          "networkLimit",
          "sharedLimit",
          "activityLimit",
        ].includes(errorKey)
      ) {
        const recoveryTime = formatPublicReviewRecoveryTime(
          limitRecoveryAt,
          lang,
        );
        if (!recoveryTime) {
          setError(t("errors.limitUnknown"));
        } else if (errorKey === "visitorLimit") {
          setError(t("errors.visitorLimit", { recoveryTime }));
        } else if (errorKey === "networkLimit") {
          setError(t("errors.networkLimit", { recoveryTime }));
        } else if (errorKey === "sharedLimit") {
          setError(t("errors.sharedLimit", { recoveryTime }));
        } else if (errorKey === "activityLimit") {
          setError(t("errors.activityLimit", { recoveryTime }));
        } else {
          setError(t("errors.limit", { recoveryTime }));
        }
      } else {
        setError(copy.errors[errorKey]);
      }
      trackToolEvent("tool_failed", "free_ai_workout_review", {
        stage: currentStage,
        error_code:
          errorKey === "file"
            ? "invalid_file"
            : errorKey === "invalidResponse"
              ? "response_invalid"
              : "request_failed",
      });
    }
  };

  const isWorking = !["idle", "complete", "error"].includes(stage);
  const stageLabel =
    stage === "complete" || stage === "idle" || stage === "error"
      ? null
      : copy.stages[stage];
  const compactNumber = new Intl.NumberFormat(lang, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const personalRecovery = visitorRecoveryAt
    ? t("quota.personalCountdown", {
        countdown: countdownUntil(visitorRecoveryAt, countdownNow),
      })
    : t("quota.personalRolling");
  const sharedRecovery = sharedBudgetRecoveryAt
    ? t("quota.sharedCountdown", {
        countdown: countdownUntil(sharedBudgetRecoveryAt, countdownNow),
      })
    : t("quota.sharedRolling");
  const admissionLimitRecoveryTime = formatPublicReviewRecoveryTime(
    admissionLimit?.nextRecoveryAt,
    lang,
  );
  const admissionLimitNotice =
    admissionLimit && admissionLimitRecoveryTime
      ? admissionLimit.code === "VISITOR_LIMIT_REACHED"
        ? t("errors.visitorLimit", {
            recoveryTime: admissionLimitRecoveryTime,
          })
        : admissionLimit.code === "NETWORK_LIMIT_REACHED"
          ? t("errors.networkLimit", {
              recoveryTime: admissionLimitRecoveryTime,
            })
          : admissionLimit.code === "ROLLING_BUDGET_EXHAUSTED"
            ? t("errors.sharedLimit", {
                recoveryTime: admissionLimitRecoveryTime,
              })
            : t("errors.limit", {
                recoveryTime: admissionLimitRecoveryTime,
              })
      : undefined;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.stack}>
          <div>
            <header className={styles.hero}>
              <div>
                <div className={styles.kicker}>
                  <Sparkles className="size-4" />
                  {copy.badge}
                </div>
                <h1 className={styles.heroTitle}>{copy.title}</h1>
                <p className={styles.heroSubtitle}>{copy.subtitle}</p>
                <div className={styles.heroActions}>
                  <a className={styles.primaryAction} href="#review">
                    {copy.form.submit}
                    <ArrowDown className="size-4" />
                  </a>
                  <a className={styles.secondaryAction} href="#how-to">
                    {copy.howTo.title}
                  </a>
                </div>
                <div className={styles.trustList}>
                  {copy.trust.map((item, index) => {
                    const TrustIcon =
                      [Sparkles, LockKeyhole, ShieldCheck][index] ??
                      ShieldCheck;
                    return (
                      <span className={styles.trustItem} key={item}>
                        <TrustIcon className="size-3.5" />
                        {item}
                      </span>
                    );
                  })}
                </div>
              </div>
              <HeroBudgetCard
                title={t("quota.title")}
                personalRemaining={t("quota.personalRemaining", {
                  remaining: visitorQuota?.remainingReviews ?? "—",
                  total: visitorQuota?.rollingWindowReviewLimit ?? "—",
                })}
                sharedRemaining={t("quota.remainingOnly", {
                  remaining: sharedBudget
                    ? compactNumber.format(sharedBudget.remainingWeightedTokens)
                    : "—",
                })}
                recoveryLines={[personalRecovery, sharedRecovery]}
                exhausted={
                  admissionLimitNotice ??
                  (sharedBudget && !sharedBudget.available
                    ? t("quota.exhausted")
                    : undefined)
                }
              />
            </header>
          </div>

          <section id="review" className={styles.workbench}>
            <div className={styles.panel}>
              <span className={styles.panelLabel}>01 / INPUT</span>
              <div className={styles.panelBody}>
                <h2 className={styles.panelTitle}>{copy.form.title}</h2>
                <p className={styles.panelDescription}>
                  {copy.form.description}
                </p>
                <div className={styles.formStack}>
                  <div className={styles.dropzone}>
                    <ToolFileDropzone
                      pickStrong={copy.form.pick}
                      pickRest={copy.form.drop}
                      supported={copy.form.supported}
                      file={file}
                      accept=".fit,.gpx,.tcx"
                      onFileChange={selectFile}
                      trackingTool="free_ai_workout_review"
                      selectedLayout="inside"
                      replaceFileLabel={copy.form.replace}
                    />
                  </div>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {copy.form.question} <span>({copy.form.optional})</span>
                    </span>
                    <textarea
                      value={question}
                      maxLength={300}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder={copy.form.questionPlaceholder}
                      className={`${styles.input} ${styles.textArea}`}
                    />
                  </label>
                  <div className={styles.numberGrid}>
                    {[
                      [copy.form.rpe, rpe, setRpe, 1, 10],
                      [copy.form.maxHr, maxHr, setMaxHr, 60, 260],
                      [copy.form.lthr, lthr, setLthr, 60, 240],
                      [copy.form.ftp, ftp, setFtp, 20, 2000],
                    ].map(([label, value, setter, min, max]) => (
                      <label key={String(label)} className={styles.field}>
                        <span className={styles.fieldLabel}>
                          {String(label)} <span>· {copy.form.optional}</span>
                        </span>
                        <input
                          type="number"
                          min={Number(min)}
                          max={Number(max)}
                          value={String(value)}
                          onChange={(event) =>
                            (setter as (value: string) => void)(
                              event.target.value,
                            )
                          }
                          className={styles.input}
                        />
                      </label>
                    ))}
                  </div>
                  <label className={styles.consent}>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    <span>{copy.form.consent}</span>
                  </label>
                  {error ? (
                    <div role="alert" className={styles.error}>
                      {error}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={submit}
                    className={styles.submit}
                  >
                    {isWorking ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 size-4" />
                    )}
                    {isWorking ? copy.form.working : copy.form.submit}
                  </button>
                  {stageLabel ? (
                    <div aria-live="polite" className={styles.stage}>
                      <Loader2 className="size-4 animate-spin" />
                      {stageLabel}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.console}>
              <span className={styles.consoleLabel}>02 / OUTPUT</span>
              <div className={styles.consoleHeader}>
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <Route className="size-4 text-emerald-300" />
                    {copy.route.title}
                  </div>
                  <p
                    className={`${styles.consoleIntro} mt-1 max-w-2xl normal-case tracking-normal`}
                  >
                    {copy.route.description}
                  </p>
                </div>
                {visualization?.route3d?.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRouteVisible((value) => !value);
                      trackToolEvent(
                        "tool_visualization_interacted",
                        "free_ai_workout_review",
                        { action: "toggle", renderer: "threejs" },
                      );
                    }}
                    className={styles.consoleToggle}
                    aria-label={
                      routeVisible ? copy.route.hide : copy.route.show
                    }
                  >
                    {routeVisible ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                ) : null}
              </div>
              {visualization?.route3d?.length && routeVisible ? (
                <WorkoutRoute3D
                  points={visualization.route3d}
                  sport={visualization.sport}
                  verticalExaggeration={visualization.verticalExaggeration}
                  labels={{
                    reset: copy.route.reset,
                    slow: copy.route.slow,
                    fast: copy.route.fast,
                    unavailable: copy.route.unavailable,
                    elevationScale: copy.route.elevationScale,
                    interactiveLabel: copy.route.interactiveLabel,
                    speedUnavailable: copy.route.speedUnavailable,
                    speedUniform: copy.route.speedUniform,
                  }}
                />
              ) : visualization?.route3d?.length ? (
                <div className={styles.consoleEmpty}>{copy.route.show}</div>
              ) : visualization ? (
                <div className={styles.consoleEmpty}>
                  {copy.route.unavailable}
                </div>
              ) : (
                <div className={styles.consoleEmpty}>
                  <div>
                    <div className={styles.consoleEmptyIcon}>
                      <Activity className="size-7" />
                    </div>
                    <p className="mt-4 text-sm">{copy.form.supported}</p>
                  </div>
                </div>
              )}
              {visualization?.trends?.length ? (
                <WorkoutTrendChart
                  points={visualization.trends}
                  sport={visualization.sport}
                  labels={{
                    title: copy.route.trendsTitle,
                    description: copy.route.trendsDescription,
                    distance: copy.route.distanceAxis,
                    elapsed: copy.route.elapsedAxis,
                    sample: copy.route.sampleAxis,
                    pace: copy.route.pace,
                    speed: copy.route.speed,
                    heartRate: copy.route.heartRate,
                    power: copy.route.power,
                    elevation: copy.route.elevation,
                  }}
                />
              ) : null}
            </div>
          </section>

          {review ? (
            <section id="result">
              <div className={styles.sectionHeading}>
                <span className={styles.sectionEyebrow}>03 / REVIEW</span>
                <h2 className={styles.sectionTitle}>{copy.result.title}</h2>
              </div>
              <div className={styles.resultGrid}>
                <article className={styles.resultMain}>
                  <div className={styles.verdict}>
                    <span className={styles.verdictIcon}>
                      <CheckCircle2 className="size-5" />
                    </span>
                    <div>
                      <p className="text-xl font-black leading-snug">
                        {review.verdict}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed">
                        <strong>{copy.result.workoutType}：</strong>
                        {review.workoutType.label} —{" "}
                        {review.workoutType.rationale}
                      </p>
                    </div>
                  </div>
                  <div className={styles.overview}>{review.overview}</div>
                  <h3 className={`${styles.resultLabel} mt-6`}>
                    {copy.result.findings}
                  </h3>
                  <div className="mt-2">
                    {review.keyFindings.map((item) => (
                      <div key={item.title} className={styles.finding}>
                        <h4 className="font-black">{item.title}</h4>
                        <p className={styles.findingEvidence}>
                          {item.evidence}
                        </p>
                        <p className={styles.findingInterpretation}>
                          {item.interpretation}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className={styles.disclaimer}>{review.disclaimer}</p>
                </article>
                <div className={styles.resultSide}>
                  {[
                    [copy.result.intensity, review.intensityAssessment],
                    [copy.result.recovery, review.recoverySuggestion],
                    [copy.result.next, review.nextWorkoutSuggestion],
                  ].map(([label, value]) => (
                    <article className={styles.resultSideCard} key={label}>
                      <h3>{label}</h3>
                      <p>{value}</p>
                    </article>
                  ))}
                  <article className={styles.resultSideCard}>
                    <h3>{copy.result.limitations}</h3>
                    <ul className="list-disc pl-4">
                      {review.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        reviewMarkdown(review, copy.result),
                      );
                      setCopied(true);
                      trackToolEvent(
                        "tool_result_copied",
                        "free_ai_workout_review",
                        { action: "markdown" },
                      );
                      window.setTimeout(() => setCopied(false), 1800);
                    }}
                    className={styles.resultButton}
                  >
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Clipboard className="size-4" />
                    )}
                    {copied ? copy.result.copied : copy.result.copy}
                  </button>
                  <Link
                    href={buildToolAppUrl({
                      locale: lang,
                      toolId: "free_ai_workout_review",
                      ctaPlacement: "result_sidebar",
                      destination: "signup",
                    })}
                    onClick={() =>
                      trackToolEvent(
                        "tool_app_cta_clicked",
                        "free_ai_workout_review",
                        {
                          cta_placement: "result_sidebar",
                          destination: "signup",
                          lang,
                        },
                      )
                    }
                    className={styles.appCta}
                  >
                    {copy.result.cta}
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          <section id="how-to">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionEyebrow}>03 / PROCESS</span>
              <h2 className={styles.sectionTitle}>{copy.howTo.title}</h2>
            </div>
            <div className={styles.steps}>
              {copy.howTo.steps.map((step, index) => (
                <article className={styles.step} key={`${index}-${step.title}`}>
                  <span className={styles.stepNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="faq">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionEyebrow}>04 / FAQ</span>
              <h2 className={styles.sectionTitle}>{copy.faqTitle}</h2>
            </div>
            <div className={styles.faqList}>
              {copy.faq.map((item, index) => (
                <details
                  className={styles.faqItem}
                  key={`${index}-${item.question}`}
                >
                  <summary>{item.question}</summary>
                  <div className={styles.faqAnswer}>{item.answer}</div>
                </details>
              ))}
            </div>
          </section>

          <section id="signup" className={styles.signupCard}>
            <div>
              <span className={styles.signupEyebrow}>{copy.signup.kicker}</span>
              <h2>{copy.signup.title}</h2>
              <p>{copy.signup.description}</p>
            </div>
            <Link
              href={buildToolAppUrl({
                locale: lang,
                toolId: "free_ai_workout_review",
                ctaPlacement: "bottom_signup",
                destination: "signup",
              })}
              onClick={() =>
                trackToolEvent(
                  "tool_app_cta_clicked",
                  "free_ai_workout_review",
                  {
                    cta_placement: "bottom_signup",
                    destination: "signup",
                    lang,
                  },
                )
              }
              className={styles.signupCta}
            >
              {copy.signup.cta}
              <ArrowRight className="size-4" />
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
