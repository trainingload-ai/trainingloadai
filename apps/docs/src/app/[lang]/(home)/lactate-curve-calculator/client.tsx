"use client";

import {
  Component,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { withLocalePath } from "@/lib/locale-url";
import { ArrowRight, Download, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildToolAppUrl } from "@shared/product-analytics";
import { elapsedMilliseconds } from "@/lib/tool-analytics";
import {
  DEFAULT_LACTATE_PAIR,
  analyzeLactate,
  LactateInputError,
  LACTATE_METHOD_IDS,
  selectLactatePair,
  type LactateAnalysis,
  type LactateMethodId,
  type LactateSport,
  type LactateStage,
} from "@trainingloadai/shared/lactate-analysis";
import {
  intensityFromText,
  intensityToText,
  lactateExample,
  lactateResultCsv,
  LACTATE_FILE_BYTES,
  LACTATE_TEMPLATE,
  mapLactateRecording,
  parseLactateRecording,
  RecordingError,
  stagesFromDraft,
  type LactateDraft,
  type LactateRecording,
  type LactateUnit,
} from "@/lib/lactate-recording";
import {
  captureLactateFailure,
  createLactateAttempt,
  editedLactateOrigin,
  lactatePointBucket,
  LACTATE_TOOL_ID,
  trackLactateEvent,
  type LactateOrigin,
} from "@/lib/lactate-telemetry";
import type { LactateCopy } from "@/lib/lactate-curve-copy";
import {
  LactateSummary,
  LactateMethodComparison,
  LactateZones,
  LactateEmptyPreview,
} from "./report-sections";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import styles from "./lactate-curve.module.css";

const CurveChart = dynamic(
  () => import("./curve-chart").then((module) => module.LactateCurveChart),
  { loading: () => <div className={styles.chartLoading} aria-busy="true" /> },
);
const ResidualChart = dynamic(() =>
  import("./curve-chart").then((module) => module.LactateResidualChart),
);
const blankRows = (): LactateDraft[] =>
  Array.from({ length: 6 }, () => ({
    intensity: "",
    lactate: "",
    heartRate: "",
  }));

export function LactateToolFooter({
  copy,
  lang,
  placement = "tool_footer",
  origin,
  inputMethod,
  sport,
}: {
  copy: LactateCopy;
  lang: string;
  placement?: "tool_footer" | "result";
  origin?: LactateOrigin;
  inputMethod?: string;
  sport?: LactateSport;
}) {
  const imageLocale = lang.startsWith("zh") ? "zh" : "en";
  return (
    <section className={styles.productBridge} aria-label="Trainingload.ai">
      <div className={styles.bridgeContent}>
        <p className={styles.bridgeBrand}>Trainingload.ai</p>
        <h3>{copy.cta}</h3>
        <p className={styles.bridgeBody}>{copy.ctaBody}</p>
      </div>
      <div className={styles.bridgeDetails}>
        <ul className={styles.bridgeFeatures}>
          <li>{copy.presentation.ctaBenefitLoad}</li>
          <li>{copy.presentation.ctaBenefitZones}</li>
          <li>{copy.presentation.ctaBenefitPlan}</li>
        </ul>
        <div className={styles.bridgeActions}>
          <a
            className={styles.bridgePrimary}
            href={buildToolAppUrl({
              locale: lang,
              toolId: LACTATE_TOOL_ID,
              ctaPlacement: placement,
              destination: "signup",
            })}
            onClick={() =>
              trackLactateEvent("tool_app_cta_clicked", {
                lang,
                destination: "signup",
                cta_placement: placement,
                input_origin: origin,
                input_method: inputMethod,
                sport,
              })
            }
          >
            {copy.presentation.ctaAction}
            <ArrowRight aria-hidden="true" size={16} />
          </a>
          <a
            className={styles.bridgeSecondary}
            href={withLocalePath(lang, "/training-load")}
          >
            {copy.presentation.ctaExplore} ↗
          </a>
        </div>
        <p className={styles.caption}>{copy.presentation.ctaNote}</p>
      </div>
      <figure className={styles.bridgeVisual}>
        <div className={styles.bridgeImage}>
          <Image
            src={
              "/docs/analysis/" + imageLocale + "/pmc-forecast-overview.webp"
            }
            alt={copy.presentation.ctaImageAlt}
            width={1280}
            height={960}
            sizes="(max-width: 900px) 100vw, 650px"
            className="dark:hidden"
          />
          <Image
            src={
              "/docs/analysis/" +
              imageLocale +
              "/pmc-forecast-overview-dark.webp"
            }
            alt={copy.presentation.ctaImageAlt}
            width={1280}
            height={960}
            sizes="(max-width: 900px) 100vw, 650px"
            className="hidden dark:block"
          />
        </div>
        <figcaption>{copy.presentation.ctaImageCaption}</figcaption>
      </figure>
    </section>
  );
}
type Run = {
  analysis: LactateAnalysis;
  revision: number;
  origin: LactateOrigin;
  stageMinutes: string;
  sampleSite: string;
  incomplete: boolean;
  excluded: boolean;
  recorded: LactateStage[];
};

function Choice({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function download(content: string, name: string) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class ChartBoundary extends Component<
  { children: ReactNode; fallback: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    captureLactateFailure("visualization");
    trackLactateEvent("tool_failed", {
      stage: "visualization",
      error_code: "unknown",
      reason_code: "runtime_failed",
    });
  }
  render() {
    return this.state.failed ? (
      <p>{this.props.fallback}</p>
    ) : (
      this.props.children
    );
  }
}

export function LactateCurveCalculatorClient({
  copy: c,
  lang,
}: {
  copy: LactateCopy;
  lang: string;
}) {
  const id = useId();
  const [mode, setMode] = useState<"input" | "report">("input");
  const [methodOpen, setMethodOpen] = useState(false);
  const renderedRevision = useRef<number | null>(null);
  const reportHeading = useRef<HTMLHeadingElement>(null);
  const inputPanel = useRef<HTMLElement>(null);
  const [sport, setSport] = useState<LactateSport>("cycling");
  const [unit, setUnit] = useState<LactateUnit>("watts");
  const previewAnalysis = useMemo(
    () => analyzeLactate({ sport, stages: lactateExample(sport) }),
    [sport],
  );
  const [rows, setRows] = useState(blankRows);
  const [origin, setOrigin] = useState<LactateOrigin>("user");
  const [inputMethod, setInputMethod] = useState("manual");
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    text: string;
    code?: string;
    row?: number;
  } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pending, setPending] = useState<{
    data: LactateRecording;
    source: "paste" | "csv";
  } | null>(null);
  const [mapping, setMapping] = useState({
    intensity: 0,
    lactate: 1,
    heartRate: 2,
  });
  const [chartMethod, setChartMethod] =
    useState<LactateMethodId>("log_poly_moddmax");
  const [pair, setPair] = useState(DEFAULT_LACTATE_PAIR);
  const [stageMinutes, setStageMinutes] = useState("");
  const [sampleSite, setSampleSite] = useState("not_recorded");
  const [incomplete, setIncomplete] = useState(false);
  const [excluded, setExcluded] = useState(false);
  const [copied, setCopied] = useState(false);
  const viewed = useRef(false);
  const attempt = useRef(createLactateAttempt());
  const lastAnalyzedRevision = useRef<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const stale = run !== null && run.revision !== revision;
  const dirty = rows.some(
    (row) => row.intensity || row.lactate || row.heartRate,
  );
  const context = {
    input_origin: origin,
    input_method: inputMethod,
    sport,
    lang,
  };
  const intensityUnit = sport === "cycling" ? "W" : "km/h";
  const unitOptions =
    sport === "cycling"
      ? [{ value: "watts", label: "W" }]
      : [
          { value: "kmh", label: "km/h" },
          { value: "pace_km", label: "min/km" },
          { value: "pace_mile", label: "min/mile" },
        ];

  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      trackLactateEvent("tool_viewed", { lang });
    }
  }, [lang]);
  function editData() {
    setError(null);
    setMode("input");
    requestAnimationFrame(() => {
      inputPanel.current?.scrollIntoView({ block: "start" });
      inputPanel.current
        ?.querySelector<HTMLInputElement>("input:not([type=file])")
        ?.focus({ preventScroll: true });
    });
  }
  function revealReport() {
    setMode("report");
    requestAnimationFrame(() => {
      reportHeading.current?.focus({ preventScroll: true });
      reportHeading.current?.scrollIntoView({ block: "start" });
    });
  }
  function invalidate() {
    revisionRef.current++;
    setRevision(revisionRef.current);
    setError(null);
    setCopied(false);
  }
  function changeRows(next: LactateDraft[]) {
    invalidate();
    setRows(next);
    setOrigin(editedLactateOrigin(origin));
    setInputMethod("manual");
  }
  function clear() {
    if (dirty && !window.confirm(c.overwrite)) return;
    invalidate();
    setRows(blankRows());
    setOrigin("user");
    setInputMethod("manual");
    setRun(null);
    setPending(null);
    setPasteText("");
    setStageMinutes("");
    setSampleSite("not_recorded");
    setIncomplete(false);
    setExcluded(false);
  }
  function loadExample() {
    if (dirty && !window.confirm(c.overwrite)) return;
    invalidate();
    setRows(
      lactateExample(sport).map((row) => ({
        intensity: intensityToText(row.intensity, unit),
        lactate: String(row.lactate),
        heartRate: String(row.heartRate ?? ""),
      })),
    );
    setOrigin("example");
    setInputMethod("example");
    setRun(null);
    setPending(null);
    setPasteText("");
    setStageMinutes("");
    setSampleSite("not_recorded");
    setIncomplete(false);
    setExcluded(false);
  }
  function changeSport(value: string) {
    if (!value || value === sport || (dirty && !window.confirm(c.resetSport)))
      return;
    invalidate();
    setSport(value as LactateSport);
    setUnit(value === "cycling" ? "watts" : "kmh");
    setRows(blankRows());
    setOrigin("user");
    setInputMethod("manual");
    setRun(null);
    setPending(null);
    setPasteText("");
    setIncomplete(false);
    setExcluded(false);
    setStageMinutes("");
    setSampleSite("not_recorded");
  }
  function changeUnit(value: string) {
    const next = value as LactateUnit;
    invalidate();
    setRows(
      rows.map((row) => {
        const number = intensityFromText(row.intensity, unit);
        return {
          ...row,
          intensity: Number.isFinite(number)
            ? intensityToText(number, next)
            : row.intensity,
        };
      }),
    );
    setUnit(next);
  }
  function showInputError(
    cause: unknown,
    stage: "validation" | "parsing",
    source?: "csv" | "paste",
  ) {
    const known =
      cause instanceof LactateInputError || cause instanceof RecordingError;
    const code = known ? cause.code : "parse_failed";
    const row = known ? cause.row : undefined;
    const text =
      cause instanceof LactateInputError
        ? c.reasons[cause.code]
        : c.recordingError;
    setError({
      text: `${row === undefined ? "" : `${c.stage} ${row + 1}: `}${text}`,
      code,
      row,
    });
    trackLactateEvent("tool_input_rejected", {
      ...context,
      stage,
      ...(source ? { input_method: source, input_origin: "user" } : {}),
      reason_code: code,
    });
  }
  function prepareImport(text: string, source: "paste" | "csv") {
    try {
      const data = parseLactateRecording(text);
      setPending({ data, source });
      setMapping(data.suggested);
      setError(null);
    } catch (cause) {
      showInputError(cause, "parsing", source);
    }
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    const snapshot = revisionRef.current;
    trackLactateEvent("tool_file_selected", {
      ...context,
      input_method: "csv",
      file_extension: "csv",
      file_size_bucket:
        chosen.size <= 16 * 1024
          ? "0-16KiB"
          : chosen.size <= LACTATE_FILE_BYTES
            ? "16-256KiB"
            : "over-limit",
    });
    try {
      if (chosen.size > LACTATE_FILE_BYTES)
        throw new RecordingError("file_too_large");
      if (!/\.csv$/i.test(chosen.name))
        throw new RecordingError("invalid_input");
      const text = await chosen.text();
      if (snapshot === revisionRef.current) prepareImport(text, "csv");
    } catch (cause) {
      showInputError(cause, "parsing", "csv");
    } finally {
      event.target.value = "";
    }
  }
  function confirmImport() {
    if (!pending || attempt.current.running) return;
    try {
      const mapped = mapLactateRecording(pending.data, mapping);
      if (mapped.length > 31) throw new RecordingError("too_many_rows");
      if (dirty && !window.confirm(c.overwrite)) return;
      invalidate();
      setRows(mapped);
      setOrigin("user");
      setInputMethod(pending.source);
      setPending(null);
      setPasteOpen(false);
      setPasteText("");
      setRun(null);
    } catch (cause) {
      showInputError(cause, "parsing", pending.source);
    }
  }
  async function analyze(started: number) {
    if (attempt.current.running) return;
    if (lastAnalyzedRevision.current === revisionRef.current && run) {
      revealReport();
      return;
    }
    let recorded: LactateStage[];
    let stages: LactateStage[];
    try {
      recorded = stagesFromDraft(rows, sport, unit);
      stages = incomplete && excluded ? recorded.slice(0, -1) : recorded;
      if (
        stageMinutes.trim() &&
        (!Number.isFinite(Number(stageMinutes)) || Number(stageMinutes) <= 0)
      )
        throw new RecordingError("invalid_input");
      // Validate the included stages before emitting a calculation start.
      stagesFromDraft(
        stages.map((row) => ({
          intensity: String(row.intensity),
          lactate: String(row.lactate),
          heartRate: String(row.heartRate ?? ""),
        })),
        sport,
        sport === "cycling" ? "watts" : "kmh",
      );
    } catch (cause) {
      showInputError(cause, "validation");
      return;
    }
    if (!attempt.current.start()) return;
    setBusy(true);
    setError(null);
    const snapshot = revisionRef.current;
    lastAnalyzedRevision.current = snapshot;
    const properties = {
      ...context,
      point_count_bucket: lactatePointBucket(
        stages.filter((row) => row.intensity > 0).length,
      ),
    };
    trackLactateEvent("tool_started", { ...properties, action: "analyze" });
    let stage: "load" | "analysis" = "load";
    try {
      const { analyzeLactate } =
        await import("@trainingloadai/shared/lactate-analysis");
      stage = "analysis";
      const analysis = analyzeLactate({ sport, stages });
      if (snapshot !== revisionRef.current) return;
      setRun({
        analysis,
        revision: snapshot,
        origin,
        stageMinutes,
        sampleSite,
        incomplete,
        excluded: incomplete && excluded,
        recorded,
      });
      revealReport();
      setPair(DEFAULT_LACTATE_PAIR);
      setChartMethod("log_poly_moddmax");
      trackLactateEvent(
        analysis.status === "unavailable" ? "tool_no_result" : "tool_completed",
        {
          ...properties,
          status: analysis.status,
          output_format: "lactate_analysis",
          duration_ms: elapsedMilliseconds(started),
          ...(analysis.status === "unavailable"
            ? { reason_code: "no_applicable_method" }
            : {}),
        },
      );
    } catch {
      lastAnalyzedRevision.current = null;
      setError({ text: c.runtimeError });
      trackLactateEvent("tool_failed", {
        ...properties,
        stage,
        error_code: "unknown",
        reason_code: "runtime_failed",
      });
      captureLactateFailure(stage);
    } finally {
      attempt.current.finish();
      setBusy(false);
    }
  }
  function resultCsv() {
    if (!run) return "";
    const site = run.sampleSite;
    const minutes = run.stageMinutes ? Number(run.stageMinutes) : "";
    const metadata = `\r\nstage_minutes,${minutes}\r\nsample_site,${site}\r\nlast_stage_incomplete,${run.incomplete}\r\nlast_stage_excluded,${run.excluded}`;
    const last = run.recorded.at(-1);
    return (
      lactateResultCsv(run.analysis) +
      metadata +
      (run.excluded && last
        ? `\r\nexcluded_intensity,${last.intensity}\r\nexcluded_lactate,${last.lactate}\r\nexcluded_heart_rate,${last.heartRate ?? ""}`
        : "")
    );
  }
  function exportResults() {
    if (!run || stale) return;
    try {
      download(resultCsv(), "lactate-analysis.csv");
      trackLactateEvent("tool_exported", {
        ...context,
        input_origin: run.origin,
        export_format: "csv",
      });
    } catch {
      setError({ text: c.exportError });
      trackLactateEvent("tool_failed", {
        ...context,
        stage: "export",
        error_code: "export_failed",
      });
      captureLactateFailure("export");
    }
  }
  async function copyResults() {
    if (!run || stale) return;
    try {
      await navigator.clipboard.writeText(resultCsv());
      setCopied(true);
      trackLactateEvent("tool_result_copied", {
        ...context,
        input_origin: run.origin,
        action: "copy",
      });
    } catch {
      setError({ text: c.exportError });
      trackLactateEvent("tool_failed", {
        ...context,
        stage: "clipboard",
        error_code: "clipboard_failed",
      });
    }
  }
  function changePair(key: "lt1Method" | "lt2Method", value: string) {
    if (!run || stale || !LACTATE_METHOD_IDS.includes(value as LactateMethodId))
      return;
    const next = { ...pair, [key]: value as LactateMethodId };
    setPair(next);
    setRun({ ...run, analysis: selectLactatePair(run.analysis, next) });
    trackLactateEvent("tool_visualization_interacted", {
      ...context,
      action: "method_selected",
      method_id: value,
    });
  }
  const available =
    run?.analysis.methods
      .filter((method) => method.status === "available")
      .map((method) => ({
        value: method.methodId,
        label: c.methodNames[method.methodId],
      })) ?? [];
  function selectChartMethod(value: LactateMethodId) {
    setChartMethod(value);
    setMethodOpen(true);
    trackLactateEvent("tool_visualization_interacted", {
      ...context,
      action: "method_selected",
      method_id: value,
    });
  }
  const inspectedMethod = run?.analysis.methods.find(
    (method) => method.methodId === chartMethod,
  );
  return (
    <div className={styles.toolRoot} data-lactate-tool data-view={mode}>
      <nav className={styles.workflowBar} aria-label={c.title}>
        <div className={styles.workflowSteps}>
          <button
            type="button"
            aria-current={mode === "input" ? "step" : undefined}
            onClick={editData}
          >
            1 <span>{c.presentation.workflowInput}</span>
          </button>
          <span aria-hidden="true">/</span>
          <button
            type="button"
            disabled={busy || !run || stale}
            aria-current={mode === "report" ? "step" : undefined}
            onClick={revealReport}
          >
            2 <span>{c.presentation.workflowReport}</span>
          </button>
        </div>
        {mode === "report" && run ? (
          <Button variant="ghost" size="sm" onClick={editData}>
            ← {c.presentation.editData}
          </Button>
        ) : null}
      </nav>
      {stale && mode === "input" ? (
        <Alert>
          <AlertDescription>{c.stale}</AlertDescription>
        </Alert>
      ) : null}
      <div className={styles.workspace}>
        <section
          ref={inputPanel}
          className={styles.inputPanel}
          aria-labelledby={`${id}-input`}
        >
          <h2 id={`${id}-input`} className={styles.title}>
            {c.inputTitle}
          </h2>
          <ToggleGroup
            type="single"
            value={sport}
            onValueChange={changeSport}
            disabled={busy}
            variant="outline"
            aria-label={`${c.cycling} / ${c.running}`}
          >
            <ToggleGroupItem value="cycling">{c.cycling}</ToggleGroupItem>
            <ToggleGroupItem value="running">{c.running}</ToggleGroupItem>
          </ToggleGroup>
          <Choice
            id={`${id}-unit`}
            label={c.intensity}
            value={unit}
            onChange={changeUnit}
            options={unitOptions}
            disabled={busy}
          />
          <details className={styles.inputGuide}>
            <summary>{c.presentation.inputGuide}</summary>
            <p className={styles.muted}>{c.inputHelp}</p>
          </details>
          <div className={styles.toolbar}>
            <Button variant="secondary" onClick={loadExample} disabled={busy}>
              {c.example}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>
              {c.clear}
            </Button>
          </div>
          <div className={styles.toolbar}>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPasteOpen(!pasteOpen)}
            >
              {c.paste}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                trackLactateEvent("tool_file_picker_opened", {
                  ...context,
                  input_method: "csv",
                });
                file.current?.click();
              }}
            >
              {c.import}
            </Button>
            <input
              ref={file}
              type="file"
              accept=".csv,text/csv"
              onChange={chooseFile}
              hidden
              aria-label={c.import}
              disabled={busy}
            />
            <Button
              variant="link"
              onClick={() => download(LACTATE_TEMPLATE, "lactate-template.csv")}
            >
              {c.template}
            </Button>
          </div>
          {pasteOpen ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${id}-paste`}>{c.paste}</FieldLabel>
                <Textarea
                  id={`${id}-paste`}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  maxLength={LACTATE_FILE_BYTES}
                  rows={5}
                />
                <FieldDescription>{c.pasteHelp}</FieldDescription>
              </Field>
              <Button
                variant="outline"
                onClick={() => prepareImport(pasteText, "paste")}
              >
                {c.mapping}
              </Button>
            </FieldGroup>
          ) : null}
          {pending ? (
            <div className={styles.mapping}>
              <h3 className={styles.subTitle}>{c.mapping}</h3>
              {(["intensity", "lactate", "heartRate"] as const).map((key) => (
                <Choice
                  key={key}
                  id={`${id}-map-${key}`}
                  label={c[key]}
                  value={String(mapping[key])}
                  onChange={(value) =>
                    setMapping({ ...mapping, [key]: Number(value) })
                  }
                  options={[
                    ...(key === "heartRate"
                      ? [{ value: "-1", label: c.noColumn }]
                      : []),
                    ...pending.data.headers.map((header, i) => ({
                      value: String(i),
                      label: header,
                    })),
                  ]}
                />
              ))}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {pending.data.headers.map((header, i) => (
                        <th key={i}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.data.rows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.actions}>
                <Button onClick={confirmImport}>{c.confirmImport}</Button>
                <Button variant="ghost" onClick={() => setPending(null)}>
                  {c.cancel}
                </Button>
              </div>
            </div>
          ) : null}
          {origin !== "user" ? (
            <p className={styles.notice}>{c.sample}</p>
          ) : null}
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.inputTable}`}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">
                    {c.intensity} (
                    {unitOptions.find((option) => option.value === unit)?.label}
                    )
                  </th>
                  <th scope="col">{c.lactate} (mmol/L)</th>
                  <th scope="col">{c.heartRate} (bpm)</th>
                  <th scope="col">
                    <span className="sr-only">{c.remove}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    {(["intensity", "lactate", "heartRate"] as const).map(
                      (key) => (
                        <td key={key}>
                          <Input
                            aria-label={`${c.stage} ${index + 1} ${c[key]}`}
                            aria-invalid={error?.row === index}
                            value={row[key]}
                            disabled={busy}
                            inputMode={
                              key === "intensity" && unit.startsWith("pace")
                                ? "text"
                                : "decimal"
                            }
                            onChange={(event) =>
                              changeRows(
                                rows.map((existing, i) =>
                                  i === index
                                    ? { ...existing, [key]: event.target.value }
                                    : existing,
                                ),
                              )
                            }
                          />
                        </td>
                      ),
                    )}
                    <td>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${c.remove} ${index + 1}`}
                        disabled={busy || rows.length <= 4}
                        onClick={() =>
                          changeRows(rows.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 data-icon="inline-start" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            variant="outline"
            disabled={busy || rows.length >= 31}
            onClick={() =>
              changeRows([
                ...rows,
                { intensity: "", lactate: "", heartRate: "" },
              ])
            }
          >
            <Plus data-icon="inline-start" />
            {c.add}
          </Button>
          <details className={styles.protocol}>
            <summary>{c.protocol}</summary>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${id}-minutes`}>
                  {c.stageMinutes}
                </FieldLabel>
                <Input
                  id={`${id}-minutes`}
                  inputMode="decimal"
                  value={stageMinutes}
                  disabled={busy}
                  onChange={(event) => {
                    invalidate();
                    setStageMinutes(event.target.value);
                  }}
                />
              </Field>
              <Choice
                id={`${id}-site`}
                label={c.sampleSite}
                value={sampleSite}
                onChange={(value) => {
                  invalidate();
                  setSampleSite(value);
                }}
                options={["not_recorded", "earlobe", "fingertip", "other"].map(
                  (value, i) => ({
                    value,
                    label: [c.notRecorded, c.earlobe, c.fingertip, c.other][i]!,
                  }),
                )}
                disabled={busy}
              />
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={incomplete}
                  disabled={busy}
                  onChange={(event) => {
                    invalidate();
                    setIncomplete(event.target.checked);
                  }}
                />
                {c.incomplete}
              </label>
              {incomplete ? (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={excluded}
                    disabled={busy}
                    onChange={(event) => {
                      invalidate();
                      setExcluded(event.target.checked);
                    }}
                  />
                  {c.excluded}
                </label>
              ) : null}
            </FieldGroup>
          </details>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error.text}</AlertDescription>
            </Alert>
          ) : null}
          {error?.code === "unsorted_stages" ? (
            <Button
              variant="outline"
              onClick={() =>
                changeRows(
                  [...rows].sort(
                    (a, b) =>
                      intensityFromText(a.intensity, unit) -
                      intensityFromText(b.intensity, unit),
                  ),
                )
              }
            >
              {c.sort}
            </Button>
          ) : null}
          <Button
            size="lg"
            onClick={(event) => void analyze(event.timeStamp)}
            disabled={busy}
            data-testid="lactate-analyze"
          >
            {busy ? c.calculating : c.analyze}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </section>
        <section
          className={styles.results}
          aria-labelledby={`${id}-results`}
          aria-live="polite"
        >
          <div className={styles.reportHeadingRow}>
            <h2
              ref={reportHeading}
              id={`${id}-results`}
              className={styles.title}
              tabIndex={-1}
            >
              {mode === "report" ? c.report : c.presentation.preview}
            </h2>
            {run && mode === "report" ? (
              <p className={styles.reportContext}>
                {run.origin !== "user"
                  ? c.sample
                  : `${sport === "cycling" ? c.cycling : c.running} · ${run.analysis.stages.filter((row) => row.intensity > 0).length} ${c.presentation.stages}`}
              </p>
            ) : null}
          </div>
          {!run || mode === "input" ? (
            <LactateEmptyPreview
              copy={c}
              onExample={loadExample}
              disabled={busy}
            >
              <CurveChart
                key={sport}
                analysis={previewAnalysis}
                methodId="log_poly_moddmax"
                copy={c}
              />
            </LactateEmptyPreview>
          ) : (
            <>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error.text}</AlertDescription>
                </Alert>
              ) : null}
              {stale ? (
                <Alert>
                  <AlertDescription>{c.stale}</AlertDescription>
                </Alert>
              ) : null}
              {run.analysis.status !== "complete" ? (
                <p className={styles.notice}>
                  {run.analysis.status === "partial" ? c.partial : c.noResult}
                </p>
              ) : null}
              <LactateSummary analysis={run.analysis} copy={c} pair={pair} />
              <section
                className={styles.overviewSection}
                aria-labelledby={`${id}-curve-heading`}
              >
                <div className={styles.overviewIntro}>
                  <h3 id={`${id}-curve-heading`}>{c.presentation.readCurve}</h3>
                  <p className={styles.muted}>{c.presentation.readCurveBody}</p>
                </div>
                <div className={styles.overviewGrid}>
                  <div className={styles.overviewPlot}>
                    <ChartBoundary key={run.revision} fallback={c.unavailable}>
                      <CurveChart
                        analysis={run.analysis}
                        methodId={chartMethod}
                        copy={c}
                        onRendered={() => {
                          if (renderedRevision.current === run.revision) return;
                          renderedRevision.current = run.revision;
                          trackLactateEvent("tool_visualization_rendered", {
                            ...context,
                            input_origin: run.origin,
                            renderer: "svg",
                            visualization_status: "ready",
                          });
                        }}
                      />
                    </ChartBoundary>
                  </div>
                  <aside className={styles.interpretation}>
                    <h4>{c.presentation.thresholdBasis}</h4>
                    {(["lt1Method", "lt2Method"] as const).map((key, i) => (
                      <div
                        key={key}
                        className={styles.thresholdBasis}
                        data-threshold={i + 1}
                      >
                        <p className={styles.label}>
                          LT{i + 1} · {c.methodNames[pair[key]]}
                        </p>
                        <p className={styles.caption}>
                          {c.methodDescriptions[pair[key]]}
                        </p>
                        <button
                          type="button"
                          onClick={() => selectChartMethod(pair[key])}
                        >
                          {c.presentation.moreDetails} →
                        </button>
                      </div>
                    ))}
                    {run.analysis.warnings.length ? (
                      <div>
                        <h3 className={styles.subTitle}>{c.quality}</h3>
                        <ul className={styles.notes}>
                          {run.analysis.warnings.map((warning) => (
                            <li key={warning}>{c.reasons[warning]}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className={styles.caption}>{c.methodHelp}</p>
                  </aside>
                </div>
              </section>
              {run.analysis.warnings.length ? (
                <div className={styles.reportOnly}>
                  <h3>{c.quality}</h3>
                  <ul className={styles.notes}>
                    {run.analysis.warnings.map((warning) => (
                      <li key={warning}>{c.reasons[warning]}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <LactateMethodComparison
                analysis={run.analysis}
                copy={c}
                selected={chartMethod}
                onSelect={selectChartMethod}
              />
              {!stale && available.length ? (
                <LactateZones analysis={run.analysis} copy={c}>
                  <div className={`${styles.pair} ${styles.noPrint}`}>
                    {(["lt1Method", "lt2Method"] as const).map((key, i) => (
                      <Choice
                        key={key}
                        id={`${id}-${key}`}
                        label={i === 0 ? c.lt1 : c.lt2}
                        value={pair[key]}
                        options={[
                          ...(!available.some(
                            (option) => option.value === pair[key],
                          )
                            ? [
                                {
                                  value: pair[key],
                                  label: `${c.methodNames[pair[key]]} — ${c.unavailable}`,
                                },
                              ]
                            : []),
                          ...available,
                        ]}
                        disabled={stale}
                        onChange={(value) => changePair(key, value)}
                      />
                    ))}
                  </div>
                </LactateZones>
              ) : null}
              {run.analysis.fitQuality ? (
                <details className={styles.diagnostics}>
                  <summary>{c.presentation.qualityFitTitle}</summary>
                  <div className={styles.fitMetrics}>
                    <div>
                      <span>{c.presentation.rmse}</span>
                      <strong>
                        {run.analysis.fitQuality.rmse.toFixed(3)}{" "}
                        <small>mmol/L</small>
                      </strong>
                    </div>
                    <div>
                      <span>{c.presentation.maxResidual}</span>
                      <strong>
                        {run.analysis.fitQuality.maxResidual.toFixed(3)}{" "}
                        <small>mmol/L</small>
                      </strong>
                    </div>
                    <div>
                      <span>R²</span>
                      <strong>
                        {run.analysis.fitQuality.rSquared?.toFixed(3) ?? "—"}
                      </strong>
                    </div>
                  </div>
                  <ResidualChart analysis={run.analysis} copy={c} />
                  <p className={styles.caption}>
                    {c.presentation.qualityFitBody}
                  </p>
                </details>
              ) : null}
              <p className={styles.muted}>{c.methodHelp}</p>
              <div className={styles.reportOnly}>
                <h3>{c.inputTitle}</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{intensityUnit}</th>
                      <th>mmol/L</th>
                      <th>bpm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.recorded.map((row, i) => (
                      <tr key={i}>
                        <td>
                          {row.intensity}
                          {run.excluded && i === run.recorded.length - 1
                            ? ` (${c.excluded})`
                            : ""}
                        </td>
                        <td>{row.lactate}</td>
                        <td>{row.heartRate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  {c.stageMinutes}: {run.stageMinutes || c.notRecorded} ·{" "}
                  {c.sampleSite}:{" "}
                  {
                    (
                      {
                        not_recorded: c.notRecorded,
                        earlobe: c.earlobe,
                        fingertip: c.fingertip,
                        other: c.other,
                      } as Record<string, string>
                    )[run.sampleSite]
                  }
                </p>
                {run.incomplete ? (
                  <p>
                    {c.incomplete} · {run.excluded ? c.excluded : c.notRecorded}
                  </p>
                ) : null}
              </div>
              <p className={styles.muted}>
                {c.source}: lactater 1.0.0 · {c.presentation.engineVersion}{" "}
                {run.analysis.engineVersion} ·{" "}
                {run.analysis.referenceCommit.slice(0, 7)}
              </p>
              <div className={styles.actions}>
                <Button
                  variant="outline"
                  disabled={stale}
                  onClick={exportResults}
                >
                  <Download data-icon="inline-start" />
                  {c.export}
                </Button>
                <Button
                  variant="outline"
                  disabled={stale}
                  onClick={() => {
                    trackLactateEvent("tool_visualization_interacted", {
                      ...context,
                      action: "print_opened",
                    });
                    window.print();
                  }}
                >
                  <Printer data-icon="inline-start" />
                  {c.print}
                </Button>
                <Button variant="ghost" disabled={stale} onClick={copyResults}>
                  {copied ? c.copied : c.copy}
                </Button>
              </div>
              <LactateToolFooter
                copy={c}
                lang={lang}
                placement="result"
                origin={run.origin}
                inputMethod={inputMethod}
                sport={sport}
              />
            </>
          )}
        </section>
      </div>
      {run ? (
        <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
          <DialogContent
            className={`${styles.methodDialog} ${styles.toolRoot}`}
            overlayClassName="backdrop-blur-none"
          >
            <DialogHeader>
              <DialogTitle>{c.methodNames[chartMethod]}</DialogTitle>
              <DialogDescription>
                {c.methodDescriptions[chartMethod]}
              </DialogDescription>
            </DialogHeader>
            <Choice
              id={`${id}-chart`}
              label={c.selected}
              value={chartMethod}
              onChange={(value) => {
                setChartMethod(value as LactateMethodId);
                trackLactateEvent("tool_visualization_interacted", {
                  ...context,
                  action: "method_selected",
                  method_id: value,
                });
              }}
              options={LACTATE_METHOD_IDS.map((value) => ({
                value,
                label: c.methodNames[value],
              }))}
            />
            {inspectedMethod?.status === "available" ? (
              <CurveChart
                analysis={run.analysis}
                methodId={chartMethod}
                copy={c}
                construction
              />
            ) : (
              <p className={styles.notice}>
                {inspectedMethod?.reasonCodes
                  .map((code) => c.reasons[code])
                  .join(" ")}
              </p>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
