"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Download,
  Flame,
  Footprints,
  Loader2,
  Pause,
  Plus,
  Printer,
  Repeat2,
  RotateCcw,
  Share2,
  Snowflake,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { captureToolFailure } from "@/lib/tool-sentry";
import { elapsedMilliseconds, trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import styles from "./workout-editor.module.css";
import {
  DURATION_UNITS,
  INTENSITY_KINDS,
  STEP_TYPES,
  WORKOUT_SPORTS,
  convertDurationQuantity,
  convertPaceText,
  convertPowerText,
  createEmptyRepeat,
  createEmptyStep,
  createExampleWorkout,
  formatClock,
  hasMeaningfulWorkout,
  isRepeat,
  paceMeasureFromText,
  parseDurationNumber,
  workoutHasDistance,
  workoutPreviewSegments,
  workoutToDsl,
  workoutTotalSeconds,
  type DurationUnit,
  type IntensityKind,
  type PaceMeasure,
  type WorkoutDraft,
  type WorkoutExampleId,
  type WorkoutModule,
  type WorkoutSport,
  type WorkoutStep,
  type WorkoutStepType,
} from "./workout-model";
import {
  fitSportForWorkout,
  formatIntervalsDoc,
  parseIntervalsDocInput,
  workoutDownloadStem,
} from "./workout-export";
import {
  nextWorkoutShareUrl,
  shareResultUrl,
  workoutShareTooLong,
  type WorkoutShareInputs,
} from "./share-inputs";

const WorkoutTimeline = dynamic(
  () => import("./timeline").then((mod) => mod.WorkoutTimeline),
  {
    loading: () => (
      <div className={styles.timelineLoading} aria-hidden="true" />
    ),
  },
);

const PACE_OPTIONS: {
  measure: PaceMeasure;
  key: "km" | "mi" | "m100" | "yd100";
}[] = [
  { measure: "sec/km", key: "km" },
  { measure: "sec/mi", key: "mi" },
  { measure: "sec/100m", key: "m100" },
  { measure: "sec/100yd", key: "yd100" },
];
const FILE_LIMIT_BYTES = 20 * 1024 * 1024;

const STEP_ICONS = {
  warmup: Flame,
  work: Footprints,
  recovery: RotateCcw,
  rest: Pause,
  cooldown: Snowflake,
  other: Footprints,
} as const;

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <Label className={styles.fieldLabel} htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function compactDsl(value: string) {
  return value
    .replace(/[ \t]*\n[ \t]*/g, " / ")
    .replace(/\{\s*\/\s*/g, "{ ")
    .replace(/\s*\/\s*\}/g, " }")
    .replace(/\s+/g, " ")
    .trim();
}

function structureCounts(draft: WorkoutDraft) {
  let steps = 0;
  let repeats = 0;
  for (const block of draft.modules) {
    if (isRepeat(block)) {
      repeats += block.times;
      steps += block.steps.length;
      continue;
    }
    steps += 1;
  }
  return { steps, repeats };
}

function targetMode(draft: WorkoutDraft): IntensityKind | "mixed" {
  const kinds = new Set<IntensityKind>();
  const visit = (step: WorkoutStep) => {
    if (step.intensityKind !== "none") kinds.add(step.intensityKind);
  };
  for (const block of draft.modules) {
    if (isRepeat(block)) block.steps.forEach(visit);
    else visit(block);
  }
  if (kinds.size === 0) return "none";
  if (kinds.size === 1) return [...kinds][0] ?? "none";
  return "mixed";
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function updateModules(
  draft: WorkoutDraft,
  updater: (modules: WorkoutModule[]) => WorkoutModule[],
): WorkoutDraft {
  return { ...draft, modules: updater(draft.modules) };
}

function StepTypeIcon({ stepType }: { stepType: WorkoutStepType }) {
  const Icon = STEP_ICONS[stepType];
  return <Icon className="size-3.5" />;
}

function StepFields({
  step,
  ftp,
  onChange,
  onRemove,
  onNeedFtp,
  t,
}: {
  step: WorkoutStep;
  ftp: number | null;
  onChange: (step: WorkoutStep) => void;
  onRemove: () => void;
  onNeedFtp: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const durationId = `${step.id}-duration`;
  const targetId = `${step.id}-target`;
  const durationInvalid =
    step.durationValue != null &&
    (parseDurationNumber(step.durationValue) == null ||
      step.durationValue <= 0);
  const paceMeasure = paceMeasureFromText(step.intensityValue);
  const powerUnit = /%|ftp/i.test(step.intensityValue) ? "%" : "W";

  return (
    <div className={styles.stepCard}>
      <div className={styles.stepTop}>
        <div className={styles.stepName}>
          <span className={styles.stepIcon}>
            <StepTypeIcon stepType={step.stepType} />
          </span>
          <span>{t(`builder.stepTypes.${step.stepType}`)}</span>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onRemove}
          aria-label={t("builder.removeStep")}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className={styles.stepGrid}>
        <Field label={t("builder.stepType")}>
          <Select
            value={step.stepType}
            onValueChange={(value) =>
              onChange({ ...step, stepType: value as WorkoutStepType })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STEP_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`builder.stepTypes.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("builder.duration")} htmlFor={durationId}>
          <Input
            id={durationId}
            inputMode="decimal"
            aria-invalid={durationInvalid}
            value={step.durationValue ?? ""}
            onChange={(event) => {
              const raw = event.target.value.trim();
              onChange({
                ...step,
                durationValue: raw === "" ? null : Number(raw),
              });
            }}
          />
        </Field>
        <Field label={t("builder.unit")}>
          <Select
            value={step.durationUnit}
            onValueChange={(value) => {
              const nextUnit = value as DurationUnit;
              const converted = convertDurationQuantity(
                step.durationValue,
                step.durationUnit,
                nextUnit,
              );
              onChange({
                ...step,
                durationUnit: nextUnit,
                durationValue: converted ?? step.durationValue,
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {t(`builder.units.${unit}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className={styles.intensityGrid}>
        <Field label={t("builder.targetType")}>
          <Select
            value={step.intensityKind}
            onValueChange={(value) =>
              onChange({ ...step, intensityKind: value as IntensityKind })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTENSITY_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`builder.intensityKinds.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("builder.target")} htmlFor={targetId}>
          <Input
            id={targetId}
            value={
              step.intensityKind === "none"
                ? step.freeText
                : step.intensityValue
            }
            placeholder={t(
              `builder.intensityPlaceholders.${step.intensityKind}`,
            )}
            onChange={(event) => {
              const value = event.target.value;
              onChange(
                step.intensityKind === "none"
                  ? { ...step, freeText: value }
                  : { ...step, intensityValue: value },
              );
            }}
          />
        </Field>
        {step.intensityKind === "pace" ? (
          <Field label={t("builder.paceUnit")}>
            <Select
              value={paceMeasure}
              onValueChange={(value) => {
                const next = convertPaceText(
                  step.intensityValue,
                  value as PaceMeasure,
                );
                if (!next) return;
                onChange({ ...step, intensityValue: next });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACE_OPTIONS.map((option) => (
                  <SelectItem key={option.measure} value={option.measure}>
                    {t(`builder.paceUnits.${option.key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {step.intensityKind === "power" ? (
          <Field label={t("builder.powerUnit")}>
            <Select
              value={powerUnit}
              onValueChange={(value) => {
                const next = convertPowerText(
                  step.intensityValue,
                  value as "W" | "%",
                  ftp ?? Number.NaN,
                );
                if (!next) {
                  onNeedFtp();
                  return;
                }
                onChange({ ...step, intensityValue: next });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="W">{t("builder.powerUnits.W")}</SelectItem>
                <SelectItem value="%">
                  {t("builder.powerUnits.percent")}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </div>
    </div>
  );
}

export function WorkoutEditorClient({
  docsHref,
  dslHref,
  lang,
  initialInputs,
}: {
  docsHref: string;
  dslHref: string;
  lang: string;
  initialInputs: WorkoutShareInputs;
}) {
  const t = useTranslations("workoutEditor.page");
  const [draft, setDraft] = useState(initialInputs.draft);
  const [example, setExample] = useState<WorkoutExampleId | null>(
    initialInputs.example,
  );
  const [copied, setCopied] = useState<"dsl" | "intervals" | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [fitError, setFitError] = useState<string | null>(null);
  const [fitName, setFitName] = useState<string | null>(null);
  const [isEncoding, setIsEncoding] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [ftpText, setFtpText] = useState("");
  const [ftpError, setFtpError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const copiedTimer = useRef<number | null>(null);
  const shareTimer = useRef<number | null>(null);

  const dsl = useMemo(() => workoutToDsl(draft), [draft]);
  const intervalsDoc = useMemo(() => formatIntervalsDoc(draft), [draft]);
  const segments = useMemo(() => workoutPreviewSegments(draft), [draft]);
  const totalSeconds = useMemo(() => workoutTotalSeconds(draft), [draft]);
  const counts = useMemo(() => structureCounts(draft), [draft]);
  const mode = useMemo(() => targetMode(draft), [draft]);
  const dslSample = useMemo(() => compactDsl(dsl), [dsl]);
  const ready = hasMeaningfulWorkout(draft);
  const distancePreview = workoutHasDistance(draft);
  const ftp = parseDurationNumber(ftpText);
  const ftpValue = ftp != null && ftp > 0 ? ftp : null;
  const shareTooLong = workoutShareTooLong(draft, example);

  useInstantToolAnalytics("workout_editor", "build", ready);

  useEffect(() => {
    const next = nextWorkoutShareUrl(window.location.href, draft, example);
    if (next.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", next.href);
    }
  }, [draft, example]);

  useEffect(
    () => () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
      if (shareTimer.current != null) window.clearTimeout(shareTimer.current);
    },
    [],
  );

  const editDraft = (updater: (current: WorkoutDraft) => WorkoutDraft) => {
    requestRef.current += 1;
    setExample(null);
    setDraft(updater);
  };

  const loadExample = (id: WorkoutExampleId) => {
    requestRef.current += 1;
    setExample(id);
    setDraft(createExampleWorkout(id));
    setImportError(null);
    setFitError(null);
    trackToolEvent("tool_completed", "workout_editor", {
      action: "load_example",
      stage: id,
    });
  };

  const handleCopy = async (format: "dsl" | "intervals") => {
    const value = format === "dsl" ? dsl : intervalsDoc;
    try {
      await copyText(value);
      setCopied(format);
      setCopyError(false);
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(null), 1600);
      trackToolEvent("tool_result_copied", "workout_editor", {
        lang,
        sport: draft.sport,
        export_format: format,
      });
    } catch {
      setCopyError(true);
      trackToolEvent("tool_failed", "workout_editor", {
        lang,
        error_code: "clipboard_failed",
      });
    }
  };

  const handleDownloadFit = async () => {
    const startedAt = performance.now();
    setFitError(null);
    setFitName(null);
    if (!ready) {
      setFitError(t("builder.emptyExport"));
      return;
    }
    setIsEncoding(true);
    const requestId = requestRef.current;
    try {
      const { encodeWorkoutFit } = await import("./workout-fit");
      if (requestId !== requestRef.current) return;
      const bytes = encodeWorkoutFit(draft);
      const filename = `${workoutDownloadStem(draft.name)}.fit`;
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type: "application/octet-stream" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setFitName(filename);
      trackToolEvent("tool_exported", "workout_editor", {
        action: "download_fit",
        export_format: "fit",
        sport: fitSportForWorkout(draft.sport),
        duration_ms: elapsedMilliseconds(startedAt),
      });
    } catch (error) {
      setFitError(t("builder.fitFailed"));
      trackToolEvent("tool_failed", "workout_editor", {
        action: "download_fit",
        error_code: "export_failed",
      });
      captureToolFailure({
        tool: "workout_editor",
        action: "download_fit",
        endpoint: "browser:workout-fit",
        error,
        reason: "fit_encode_failed",
      });
    } finally {
      setIsEncoding(false);
    }
  };

  const handleShare = async () => {
    if (!ready) return;
    const next = nextWorkoutShareUrl(window.location.href, draft, example);
    if (next.tooLong) {
      setShareError(false);
      return;
    }
    const url = shareResultUrl(next.href);
    window.history.replaceState(window.history.state, "", url);
    try {
      if (navigator.share) {
        await navigator.share({ title: draft.name || t("title"), url });
        trackToolEvent("tool_result_copied", "workout_editor", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      trackToolEvent("tool_result_copied", "workout_editor", {
        action: "copy_share_link",
      });
      setShareCopied(true);
      setShareError(false);
      if (shareTimer.current != null) window.clearTimeout(shareTimer.current);
      shareTimer.current = window.setTimeout(() => setShareCopied(false), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "workout_editor", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      setShareError(true);
      setShareCopied(false);
    }
  };

  const handlePrint = () => {
    if (!ready) return;
    trackToolEvent("tool_result_copied", "workout_editor", {
      action: "print_result_card",
    });
    window.print();
  };

  const applyImported = (next: WorkoutDraft) => {
    setExample(null);
    setDraft(next);
    setImportError(null);
  };

  const handleImportIntervals = () => {
    try {
      applyImported(
        parseIntervalsDocInput(importText, {
          name: draft.name,
          sport: draft.sport,
          notes: draft.notes,
        }),
      );
      trackToolEvent("tool_completed", "workout_editor", {
        action: "import_intervals",
        sport: draft.sport,
      });
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "intervals_doc_empty";
      setImportError(
        code === "intervals_doc_invalid_json"
          ? t("builder.importInvalidJson")
          : t("builder.importEmpty"),
      );
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const requestId = ++requestRef.current;
    setImportError(null);
    if (file.size > FILE_LIMIT_BYTES) {
      setImportError(t("builder.importTooLarge"));
      return;
    }
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".json") || file.type.includes("json")) {
        const text = await file.text();
        if (requestId !== requestRef.current) return;
        applyImported(
          parseIntervalsDocInput(text, {
            name: draft.name || file.name.replace(/\.json$/i, ""),
            sport: draft.sport,
            notes: draft.notes,
          }),
        );
        return;
      }
      const { workoutFromFit } = await import("./workout-fit");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (requestId !== requestRef.current) return;
      const next = workoutFromFit(bytes, {
        name: draft.name || file.name.replace(/\.fit$/i, ""),
        sport: draft.sport,
        notes: draft.notes,
      });
      if (!next) {
        setImportError(t("builder.importFitFailed"));
        return;
      }
      applyImported(next);
      trackToolEvent("tool_completed", "workout_editor", {
        action: "import_file",
        sport: next.sport,
      });
    } catch (error) {
      if (requestId !== requestRef.current) return;
      const code = error instanceof Error ? error.message : "";
      setImportError(
        code === "intervals_doc_invalid_json"
          ? t("builder.importInvalidJson")
          : t("builder.importFitFailed"),
      );
    }
  };

  return (
    <div id="builder" className={styles.workbench}>
      <div className={styles.builderHead}>
        <div className={styles.builderGrid}>
          <Field label={t("builder.name")} htmlFor="workout-name">
            <Input
              id="workout-name"
              value={draft.name}
              placeholder={t("builder.namePlaceholder")}
              onChange={(event) =>
                editDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </Field>
          <Field label={t("builder.sport")}>
            <Select
              value={draft.sport}
              onValueChange={(value) =>
                editDraft((current) => ({
                  ...current,
                  sport: value as WorkoutSport,
                }))
              }
            >
              <SelectTrigger id="workout-sport" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKOUT_SPORTS.map((sport) => (
                  <SelectItem key={sport} value={sport}>
                    {t(`builder.sports.${sport}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("builder.ftpForPercent")} htmlFor="workout-ftp">
            <Input
              id="workout-ftp"
              inputMode="decimal"
              aria-invalid={ftpError}
              value={ftpText}
              placeholder={t("builder.ftpPlaceholder")}
              onChange={(event) => {
                setFtpText(event.target.value);
                setFtpError(false);
              }}
            />
          </Field>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              editDraft((current) => ({
                ...current,
                modules: [...current.modules, createEmptyStep("work")],
              }))
            }
          >
            <Plus className="size-4" />
            {t("builder.addStep")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              editDraft((current) => ({
                ...current,
                modules: [...current.modules, createEmptyRepeat()],
              }))
            }
          >
            <Repeat2 className="size-4" />
            {t("builder.addInterval")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => loadExample("intervals")}
          >
            {t("builder.exampleIntervals")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => loadExample("pool")}
          >
            {t("builder.examplePool")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            {t("builder.importFile")}
          </Button>
          <input
            ref={fileRef}
            className={styles.fileInput}
            type="file"
            accept=".fit,.json,application/json"
            aria-label={t("builder.importFile")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void handleFile(file);
            }}
          />
        </div>
        {ftpError ? (
          <p role="alert" className={styles.error}>
            {t("builder.ftpInvalid")}
          </p>
        ) : null}
        {importError ? (
          <p role="alert" className={styles.error}>
            {importError}
          </p>
        ) : null}
        <details className={styles.notes}>
          <summary>{t("builder.notes")}</summary>
          <Textarea
            id="workout-notes"
            value={draft.notes}
            onChange={(event) =>
              editDraft((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            rows={3}
            placeholder={t("builder.notesPlaceholder")}
          />
        </details>
      </div>

      <div className={styles.previewColumn}>
        <div id="result" className={styles.printSheet}>
          <div className={styles.sheetBrand}>
            <p>{t("builder.scorecardKicker")}</p>
            <span>Trainingload.ai</span>
          </div>
          <div className={styles.previewHead}>
            <h2 className={styles.previewTitle}>
              {draft.name || t("builder.preview")}
            </h2>
            <p className={styles.previewClock}>
              {t("builder.totalDuration", {
                duration: formatClock(totalSeconds),
              })}
            </p>
          </div>
          {distancePreview ? (
            <p className={styles.status}>{t("builder.distancePreviewNote")}</p>
          ) : null}
          <WorkoutTimeline
            segments={ready ? segments : []}
            emptyLabel={t("builder.emptyPreview")}
            stepLabel={(stepType, repeatTimes, intensity) =>
              `${t(`builder.stepTypes.${stepType}`)}${repeatTimes ? ` × ${repeatTimes}` : ""}${intensity ? ` · ${intensity}` : ""}`
            }
          />

          <section
            className={styles.scorecard}
            aria-labelledby="export-scorecard-title"
          >
            {example ? (
              <p className={styles.exampleBadge}>{t("builder.exampleBadge")}</p>
            ) : null}

            <h2 id="export-scorecard-title" className={styles.scorecardTitle}>
              {t("builder.scorecardTitle")}
            </h2>
            <dl className={styles.metrics}>
              <div className={styles.metric}>
                <dt>
                  <span>{t("builder.metrics.duration")}</span>
                </dt>
                <dd>
                  <strong>{formatClock(totalSeconds)}</strong>
                </dd>
              </div>
              <div className={styles.metric}>
                <dt>
                  <span>{t("builder.metrics.steps")}</span>
                </dt>
                <dd>
                  <strong>{counts.steps}</strong>
                </dd>
              </div>
              <div className={styles.metric}>
                <dt>
                  <span>{t("builder.metrics.repeats")}</span>
                </dt>
                <dd>
                  <strong>{counts.repeats}</strong>
                </dd>
              </div>
              <div className={styles.metric}>
                <dt>
                  <span>{t("builder.metrics.target")}</span>
                </dt>
                <dd>
                  <strong>{t(`builder.metrics.targets.${mode}`)}</strong>
                </dd>
              </div>
            </dl>
            <div className={styles.exportActions}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => void handleDownloadFit()}
                disabled={!ready || isEncoding}
              >
                {isEncoding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {isEncoding
                  ? t("builder.downloadingFit")
                  : t("builder.downloadFit")}
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => void handleCopy("intervals")}
                disabled={!ready}
              >
                {copied === "intervals"
                  ? t("builder.copied")
                  : t("builder.copyIntervals")}
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => void handleCopy("dsl")}
                disabled={!ready}
              >
                {copied === "dsl" ? t("builder.copied") : t("builder.copyDsl")}
              </button>
            </div>
            <div className={styles.shareRow}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={handlePrint}
                disabled={!ready}
              >
                <Printer className="size-4" aria-hidden />
                {t("builder.print")}
              </button>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => void handleShare()}
                disabled={!ready}
              >
                <Share2 className="size-4" aria-hidden />
                {shareCopied ? t("builder.shared") : t("builder.share")}
              </button>
            </div>
            {dslSample ? (
              <pre className={styles.sample}>{dslSample}</pre>
            ) : null}
            {fitName ? (
              <p className={styles.status} role="status">
                {t("builder.fitReady", { filename: fitName })}
              </p>
            ) : null}
            {fitError ? (
              <p className={styles.error} role="alert">
                {fitError}
              </p>
            ) : null}
            {copyError ? (
              <p className={styles.error} role="alert">
                {t("builder.copyFailed")}
              </p>
            ) : null}
            {shareError ? (
              <p className={styles.error} role="alert">
                {t("builder.shareError")}
              </p>
            ) : null}
            {shareTooLong ? (
              <p className={styles.status} role="status">
                {t("builder.shareTooLong")}
              </p>
            ) : null}
            <p className={styles.sourceNote}>
              <a
                href="https://developer.garmin.com/fit/file-types/workout/"
                rel="noreferrer"
                target="_blank"
              >
                {t("builder.sources.garmin")}
              </a>
              <span aria-hidden="true"> · </span>
              <a href="https://intervals.icu/" rel="noreferrer" target="_blank">
                {t("builder.sources.intervals")}
              </a>
              <span aria-hidden="true"> · </span>
              <a href={dslHref}>{t("builder.sources.dsl")}</a>
            </p>
          </section>
        </div>
        <div className={styles.rawList}>
          <details>
            <summary>{t("builder.exportFitTitle")}</summary>
            <p className={styles.status}>{t("builder.exportFitHint")}</p>
          </details>
          <details>
            <summary>{t("builder.exportIntervalsTitle")}</summary>
            <p className={styles.status}>{t("builder.exportIntervalsHint")}</p>
            <pre className={styles.raw}>
              {ready ? intervalsDoc : t("builder.emptyExport")}
            </pre>
            <Field
              label={t("builder.importIntervals")}
              htmlFor="intervals-import"
            >
              <Textarea
                id="intervals-import"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                rows={4}
                placeholder={t("builder.importIntervalsPlaceholder")}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              onClick={handleImportIntervals}
            >
              {t("builder.importIntervalsAction")}
            </Button>
          </details>
          <details>
            <summary>{t("builder.dslTitle")}</summary>
            <p className={styles.status}>{t("builder.exportDslHint")}</p>
            <pre className={styles.raw}>{dsl || t("builder.emptyExport")}</pre>
          </details>
        </div>
        <p className={styles.status}>{t("builder.saveHint")}</p>
        <a href={docsHref} className={styles.docsLink}>
          {t("builder.saveCta")}
        </a>
      </div>

      <div className={styles.stepsColumn}>
        {draft.modules.length === 0 ? (
          <p className={styles.empty}>{t("builder.emptyStructure")}</p>
        ) : null}
        {draft.modules.map((block, blockIndex) => {
          if (isRepeat(block)) {
            return (
              <div key={block.id} className={styles.repeatCard}>
                <div className={styles.repeatHead}>
                  <Field
                    label={t("builder.repeatTimes")}
                    htmlFor={`${block.id}-times`}
                  >
                    <Input
                      id={`${block.id}-times`}
                      className="w-24"
                      inputMode="numeric"
                      value={block.times}
                      onChange={(event) => {
                        const times = Math.max(
                          1,
                          Math.round(Number(event.target.value) || 1),
                        );
                        editDraft((current) =>
                          updateModules(current, (modules) =>
                            modules.map((item) =>
                              item.id === block.id && isRepeat(item)
                                ? { ...item, times }
                                : item,
                            ),
                          ),
                        );
                      }}
                    />
                  </Field>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() =>
                      editDraft((current) =>
                        updateModules(current, (modules) =>
                          modules.filter((item) => item.id !== block.id),
                        ),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                    {t("builder.removeInterval")}
                  </button>
                </div>
                <div className={styles.stepStack}>
                  {block.steps.map((step) => (
                    <StepFields
                      key={step.id}
                      step={step}
                      ftp={ftpValue}
                      t={t}
                      onNeedFtp={() => setFtpError(true)}
                      onChange={(next) =>
                        editDraft((current) =>
                          updateModules(current, (modules) =>
                            modules.map((item) =>
                              item.id === block.id && isRepeat(item)
                                ? {
                                    ...item,
                                    steps: item.steps.map((child) =>
                                      child.id === step.id ? next : child,
                                    ),
                                  }
                                : item,
                            ),
                          ),
                        )
                      }
                      onRemove={() =>
                        editDraft((current) =>
                          updateModules(current, (modules) =>
                            modules.map((item) =>
                              item.id === block.id && isRepeat(item)
                                ? {
                                    ...item,
                                    steps: item.steps.filter(
                                      (child) => child.id !== step.id,
                                    ),
                                  }
                                : item,
                            ),
                          ),
                        )
                      }
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    editDraft((current) =>
                      updateModules(current, (modules) =>
                        modules.map((item) =>
                          item.id === block.id && isRepeat(item)
                            ? {
                                ...item,
                                steps: [...item.steps, createEmptyStep("work")],
                              }
                            : item,
                        ),
                      ),
                    )
                  }
                >
                  <Plus className="size-4" />
                  {t("builder.addRepeatStep")}
                </Button>
              </div>
            );
          }

          return (
            <StepFields
              key={block.id}
              step={block}
              ftp={ftpValue}
              t={t}
              onNeedFtp={() => setFtpError(true)}
              onChange={(next) =>
                editDraft((current) =>
                  updateModules(current, (modules) =>
                    modules.map((item, index) =>
                      index === blockIndex ? next : item,
                    ),
                  ),
                )
              }
              onRemove={() =>
                editDraft((current) =>
                  updateModules(current, (modules) =>
                    modules.filter((item) => item.id !== block.id),
                  ),
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}
