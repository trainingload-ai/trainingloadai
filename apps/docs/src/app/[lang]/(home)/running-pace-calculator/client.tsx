"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Printer, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import {
  type DistanceUnit,
  type PaceCalculatorState,
  type PaceUnit,
  type RacePreset,
  KM_PER_MILE,
  PACE_CALCULATOR_EXAMPLE,
  EMPTY_PACE_CALCULATOR,
  calculatePace,
  changePaceSolveFor,
  buildPaceComparison,
  buildPaceCalculatorSearch,
  buildSplitChart,
  convertDistanceText,
  convertPaceParts,
  formatClock,
  formatDistance,
  formatPaceClock,
  formatSplitTable,
  kmToDistance,
  pacePartsToSeconds,
  paceToSecPerKm,
  paceToSpeed,
  parsePositiveNumber,
  raceDistanceKm,
  secPerKmToPace,
  timePartsToSeconds,
} from "@/lib/running-pace";
import styles from "./running-pace-calculator.module.css";

const RACE_PRESETS: RacePreset[] = ["5k", "10k", "half", "marathon"];

function PaceSelect({
  id,
  label,
  value,
  onValueChange,
  options,
}: {
  id?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function paceUnitLabel(
  unit: PaceUnit,
  labels: { minPerKm: string; minPerMile: string },
) {
  return unit === "min_per_mi" ? labels.minPerMile : labels.minPerKm;
}

function clockInvalid(hours: string, minutes: string, seconds: string) {
  const any = [hours, minutes, seconds].some((part) => part.trim() !== "");
  if (!any) return false;
  return (
    timePartsToSeconds({
      hours: Number(hours || 0),
      minutes: Number(minutes || 0),
      seconds: Number(seconds || 0),
    }) == null
  );
}

export function RunningPaceCalculatorClient({
  hero,
  method,
  lang,
  initialInputs,
}: {
  hero: ReactNode;
  method: ReactNode;
  lang: string;
  initialInputs: PaceCalculatorState;
}) {
  const t = useTranslations("runningPaceCalculator.client");
  const locale = useLocale();
  const prefix = localePrefix(locale);
  const [state, setState] = useState<PaceCalculatorState>(initialInputs);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const comparisonRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(shareTimer.current), []);

  useEffect(() => {
    const nextSearch = buildPaceCalculatorSearch(window.location.search, state);
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [state]);

  useEffect(() => {
    trackToolEvent("tool_viewed", "running_pace_calculator", { lang });
  }, [lang]);

  const edit = (
    patch:
      | Partial<PaceCalculatorState>
      | ((current: PaceCalculatorState) => PaceCalculatorState),
  ) => {
    setShareCopied(false);
    setShareError(false);
    setState((current) => {
      const next =
        typeof patch === "function" ? patch(current) : { ...current, ...patch };
      return { ...next, example: false };
    });
  };

  const distanceKm = (() => {
    if (state.preset !== "custom") return raceDistanceKm(state.preset);
    const value = parsePositiveNumber(state.distanceText);
    if (value == null) return null;
    return state.distanceUnit === "mi" ? value * KM_PER_MILE : value;
  })();

  const timeSec = timePartsToSeconds({
    hours: Number(state.hours || 0),
    minutes: Number(state.minutes || 0),
    seconds: Number(state.seconds || 0),
  });

  const paceSecPerUnit = pacePartsToSeconds({
    minutes: Number(state.paceMinutes || 0),
    seconds: Number(state.paceSeconds || 0),
  });
  const paceSecPerKm =
    paceSecPerUnit == null
      ? null
      : paceToSecPerKm(paceSecPerUnit, state.paceUnit);

  const result = calculatePace(state);
  const comparison = result
    ? buildPaceComparison(result.secPerKm, state.paceUnit)
    : [];

  useEffect(() => {
    const region = comparisonRef.current;
    const current = region?.querySelector<HTMLElement>("[data-current-pace]");
    if (!region || !current || region.scrollWidth <= region.clientWidth) return;
    region.scrollLeft =
      current.offsetLeft + current.offsetWidth / 2 - region.clientWidth / 2;
  }, [result?.secPerKm, state.paceUnit]);

  const chartRows =
    result == null
      ? null
      : buildSplitChart({
          distanceKm:
            state.chart === "custom"
              ? result.distanceKm
              : raceDistanceKm(state.chart),
          paceSecPerKm: result.secPerKm,
          unit: state.distanceUnit,
        });
  const displayRows = chartRows ? formatSplitTable(chartRows) : null;

  useInstantToolAnalytics(
    "running_pace_calculator",
    "calculate_running_pace",
    Boolean(result),
  );

  const unitLabels = {
    minPerKm: t("units.minPerKm"),
    minPerMile: t("units.minPerMile"),
  };
  const distanceOptions = (["km", "mi"] as const).map((value) => ({
    value,
    label: t(`units.${value}`),
  }));
  const solveOptions = (["pace", "time", "distance"] as const).map((value) => ({
    value,
    label: t(`inputs.solveFor.options.${value}`),
  }));
  const paceLabel = paceUnitLabel(state.paceUnit, unitLabels);
  const distanceLabel =
    state.distanceUnit === "mi" ? t("units.mi") : t("units.km");
  const solvedPace = result
    ? formatPaceClock(secPerKmToPace(result.secPerKm, state.paceUnit))
    : null;
  const speedFormat = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const heroFigure = !result
    ? "—"
    : result.kind === "pace"
      ? solvedPace
      : result.kind === "time"
        ? formatClock(result.timeSec)
        : formatDistance(result.distanceKm, state.distanceUnit).replace(
            /\s?(km|mi)$/,
            "",
          );
  const heroUnit = !result
    ? ""
    : result.kind === "pace"
      ? paceLabel
      : result.kind === "time"
        ? ""
        : distanceLabel;

  const timeInvalid =
    state.solveFor !== "time" &&
    clockInvalid(state.hours, state.minutes, state.seconds);
  const paceInvalid =
    state.solveFor !== "pace" &&
    (state.paceMinutes.trim() !== "" || state.paceSeconds.trim() !== "") &&
    pacePartsToSeconds({
      minutes: Number(state.paceMinutes || 0),
      seconds: Number(state.paceSeconds || 0),
    }) == null;
  const distanceInvalid =
    state.solveFor !== "distance" &&
    state.preset === "custom" &&
    state.distanceText.trim() !== "" &&
    parsePositiveNumber(state.distanceText) == null;
  const fieldInvalid = timeInvalid || paceInvalid || distanceInvalid;
  const inputsStarted =
    state.hours.trim() !== "" ||
    state.minutes.trim() !== "" ||
    state.seconds.trim() !== "" ||
    state.paceMinutes.trim() !== "" ||
    state.paceSeconds.trim() !== "" ||
    (state.preset === "custom" && state.distanceText.trim() !== "");
  const unusable =
    inputsStarted &&
    !fieldInvalid &&
    result == null &&
    ((state.solveFor === "pace" && timeSec != null && distanceKm != null) ||
      (state.solveFor === "time" &&
        paceSecPerKm != null &&
        distanceKm != null) ||
      (state.solveFor === "distance" &&
        timeSec != null &&
        paceSecPerKm != null));

  const switchDistanceUnit = (next: DistanceUnit) => {
    if (next === state.distanceUnit) return;
    edit((current) => {
      if (next === current.distanceUnit) return current;
      let distanceText = current.distanceText;
      if (current.preset === "custom") {
        const converted = convertDistanceText(
          current.distanceText,
          current.distanceUnit,
          next,
        );
        if (converted != null) distanceText = converted;
      }
      return { ...current, distanceUnit: next, distanceText };
    });
  };

  const switchUnitSystem = (next: "metric" | "imperial") => {
    const nextDistanceUnit: DistanceUnit = next === "metric" ? "km" : "mi";
    const nextPaceUnit: PaceUnit =
      next === "metric" ? "min_per_km" : "min_per_mi";
    edit((current) => {
      let distanceText = current.distanceText;
      if (
        current.preset === "custom" &&
        current.distanceUnit !== nextDistanceUnit
      ) {
        distanceText =
          convertDistanceText(
            current.distanceText,
            current.distanceUnit,
            nextDistanceUnit,
          ) ?? current.distanceText;
      }
      const paceParts =
        current.paceUnit === nextPaceUnit
          ? null
          : convertPaceParts(
              {
                minutes: Number(current.paceMinutes || 0),
                seconds: Number(current.paceSeconds || 0),
              },
              current.paceUnit,
              nextPaceUnit,
            );
      return {
        ...current,
        distanceUnit: nextDistanceUnit,
        paceUnit: nextPaceUnit,
        distanceText,
        ...(paceParts == null
          ? {}
          : {
              paceMinutes: String(paceParts.minutes),
              paceSeconds: `${paceParts.seconds < 10 ? "0" : ""}${paceParts.seconds}`,
            }),
      };
    });
  };

  const applyPreset = (next: RacePreset) => {
    edit((current) => {
      return {
        ...current,
        preset: next,
        chart: current.solveFor === "distance" ? current.chart : next,
      };
    });
  };

  const distanceValue =
    state.preset === "custom"
      ? state.distanceText
      : String(
          Number(
            kmToDistance(
              raceDistanceKm(state.preset),
              state.distanceUnit,
            ).toFixed(3),
          ),
        );

  const onShare = async () => {
    if (!result) return;
    setShareError(false);
    const url = new URL(window.location.href);
    url.search = buildPaceCalculatorSearch(window.location.search, state, {
      full: true,
    });
    url.hash = "result";
    const href = url.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    try {
      if (navigator.share) {
        await navigator.share({
          title: t("scorecard.title"),
          url: href,
        });
        trackToolEvent("tool_result_copied", "running_pace_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(href);
      trackToolEvent("tool_result_copied", "running_pace_calculator", {
        action: "copy_share_link",
      });
      setShareCopied(true);
      clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "running_pace_calculator", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      setShareCopied(false);
      setShareError(true);
    }
  };

  const onPrint = () => {
    if (!result) return;
    trackToolEvent("tool_result_copied", "running_pace_calculator", {
      action: "print_result_card",
    });
    window.print();
  };

  return (
    <div className={styles.tool}>
      <div className={styles.hero}>
        {hero}
        <form
          id="calculator"
          className={styles.board}
          aria-labelledby="pace-input-title"
          onSubmit={(event) => {
            event.preventDefault();
            if (!result) return;
            document.getElementById("result")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        >
          <div className={styles.formHead}>
            <div className={styles.formTitleRow}>
              <h2 id="pace-input-title" className={styles.boardLabel}>
                {t("panel.title")}
              </h2>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={state.distanceUnit === "mi" ? "imperial" : "metric"}
                aria-label={t("units.systemLabel")}
                className={styles.unitSwitch}
                onValueChange={(value) => {
                  if (value) {
                    switchUnitSystem(value as "metric" | "imperial");
                  }
                }}
              >
                {(["metric", "imperial"] as const).map((unitSystem) => (
                  <ToggleGroupItem
                    key={unitSystem}
                    value={unitSystem}
                    className={styles.unitOption}
                  >
                    {t(`units.${unitSystem}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <p>{t("panel.subtitle")}</p>
          </div>
          <FieldGroup className={styles.formFields}>
            <Field className="gap-2">
              <FieldLabel htmlFor="pace-solve-for">
                {t("inputs.solveFor.label")}
              </FieldLabel>
              <PaceSelect
                id="pace-solve-for"
                label={t("inputs.solveFor.label")}
                value={state.solveFor}
                onValueChange={(value) =>
                  edit((current) =>
                    changePaceSolveFor(
                      current,
                      value as PaceCalculatorState["solveFor"],
                    ),
                  )
                }
                options={solveOptions}
              />
              <FieldDescription>
                {t(`panel.hints.${state.solveFor}`)}
              </FieldDescription>
            </Field>
            <FieldSeparator className={styles.formDivider} />
            {state.solveFor !== "distance" ? (
              <Field
                data-invalid={distanceInvalid || undefined}
                className="gap-2"
              >
                <FieldLabel htmlFor="running-pace-distance">
                  {t("inputs.distance.label")} · {distanceLabel}
                </FieldLabel>
                <Input
                  id="running-pace-distance"
                  inputMode="decimal"
                  aria-invalid={distanceInvalid || undefined}
                  value={distanceValue}
                  onChange={(event) =>
                    edit({
                      preset: "custom",
                      distanceText: event.target.value,
                      chart: "custom",
                    })
                  }
                  placeholder={t("inputs.distance.placeholder")}
                />
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  value={state.preset}
                  aria-label={t("inputs.preset.label")}
                  className={styles.presetGroup}
                  onValueChange={(value) => {
                    if (value) applyPreset(value as RacePreset);
                  }}
                >
                  {RACE_PRESETS.map((key) => (
                    <ToggleGroupItem
                      key={key}
                      value={key}
                      className={styles.presetOption}
                    >
                      {key === "half"
                        ? t("inputs.preset.halfShort")
                        : t(`presets.${key}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            ) : null}
            {state.solveFor !== "time" ? (
              <FieldSet className="gap-2">
                <FieldLegend variant="label" className="mb-0">
                  {t("inputs.time.label")}
                </FieldLegend>
                <FieldGroup className={styles.clockFields}>
                  {(
                    [
                      ["hours", state.hours, "numeric"],
                      ["minutes", state.minutes, "numeric"],
                      ["seconds", state.seconds, "decimal"],
                    ] as const
                  ).map(([key, value, mode]) => (
                    <Field
                      key={key}
                      data-invalid={timeInvalid || undefined}
                      className="gap-2"
                    >
                      <FieldLabel htmlFor={`pace-time-${key}`}>
                        {t(`inputs.time.${key}`)}
                      </FieldLabel>
                      <Input
                        id={`pace-time-${key}`}
                        inputMode={mode}
                        aria-invalid={timeInvalid || undefined}
                        placeholder="00"
                        value={value}
                        onChange={(event) =>
                          edit({ [key]: event.target.value })
                        }
                      />
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
            ) : null}
            {state.solveFor !== "pace" ? (
              <FieldSet className="gap-2">
                <FieldLegend variant="label" className="mb-0">
                  {t("inputs.pace.label")} · {paceLabel}
                </FieldLegend>
                <FieldGroup className={styles.paceFields}>
                  {(
                    [
                      ["paceMinutes", "minutes", state.paceMinutes, "numeric"],
                      ["paceSeconds", "seconds", state.paceSeconds, "decimal"],
                    ] as const
                  ).map(([key, label, value, mode]) => (
                    <Field
                      key={key}
                      data-invalid={paceInvalid || undefined}
                      className="gap-2"
                    >
                      <FieldLabel htmlFor={`pace-${key}`}>
                        {t(`inputs.pace.${label}`)}
                      </FieldLabel>
                      <Input
                        id={`pace-${key}`}
                        inputMode={mode}
                        aria-invalid={paceInvalid || undefined}
                        placeholder="00"
                        value={value}
                        onChange={(event) =>
                          edit({ [key]: event.target.value })
                        }
                      />
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
            ) : null}
            {fieldInvalid || unusable ? (
              <FieldError>
                {t(fieldInvalid ? "invalid" : "unusable")}
              </FieldError>
            ) : null}
          </FieldGroup>
          <div className={styles.formUtilities}>
            <Button
              type="button"
              variant="link"
              size="sm"
              className={styles.exampleAction}
              onClick={() => {
                setState({ ...PACE_CALCULATOR_EXAMPLE });
                setShareError(false);
                setShareCopied(false);
              }}
            >
              {t("example.action")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.resetAction}
              onClick={() => {
                setState({ ...EMPTY_PACE_CALCULATOR });
                setShareError(false);
                setShareCopied(false);
              }}
            >
              {t("panel.reset")}
            </Button>
          </div>
          <Button type="submit" size="lg" className={styles.calculateButton}>
            {t("panel.calculate")}
          </Button>
          <p className={styles.panelNote}>{t("panel.note")}</p>
        </form>
      </div>
      <div className={styles.scoreWrap}>
        <section
          id="result"
          aria-labelledby="pace-scorecard-title"
          className={styles.poster}
        >
          <div className={styles.posterSheet}>
            <div className={styles.posterBrand}>
              <h2 id="pace-scorecard-title" className={styles.posterHeading}>
                {t("scorecard.title")}
              </h2>
              <p className={styles.posterMark}>Trainingload.ai</p>
            </div>
            <div
              className={styles.posterMain}
              aria-live="polite"
              aria-atomic="true"
            >
              <div>
                <p className={styles.eyebrow}>
                  {t(`inputs.solveFor.options.${state.solveFor}`)}
                </p>
                <p
                  className={styles.figure}
                  data-wide={heroFigure != null && heroFigure.length > 5}
                >
                  <span className={styles.figureNumber}>{heroFigure}</span>
                  {heroUnit ? (
                    <span className={styles.figureUnit}>{heroUnit}</span>
                  ) : null}
                </p>
                <p className={styles.method}>{t("scorecard.method")}</p>
                {state.example && result ? (
                  <p className={styles.posterHint}>{t("example.result")}</p>
                ) : result ? null : (
                  <p className={styles.posterHint}>{t("scorecard.empty")}</p>
                )}
              </div>
              <dl className={styles.meta}>
                <div>
                  <dt>{t("scorecard.distance")}</dt>
                  <dd>
                    {result
                      ? formatDistance(result.distanceKm, state.distanceUnit)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{t("scorecard.time")}</dt>
                  <dd>{result ? formatClock(result.timeSec) : "—"}</dd>
                </div>
                <div>
                  <dt>{t("scorecard.units")}</dt>
                  <dd>
                    {distanceLabel} · {paceLabel}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          {result ? (
            <dl className={styles.conversionSummary}>
              {(
                [
                  ["perKm", formatPaceClock(result.secPerKm)],
                  [
                    "perMile",
                    formatPaceClock(
                      secPerKmToPace(result.secPerKm, "min_per_mi"),
                    ),
                  ],
                  [
                    "kmh",
                    speedFormat.format(paceToSpeed(result.secPerKm, "km/h")!),
                  ],
                  [
                    "mph",
                    speedFormat.format(paceToSpeed(result.secPerKm, "mph")!),
                  ],
                ] as const
              ).map(([key, value]) => (
                <div key={key}>
                  <dt>{t(`comparison.${key}`)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
        <div className={`${styles.actions} pace-share-actions`}>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onPrint}
            disabled={!result}
          >
            <Printer data-icon="inline-start" aria-hidden />
            {t("scorecard.print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void onShare()}
            disabled={!result}
          >
            <Share2 data-icon="inline-start" aria-hidden />
            {shareCopied ? t("scorecard.shareCopied") : t("scorecard.share")}
          </Button>
          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={<a href={`${prefix}/race-time-predictor`} />}
          >
            {t("scorecard.predict")}
          </Button>
        </div>
        {shareError ? (
          <FieldError>{t("scorecard.shareError")}</FieldError>
        ) : null}
      </div>
      {result ? (
        <div className={styles.resultBlock}>
          <section
            id="pace-comparison"
            className={styles.comparison}
            aria-labelledby="pace-comparison-title"
          >
            <div>
              <h2 id="pace-comparison-title" className={styles.splitsTitle}>
                {t("comparison.title")}
              </h2>
              <p className={styles.hint}>
                {t("comparison.body", { unit: paceLabel })}
              </p>
            </div>
            <p className={styles.tableHint}>{t("comparison.scrollHint")}</p>
            <div
              ref={comparisonRef}
              className={styles.comparisonWrap}
              role="region"
              tabIndex={0}
              aria-label={t("comparison.caption")}
            >
              <table className={`${styles.table} ${styles.comparisonTable}`}>
                <caption className="sr-only">{t("comparison.caption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("comparison.race")}</th>
                    {comparison.map((col) => (
                      <th
                        scope="col"
                        key={col.offset}
                        data-current-pace={col.offset === 0 ? true : undefined}
                        className={
                          col.offset === 0 ? styles.currentPace : undefined
                        }
                      >
                        <span>{col.label}</span>
                        <small>
                          {col.offset === 0
                            ? t("comparison.current")
                            : t(
                                col.offset < 0
                                  ? "comparison.faster"
                                  : "comparison.slower",
                                { seconds: Math.abs(col.offset) },
                              )}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RACE_PRESETS.map((race) => (
                    <tr key={race}>
                      <th scope="row">{t(`presets.${race}`)}</th>
                      {comparison.map((col) => (
                        <td
                          key={col.offset}
                          className={
                            col.offset === 0 ? styles.currentPace : undefined
                          }
                        >
                          {formatClock(col.times[race])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{t("comparison.note")}</p>
          </section>
          <section
            className={styles.splits}
            aria-labelledby="pace-splits-title"
          >
            <div className={styles.splitsHead}>
              <div>
                <h2 id="pace-splits-title" className={styles.splitsTitle}>
                  {t("chart.label")}
                </h2>
                <p className={styles.hint}>{t("chart.hint")}</p>
              </div>
              <div className={styles.splitControls}>
                <PaceSelect
                  label={t("chart.distance")}
                  value={state.chart}
                  onValueChange={(value) =>
                    edit({ chart: value as PaceCalculatorState["chart"] })
                  }
                  options={[
                    {
                      value: "custom",
                      label: `${t("chart.current")} · ${formatDistance(result.distanceKm, state.distanceUnit)}`,
                    },
                    ...RACE_PRESETS.map((key) => ({
                      value: key,
                      label: t(`presets.${key}`),
                    })),
                  ]}
                />
                <PaceSelect
                  label={t("chart.unit")}
                  value={state.distanceUnit}
                  onValueChange={(value) =>
                    switchDistanceUnit(value as DistanceUnit)
                  }
                  options={distanceOptions}
                />
              </div>
            </div>
            <div
              className={styles.tableWrap}
              role="region"
              tabIndex={0}
              aria-label={t("chart.caption")}
            >
              <table className={styles.table}>
                <caption className="sr-only">{t("chart.caption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("chart.split")}</th>
                    <th scope="col">{t("chart.segment")}</th>
                    <th scope="col">{t("chart.elapsed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows?.map((row) => (
                    <tr
                      key={`${row.label}-${row.distanceKm}`}
                      className={row.isFinish ? styles.finish : undefined}
                    >
                      <th scope="row">
                        {row.isFinish
                          ? `${t("chart.finish")} · ${formatDistance(row.distanceKm, state.distanceUnit)}`
                          : row.label}
                      </th>
                      <td>{formatClock(row.displaySplitSec)}</td>
                      <td>{formatClock(row.displayElapsedSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {state.example ? (
              <p className={styles.hint}>{t("example.chart")}</p>
            ) : null}
          </section>
        </div>
      ) : null}
      <div id="method" className={styles.methodSlot}>
        {method}
      </div>
    </div>
  );
}
