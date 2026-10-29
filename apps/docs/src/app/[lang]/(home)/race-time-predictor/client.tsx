"use client";
import { InputSource } from "@/components/calculators/input-source";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Printer, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import {
  KM_PER_MILE,
  formatPaceClock,
  kmToDistance,
  raceDistanceKm,
  timePartsToSeconds,
  type DistanceUnit,
  type PaceUnit,
  type RacePreset,
} from "@/lib/running-pace";
import {
  PREDICT_RACE_KEYS,
  buildRaceTimeSearch,
  clockPartsFromSeconds,
  convertDistanceInput,
  convertPaceInput,
  displayedRacePaceSecPerKm,
  displayedRaceTimeSec,
  distanceGap,
  distanceKmFromInput,
  formatDistanceInput,
  formatPredictedClock,
  highlightedRaceKey,
  predictFromShare,
  presetForDistanceKm,
  roundVdot,
  type PredictedRaceRow,
  type RaceActivityWindow,
  type RaceTimeShareState,
} from "@/lib/race-time-predictor";
import styles from "./race-time-predictor.module.css";

const RaceFileInput = dynamic(
  () => import("./file-input").then((module) => module.RaceFileInput),
  { loading: () => <div className={styles.fileLoading} /> },
);

const PRESETS = [...PREDICT_RACE_KEYS, "custom"] as const;

export function RaceTimePredictorClient({
  hero,
  method,
  initialInputs,
}: {
  hero: ReactNode;
  method: ReactNode;
  initialInputs: RaceTimeShareState;
}) {
  const t = useTranslations("raceTimePredictor.client");
  const locale = useLocale();
  const prefix = localePrefix(locale);
  const [share, setShare] = useState<RaceTimeShareState>(initialInputs);
  const [source, setSource] = useState<"manual" | "file">("manual");
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    const nextSearch = buildRaceTimeSearch(window.location.search, share);
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [share]);

  const result = predictFromShare(share);
  useInstantToolAnalytics(
    "race_time_predictor",
    "predict_race_times",
    Boolean(result?.vdotSupported),
  );

  const rows = result?.rows ?? emptyRows(share.preset);
  const highlightKey = highlightedRaceKey(rows);
  const highlight = rows.find((row) => row.key === highlightKey);
  const highlightTime =
    highlight == null
      ? null
      : displayedRaceTimeSec(highlight, result?.sourceTimeSec ?? null);
  const highlightPace = highlight
    ? displayedRacePaceSecPerKm(highlight, result)
    : null;
  const gap =
    result && highlight
      ? distanceGap(result.sourceDistanceKm, highlight.distanceKm)
      : null;
  const timeInvalid =
    share.mode === "race" &&
    [share.hours, share.minutes, share.seconds].some((part) => part.trim()) &&
    timePartsToSeconds({
      hours: Number(share.hours || 0),
      minutes: Number(share.minutes || 0),
      seconds: Number(share.seconds || 0),
    }) == null;
  const distanceInvalid =
    share.preset === "custom" &&
    share.distance.trim() !== "" &&
    distanceKmFromInput(share.distance, share.unit) == null;
  const warning =
    result && !result.vdotSupported
      ? t("warnings.vdotRange", {
          vdot: result.vdot == null ? "—" : roundVdot(result.vdot).toFixed(1),
        })
      : null;

  const patch = (partial: Partial<RaceTimeShareState>) => {
    setCopied(false);
    setShareError(false);
    setShare((current) => ({ ...current, example: false, ...partial }));
  };

  const applyPreset = (next: RacePreset | "custom") => {
    patch({
      preset: next,
      distance:
        next === "custom"
          ? share.distance
          : formatDistanceInput(raceDistanceKm(next), share.unit),
    });
  };

  const switchDistanceUnit = (next: DistanceUnit) => {
    if (next === share.unit) return;
    patch({
      unit: next,
      distance: convertDistanceInput(share.distance, share.unit, next),
      target: convertDistanceInput(share.target, share.unit, next),
    });
  };

  const switchPaceUnit = (next: PaceUnit) => {
    if (next === share.paceUnit) return;
    const pace = convertPaceInput(
      share.paceMinutes,
      share.paceSeconds,
      share.paceUnit,
      next,
    );
    patch({
      paceUnit: next,
      paceMinutes: pace.minutes,
      paceSeconds: pace.seconds,
    });
  };

  const loadExample = () => {
    setFileName("");
    setSource("manual");
    setCopied(false);
    setShareError(false);
    setShare({
      ...share,
      mode: "race",
      preset: "10k",
      hours: "",
      minutes: "50",
      seconds: "00",
      example: true,
    });
  };

  const applyFile = (filename: string, window: RaceActivityWindow) => {
    const parts = clockPartsFromSeconds(window.timeSec);
    const preset = presetForDistanceKm(window.distanceKm);
    setFileName(filename);
    setCopied(false);
    setShareError(false);
    setShare((current) => ({
      ...current,
      mode: "race",
      example: false,
      preset: preset ?? "custom",
      distance:
        preset == null
          ? formatDistanceInput(window.distanceKm, current.unit)
          : current.distance,
      hours: parts.hours,
      minutes: parts.minutes,
      seconds: parts.seconds,
    }));
  };

  const onPrint = () => {
    trackToolEvent("tool_result_copied", "race_time_predictor", {
      action: "print_result_card",
    });
    window.print();
  };

  const onShare = async () => {
    if (!result) return;
    setShareError(false);
    const url = new URL(window.location.href);
    url.hash = "result";
    const href = url.toString();
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    try {
      if (navigator.share) {
        await navigator.share({ title: t("result.summaryTitle"), url: href });
        trackToolEvent("tool_result_copied", "race_time_predictor", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(href);
      trackToolEvent("tool_result_copied", "race_time_predictor", {
        action: "copy_share_link",
      });
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareError(true);
      trackToolEvent("tool_failed", "race_time_predictor", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
    }
  };

  const wide =
    highlightTime != null && formatPredictedClock(highlightTime).length > 5;

  return (
    <div className={styles.work}>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <div className={styles.boardHead}>
            <h2 className={styles.boardLabel}>{t("panel.title")}</h2>
            <div
              className={styles.unitSwitch}
              role="group"
              aria-label={t("units.label")}
            >
              {(["km", "mi"] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={styles.unitOption}
                  aria-pressed={share.unit === unit}
                  onClick={() => switchDistanceUnit(unit)}
                >
                  {t(`units.${unit}`)}
                </button>
              ))}
            </div>
          </div>
          <p className={styles.boardLead}>{t("panel.subtitle")}</p>
          <InputSource
            value={source}
            label={t("source.label")}
            manual={t("source.manual")}
            file={t("source.file")}
            onValueChange={(next) => {
              setSource(next);
              if (next === "manual") setFileName("");
            }}
          />
          {source === "file" ? (
            <RaceFileInput
              onResult={({ filename, window }) => applyFile(filename, window)}
              onReset={() => setFileName("")}
            />
          ) : (
            <div className={styles.formStack}>
              <fieldset className={styles.field}>
                <legend className={styles.fieldLabel}>
                  {t("inputs.mode.label")}
                </legend>
                <div className={styles.choiceRow}>
                  {(["race", "pace"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={styles.choice}
                      aria-pressed={share.mode === key}
                      onClick={() => patch({ mode: key })}
                    >
                      {t(`inputs.mode.options.${key}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.field}>
                <legend className={styles.fieldLabel}>
                  {t("inputs.preset.label")}
                </legend>
                <div className={styles.choiceRow}>
                  {PRESETS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={styles.choice}
                      aria-pressed={share.preset === key}
                      onClick={() => applyPreset(key)}
                    >
                      {t(`presets.${key}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
              {share.preset === "custom" ? (
                <div className={styles.field}>
                  <Label htmlFor="race-distance">
                    {t("inputs.distance.label")}
                  </Label>
                  <Input
                    id="race-distance"
                    inputMode="decimal"
                    value={share.distance}
                    aria-invalid={distanceInvalid}
                    onChange={(event) =>
                      patch({ distance: event.target.value })
                    }
                  />
                </div>
              ) : null}
              {share.mode === "race" ? (
                <fieldset className={styles.field}>
                  <legend className={styles.fieldLabel}>
                    {t("inputs.time.label")}
                  </legend>
                  <div className={styles.timeGrid}>
                    {(["hours", "minutes", "seconds"] as const).map((part) => (
                      <div key={part} className={styles.field}>
                        <Label htmlFor={`race-${part}`}>
                          {t(`inputs.time.${part}`)}
                        </Label>
                        <Input
                          id={`race-${part}`}
                          inputMode={part === "seconds" ? "decimal" : "numeric"}
                          value={share[part]}
                          aria-invalid={timeInvalid}
                          onChange={(event) =>
                            patch({ [part]: event.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <fieldset className={styles.field}>
                  <legend className={styles.fieldLabel}>
                    {t("inputs.pace.label")}
                  </legend>
                  <div className={styles.paceGrid}>
                    {(["paceMinutes", "paceSeconds"] as const).map((part) => (
                      <div key={part} className={styles.field}>
                        <Label htmlFor={`race-${part}`}>
                          {t(
                            part === "paceMinutes"
                              ? "inputs.pace.minutes"
                              : "inputs.pace.seconds",
                          )}
                        </Label>
                        <Input
                          id={`race-${part}`}
                          inputMode="decimal"
                          value={share[part]}
                          onChange={(event) =>
                            patch({ [part]: event.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    className={styles.unitSwitch}
                    role="group"
                    aria-label={t("inputs.pace.label")}
                  >
                    {(["min_per_km", "min_per_mi"] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        className={styles.unitOption}
                        aria-pressed={share.paceUnit === unit}
                        onClick={() => switchPaceUnit(unit)}
                      >
                        {unit === "min_per_mi"
                          ? t("units.minPerMile")
                          : t("units.minPerKm")}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className={styles.field}>
                <Label htmlFor="race-target">
                  {t("inputs.customTarget.label")}
                </Label>
                <Input
                  id="race-target"
                  inputMode="decimal"
                  value={share.target}
                  placeholder={t("inputs.customTarget.placeholder")}
                  onChange={(event) => patch({ target: event.target.value })}
                />
                <span className={styles.hint}>
                  {t("inputs.customTarget.hint")}
                </span>
              </div>
              <div className={styles.formFoot}>
                <button type="button" onClick={loadExample}>
                  {t("example.action")}
                </button>
              </div>
            </div>
          )}
          {fileName ? (
            <p role="status" className={styles.fileHint}>
              {t("file.fromFile", { name: fileName })}
            </p>
          ) : null}
          {timeInvalid || distanceInvalid ? (
            <p role="alert" className={styles.alert}>
              {t("warnings.invalid")}
            </p>
          ) : null}
        </section>
      </div>

      <div className={styles.posterWrap}>
        <section id="result" aria-live="polite" className={styles.poster}>
          <div className={styles.posterSheet}>
            <div className={styles.posterBrand}>
              <h2 className={styles.posterHeading}>
                {t("result.summaryTitle")}
              </h2>
              <p className={styles.posterMark}>Trainingload.ai</p>
            </div>
            <div className={styles.posterMain}>
              <div>
                <p className={styles.posterEyebrow}>
                  {highlight
                    ? rowLabel(highlight, share, t)
                    : t("result.finish")}
                </p>
                <p
                  className={styles.posterWatts}
                  data-wide={wide ? "true" : "false"}
                >
                  <span className={styles.posterNumber}>
                    {highlightTime == null
                      ? "—"
                      : formatPredictedClock(highlightTime)}
                  </span>
                </p>
                <p className={styles.posterProtocol}>
                  {result
                    ? `${t("result.source")} ${sourceSummary(share, t, result.sourceTimeSec)}`
                    : t("result.empty")}
                </p>
                {share.example && result ? (
                  <p className={styles.posterHint}>{t("result.example")}</p>
                ) : null}
                <p className={styles.posterProtocol}>
                  {pacePair(highlightPace)}
                </p>
                {gap ? (
                  <p className={styles.posterHint}>{t(`result.gap.${gap}`)}</p>
                ) : null}
              </div>
              <div className={styles.pride}>
                <p className={styles.posterEyebrow}>{t("result.vdot")}</p>
                <p className={styles.prideFigure}>
                  <span className={styles.prideValue}>
                    {result?.vdot == null
                      ? "—"
                      : roundVdot(result.vdot).toFixed(1)}
                  </span>
                </p>
                <p className={styles.bandCaption}>{t("result.vdotCaption")}</p>
              </div>
            </div>
            <div className={styles.predictWrap}>
              <table className={styles.predictTable}>
                <caption className="sr-only">{t("result.caption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("result.headers.race")}</th>
                    <th scope="col">{t("result.headers.time")}</th>
                    <th scope="col">{t("result.headers.paceKm")}</th>
                    <th scope="col">{t("result.headers.paceMi")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const time = displayedRaceTimeSec(
                      row,
                      result?.sourceTimeSec ?? null,
                    );
                    const pace = displayedRacePaceSecPerKm(row, result);
                    return (
                      <tr
                        key={row.key}
                        data-highlight={
                          row.key === highlightKey ? "true" : "false"
                        }
                        data-source={row.isSource ? "true" : "false"}
                      >
                        <th scope="row">
                          <span className={styles.rowName}>
                            {rowLabel(row, share, t)}
                            {row.isSource ? (
                              <span className={styles.sourceMark}>
                                {t("result.sourceMark")}
                              </span>
                            ) : null}
                          </span>
                        </th>
                        <td data-label={t("result.headers.time")}>
                          {time == null ? "—" : formatPredictedClock(time)}
                        </td>
                        <td data-label={t("result.headers.paceKm")}>
                          {pace == null ? "—" : formatPaceClock(pace)}
                        </td>
                        <td data-label={t("result.headers.paceMi")}>
                          {pace == null
                            ? "—"
                            : formatPaceClock(pace * KM_PER_MILE)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.formulaEcho}>{t("result.formula")}</p>
            {result?.vdotSupported ? (
              <aside className={styles.resultGuidance}>
                <p>{t("result.guidance.equivalent")}</p>
                {rows.some((row) => row.key === "marathon" && !row.isSource) ? (
                  <p>{t("result.guidance.marathon")}</p>
                ) : null}
                {gap === "large" && highlight ? (
                  <p>
                    {t(
                      result.sourceDistanceKm < highlight.distanceKm
                        ? "result.guidance.longer"
                        : "result.guidance.shorter",
                    )}
                  </p>
                ) : null}
                {source === "file" ? <p>{t("result.guidance.file")}</p> : null}
                <a href="#prediction-accuracy">
                  {t("result.guidance.learn")} →
                </a>
              </aside>
            ) : null}
          </div>
        </section>
        <div className={styles.posterActions}>
          <a
            href={`${prefix}/vdot-calculator`}
            className={styles.primaryAction}
          >
            {t("result.handoffVdot")}
          </a>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={!result}
            onClick={onPrint}
          >
            <Printer className="size-3.5" aria-hidden />
            {t("result.print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={!result}
            onClick={() => void onShare()}
          >
            <Share2 className="size-3.5" aria-hidden />
            {copied ? t("result.linkCopied") : t("result.share")}
          </Button>
        </div>
        {warning ? (
          <p role="status" className={styles.alert}>
            {warning}
          </p>
        ) : null}
        {shareError ? (
          <p role="alert" className={styles.alert}>
            {t("result.shareError")}
          </p>
        ) : null}
      </div>
      {method}
    </div>
  );
}

function emptyRows(preset: RaceTimeShareState["preset"]): PredictedRaceRow[] {
  return PREDICT_RACE_KEYS.map((key) => ({
    key,
    distanceKm: raceDistanceKm(key),
    timeSec: null,
    paceSecPerKm: null,
    isSource: key === preset,
  }));
}

function rowLabel(
  row: PredictedRaceRow,
  share: RaceTimeShareState,
  t: ReturnType<typeof useTranslations>,
) {
  if (row.key !== "custom") return t(`presets.${row.key}`);
  const value = kmToDistance(row.distanceKm, share.unit);
  return `${String(Number(value.toFixed(2)))} ${share.unit === "mi" ? t("units.mi") : t("units.km")}`;
}

function sourceSummary(
  share: RaceTimeShareState,
  t: ReturnType<typeof useTranslations>,
  sourceTimeSec: number,
) {
  const name =
    share.preset === "custom"
      ? `${share.distance || "—"} ${share.unit === "mi" ? t("units.mi") : t("units.km")}`
      : t(`presets.${share.preset}`);
  return `${name} · ${formatPredictedClock(sourceTimeSec)}`;
}

function pacePair(secPerKm: number | null) {
  if (secPerKm == null) return "—";
  return `${formatPaceClock(secPerKm)}/km · ${formatPaceClock(secPerKm * KM_PER_MILE)}/mi`;
}
