"use client";

import {
  useEffect,
  useState,
  type ReactNode,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { Printer, Share2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import {
  calculateVo2,
  createVo2Draft,
  vo2SearchFromDraft,
  type FitnessLevelKey,
  type Vo2Detail,
  type Vo2Draft,
  type Vo2FieldError,
  type Vo2Method,
  type Vo2Result,
} from "@/lib/vo2-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  vo2DistanceDisplay,
  vo2WeightDisplay,
  vo2DistanceFromInput,
  vo2WeightFromInput,
  type Vo2Units,
} from "@/lib/vo2-input-units";
import styles from "./vo2-max-calculator.module.css";

function UnitInput({
  suffix,
  ...props
}: ComponentProps<typeof Input> & { suffix: string }) {
  return (
    <div className={styles.inputShell}>
      <Input {...props} className={styles.input} />
      <span className={styles.inputSuffix} aria-hidden>
        {suffix}
      </span>
    </div>
  );
}

const METHODS: readonly Vo2Method[] = [
  "cooper",
  "rockport",
  "beep",
  "restingHr",
  "race",
];

const LEVELS: readonly FitnessLevelKey[] = [
  "excellent",
  "veryGood",
  "good",
  "fair",
  "poor",
];

function digits(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function clockLabel(parts: {
  hours?: number;
  minutes: number;
  seconds: number;
}) {
  const seconds = String(parts.seconds).padStart(2, "0");
  if (parts.hours && parts.hours > 0) {
    return `${parts.hours}:${String(parts.minutes).padStart(2, "0")}:${seconds}`;
  }
  return `${parts.minutes}:${seconds}`;
}

function readBands(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

export function Vo2MaxCalculatorClient({
  hero,
  initialDraft,
}: {
  hero: ReactNode;
  initialDraft: Vo2Draft | null;
}) {
  const t = useTranslations("vo2MaxCalculator.client");
  const format = useFormatter();
  const oneDecimal = (value: number) =>
    format.number(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const locale = useLocale();
  const prefix = localePrefix(locale);
  const [draft, setDraft] = useState<Vo2Draft>(
    () => initialDraft ?? createVo2Draft(),
  );
  const [distanceText, setDistanceText] = useState(() =>
    vo2DistanceDisplay(draft, draft.units),
  );
  const [weightText, setWeightText] = useState(() =>
    vo2WeightDisplay(draft, draft.units),
  );
  const [autoMaxHr, setAutoMaxHr] = useState(() => !draft.maxHr.trim());
  const [manualMaxHr, setManualMaxHr] = useState(draft.maxHr);
  const [computed, setComputed] = useState<Vo2Result | null>(() => {
    const result = initialDraft ? calculateVo2(initialDraft) : null;
    return result?.ok ? result.value : null;
  });
  const [error, setError] = useState<Vo2FieldError | null>(null);
  const [copied, setCopied] = useState(false);
  const ageBands = readBands(t.raw("ageBands"));

  useEffect(() => {
    trackToolEvent("tool_viewed", "vo2_max_calculator", { lang: locale });
  }, [locale]);

  function patch(partial: Partial<Vo2Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
    setComputed(null);
    setError(null);
    setCopied(false);
  }

  function selectUnits(units: Vo2Units) {
    if (units === draft.units) return;
    setDistanceText(vo2DistanceDisplay(draft, units));
    setWeightText(vo2WeightDisplay(draft, units));
    const next = { ...draft, units };
    setDraft(next);
    setCopied(false);
    if (computed)
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${vo2SearchFromDraft(next)}${window.location.hash}`,
      );
  }

  function onUnitKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const units =
      event.key === "ArrowRight" || event.key === "End" ? "imperial" : "metric";
    selectUnits(units);
    document.getElementById(`vo2-units-${units}`)?.focus();
  }

  function messageFor(code: Vo2FieldError) {
    switch (code) {
      case "age":
        return t("profile.age.invalid");
      case "sex":
        return t("profile.sex.invalid");
      case "cooper-distance":
        return t("methods.cooper.errors.distance");
      case "rockport-weight":
        return t("methods.rockport.errors.weight");
      case "rockport-hr":
        return t("methods.rockport.errors.hr");
      case "rockport-time":
        return t("methods.rockport.errors.time");
      case "beep-level":
        return t("methods.beep.errors.level");
      case "beep-shuttle":
        return t("methods.beep.errors.shuttle");
      case "resting-hr":
        return t("methods.restingHr.errors.resting");
      case "max-hr":
        return t("methods.restingHr.errors.max");
      case "race-time":
        return t("methods.race.errors.time");
      default:
        return t("common.errors.compute");
    }
  }

  function detailLine(detail: Vo2Detail) {
    if (detail.kind === "cooper") {
      return t("scorecard.detail.cooper", {
        distance: format.number(detail.distanceM),
      });
    }
    if (detail.kind === "rockport") {
      return t("scorecard.detail.rockport", {
        time: clockLabel(detail),
        hr: detail.hrBpm,
      });
    }
    if (detail.kind === "beep") {
      return detail.shuttle == null
        ? t("scorecard.detail.beep", {
            level: detail.level,
            speed: format.number(detail.speedKmh),
          })
        : t("scorecard.detail.beepShuttle", {
            level: detail.level,
            shuttle: detail.shuttle,
            speed: format.number(detail.speedKmh),
          });
    }
    if (detail.kind === "restingHr") {
      return detail.maxHrSource === "estimated"
        ? t("scorecard.detail.restingEstimated", {
            resting: detail.restingHr,
            max: detail.maxHr,
          })
        : t("scorecard.detail.restingEntered", {
            resting: detail.restingHr,
            max: detail.maxHr,
          });
    }
    return t("scorecard.detail.race", {
      event: t(`methods.race.inputs.event.${detail.event}`),
      time: clockLabel(detail),
    });
  }

  function onCalculate() {
    if (draft.method === "restingHr" && !autoMaxHr && !draft.maxHr.trim()) {
      setError("max-hr");
      return;
    }
    trackToolEvent("tool_started", "vo2_max_calculator", {
      action: "calculate_vo2_max",
    });
    const result = calculateVo2(draft);
    if (!result.ok) {
      setComputed(null);
      setError(result.error);
      trackToolEvent("tool_failed", "vo2_max_calculator", {
        action: "calculate_vo2_max",
        error_code: "invalid_input",
      });
      return;
    }
    setError(null);
    setComputed(result.value);
    window.requestAnimationFrame(() => {
      document.getElementById("vo2-scorecard")?.focus({ preventScroll: true });
      document.getElementById("vo2-scorecard")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    });
    const nextUrl = `${window.location.pathname}${vo2SearchFromDraft(draft)}#vo2-scorecard`;
    window.history.replaceState(window.history.state, "", nextUrl);
    trackToolEvent("tool_completed", "vo2_max_calculator", {
      action: "calculate_vo2_max",
    });
  }

  async function onShare() {
    if (!computed) return;
    const url = window.location.href;
    const text = [
      `${computed.method === "race" ? "VDOT" : "VO2max"} ${oneDecimal(computed.vo2max)}${computed.method === "race" ? "" : " ml/kg/min"}`,
      t(`methods.${computed.method}.tab`),
      detailLine(computed.detail),
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: t("scorecard.kicker"), text, url });
        trackToolEvent("tool_result_copied", "vo2_max_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      trackToolEvent("tool_result_copied", "vo2_max_calculator", {
        action: "copy_share_link",
      });
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      )
        return;
      trackToolEvent("tool_failed", "vo2_max_calculator", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      return;
    }
    window.setTimeout(() => setCopied(false), 1600);
  }

  function onPrint() {
    if (!computed) return;
    trackToolEvent("tool_result_copied", "vo2_max_calculator", {
      action: "print_result_card",
    });
    window.print();
  }

  const sexLabel =
    computed?.sex === "female"
      ? t("scorecard.sexFemale")
      : t("scorecard.sexMale");
  const bandLabel = computed
    ? (ageBands[computed.fitness.bandIndex] ?? "")
    : "";

  return (
    <div className={styles.workspace}>
      <div className={styles.heroGrid}>
        {hero}
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            onCalculate();
          }}
        >
          <div className={styles.formHead}>
            <div className={styles.formTitleRow}>
              <h2>{t("panel.title")}</h2>
              <div
                role="radiogroup"
                aria-label={t("units.label")}
                className={styles.unitSwitch}
              >
                {(["metric", "imperial"] as const).map((units) => (
                  <Button
                    key={units}
                    id={`vo2-units-${units}`}
                    type="button"
                    role="radio"
                    variant="ghost"
                    aria-checked={draft.units === units}
                    tabIndex={draft.units === units ? 0 : -1}
                    onClick={() => selectUnits(units)}
                    onKeyDown={onUnitKeyDown}
                    className={styles.unitOption}
                  >
                    {t(`units.${units}`)}
                  </Button>
                ))}
              </div>
            </div>
            <p>{t("panel.lead")}</p>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("methods.tablist")}</span>
            <Select
              value={draft.method}
              onValueChange={(value) => patch({ method: value as Vo2Method })}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={t("methods.tablist")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {t(`methods.${method}.tab`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className={styles.methodIntro}>
            {t(`methods.${draft.method}.intro`)}
          </p>
          <div className={styles.profile}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t("profile.age.label")}
              </span>
              <Input
                className={styles.input}
                type="number"
                inputMode="numeric"
                min={10}
                max={99}
                step={1}
                required
                value={draft.age}
                placeholder={t("profile.age.placeholder")}
                onChange={(event) => patch({ age: event.target.value })}
              />
            </label>
            <fieldset className={styles.field}>
              <legend className={styles.fieldLabel}>
                {t("profile.sex.label")}
              </legend>
              <RadioGroup
                className={styles.choiceRow}
                value={draft.sex}
                onValueChange={(value) =>
                  patch({ sex: value as "male" | "female" })
                }
                required
                name="vo2-sex"
                aria-label={t("profile.sex.label")}
              >
                {(["male", "female"] as const).map((sex) => (
                  <label
                    key={sex}
                    className={styles.choice}
                    htmlFor={`vo2-sex-${sex}`}
                  >
                    <RadioGroupItem
                      className={styles.radioControl}
                      id={`vo2-sex-${sex}`}
                      value={sex}
                    />
                    {t(`common.gender.${sex}`)}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
            <p className={styles.profileHelp}>{t("profile.help")}</p>
          </div>

          {draft.method === "cooper" ? (
            <div className={styles.fields}>
              <label className={`${styles.field} ${styles.wide}`}>
                <span className={styles.fieldLabel}>
                  {t("methods.cooper.inputs.distance.label")}
                </span>
                <UnitInput
                  suffix={draft.units === "imperial" ? "mi" : "m"}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={distanceText}
                  onChange={(event) => {
                    setDistanceText(event.target.value);
                    patch({
                      cooperDistance: vo2DistanceFromInput(
                        event.target.value,
                        draft.units,
                      ),
                      cooperUnit: "m",
                    });
                  }}
                />
                <span className={styles.hint}>
                  {t("methods.cooper.inputs.distance.help")}
                </span>
              </label>
            </div>
          ) : null}

          {draft.method === "rockport" ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("methods.rockport.inputs.weight.label")}
                </span>
                <UnitInput
                  suffix={draft.units === "imperial" ? "lb" : "kg"}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={weightText}
                  onChange={(event) => {
                    setWeightText(event.target.value);
                    patch({
                      weightKg: vo2WeightFromInput(
                        event.target.value,
                        draft.units,
                      ),
                    });
                  }}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("methods.rockport.inputs.hr.label")}
                </span>
                <UnitInput
                  suffix="bpm"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={draft.rockportHr}
                  onChange={(event) =>
                    patch({ rockportHr: event.target.value })
                  }
                />
              </label>
              <div className={`${styles.field} ${styles.wide}`}>
                <span className={styles.fieldLabel}>
                  {t("methods.rockport.inputs.time.label")}
                </span>
                <div className={styles.clock}>
                  <label className={styles.timeInput}>
                    <Input
                      className={styles.input}
                      inputMode="numeric"
                      aria-label={t("common.units.minute")}
                      value={draft.rockportMin}
                      onChange={(event) =>
                        patch({ rockportMin: digits(event.target.value, 3) })
                      }
                    />
                    <span>{t("common.units.minute")}</span>
                  </label>
                  <label className={styles.timeInput}>
                    <Input
                      className={styles.input}
                      inputMode="numeric"
                      aria-label={t("common.units.second")}
                      value={draft.rockportSec}
                      onChange={(event) =>
                        patch({ rockportSec: digits(event.target.value, 2) })
                      }
                    />
                    <span>{t("common.units.second")}</span>
                  </label>
                </div>
                <span className={styles.hint}>
                  {t("methods.rockport.inputs.time.help")}
                </span>
              </div>
            </div>
          ) : null}

          {draft.method === "beep" ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("methods.beep.inputs.level.label")}
                </span>
                <Input
                  className={styles.input}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={21}
                  step={1}
                  value={draft.beepLevel}
                  onChange={(event) => patch({ beepLevel: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("methods.beep.inputs.shuttle.label")}
                </span>
                <Input
                  className={styles.input}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder={t("methods.beep.inputs.shuttle.placeholder")}
                  value={draft.beepShuttle}
                  onChange={(event) =>
                    patch({ beepShuttle: event.target.value })
                  }
                />
                <span className={styles.hint}>
                  {t("methods.beep.inputs.shuttle.help")}
                </span>
              </label>
              <p className={`${styles.note} ${styles.wide}`}>
                {t("methods.beep.disclaimer")}
              </p>
            </div>
          ) : null}

          {draft.method === "restingHr" ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("methods.restingHr.inputs.resting.label")}
                </span>
                <UnitInput
                  suffix="bpm"
                  type="number"
                  inputMode="numeric"
                  min={30}
                  max={120}
                  step={1}
                  value={draft.restingHr}
                  onChange={(event) => patch({ restingHr: event.target.value })}
                />
                <span className={styles.hint}>
                  {t("methods.restingHr.inputs.resting.help")}
                </span>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("methods.restingHr.inputs.max.label")}
                </span>
                <UnitInput
                  suffix="bpm"
                  type="number"
                  inputMode="numeric"
                  min={120}
                  max={230}
                  step={1}
                  placeholder={
                    autoMaxHr && Number(draft.age) >= 10
                      ? String(220 - Number(draft.age))
                      : t("methods.restingHr.inputs.max.placeholder")
                  }
                  disabled={autoMaxHr}
                  value={autoMaxHr ? "" : manualMaxHr}
                  onChange={(event) => {
                    setManualMaxHr(event.target.value);
                    patch({ maxHr: event.target.value });
                  }}
                />
                <span className={styles.hint}>
                  {t("methods.restingHr.inputs.max.help")}
                </span>
              </label>
              <label className={styles.checkboxRow} htmlFor="vo2-auto-max-hr">
                <Checkbox
                  id="vo2-auto-max-hr"
                  className={styles.checkboxControl}
                  checked={autoMaxHr}
                  onCheckedChange={(checked) => {
                    const automatic = checked === true;
                    setAutoMaxHr(automatic);
                    patch({ maxHr: automatic ? "" : manualMaxHr });
                  }}
                />
                <span>{t("methods.restingHr.autoMax")}</span>
              </label>
            </div>
          ) : null}

          {draft.method === "race" ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("methods.race.inputs.event.label")}
                </span>
                <Select
                  value={draft.raceDistance}
                  onValueChange={(value) =>
                    patch({
                      raceDistance:
                        value === "10k" || value === "half" ? value : "5k",
                    })
                  }
                >
                  <SelectTrigger
                    className={styles.select}
                    aria-label={t("methods.race.inputs.event.label")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(["5k", "10k", "half"] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {draft.units === "imperial"
                          ? t(`units.races.${value}`)
                          : t(`methods.race.inputs.event.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("methods.race.inputs.time.label")}
                </span>
                <div className={styles.clock} data-parts="3">
                  <label className={styles.timeInput}>
                    <Input
                      className={styles.input}
                      inputMode="numeric"
                      aria-label={t("common.units.hour")}
                      value={draft.raceHours}
                      onChange={(event) =>
                        patch({ raceHours: digits(event.target.value, 1) })
                      }
                    />
                    <span>{t("common.units.hour")}</span>
                  </label>
                  <label className={styles.timeInput}>
                    <Input
                      className={styles.input}
                      inputMode="numeric"
                      aria-label={t("common.units.minute")}
                      value={draft.raceMin}
                      onChange={(event) =>
                        patch({ raceMin: digits(event.target.value, 3) })
                      }
                    />
                    <span>{t("common.units.minute")}</span>
                  </label>
                  <label className={styles.timeInput}>
                    <Input
                      className={styles.input}
                      inputMode="numeric"
                      aria-label={t("common.units.second")}
                      value={draft.raceSec}
                      onChange={(event) =>
                        patch({ raceSec: digits(event.target.value, 2) })
                      }
                    />
                    <span>{t("common.units.second")}</span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className={styles.error} role="alert">
              {messageFor(error)}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button type="submit" className={styles.primary}>
              {t("common.buttons.calculate")}
            </Button>
          </div>
          <p className={styles.note}>{t("panel.note")}</p>
        </form>
      </div>

      <div className={styles.scoreWrap}>
        <section
          id="vo2-scorecard"
          aria-live="polite"
          className={styles.scorecard}
          tabIndex={-1}
        >
          <div className={styles.scoreHead}>
            <p className={styles.scoreKicker}>{t("scorecard.kicker")}</p>
            <p className={styles.scoreMark}>{t("scorecard.brand")}</p>
          </div>
          {computed ? (
            <>
              <p className={styles.scoreProtocol}>
                {t(`methods.${computed.method}.tab`)}
                {" · "}
                {detailLine(computed.detail)}
              </p>
              <div className={styles.scoreMain}>
                <div className={styles.scoreValue}>
                  <p className={styles.scoreLabel}>
                    {t(
                      computed.method === "race"
                        ? "scorecard.raceValueLabel"
                        : "scorecard.valueLabel",
                    )}
                  </p>
                  <p className={styles.scoreNumber}>
                    {oneDecimal(computed.vo2max)}
                  </p>
                  <p className={styles.scoreUnit}>
                    {computed.method === "race" ? "VDOT" : t("scorecard.unit")}
                  </p>
                </div>
                <div className={styles.scoreReading}>
                  <p className={styles.scoreLabel}>
                    {t("scorecard.bandsTitle")}
                  </p>
                  <p className={styles.levelStamp}>
                    {t(
                      `fitnessLevel.levels.${computed.fitness.levelKey}.label`,
                    )}
                  </p>
                  <p className={styles.scoreLine}>
                    {t("scorecard.profile", {
                      age: computed.age,
                      sex: sexLabel,
                      band: bandLabel,
                    })}
                  </p>
                </div>
              </div>
              <div className={styles.bands}>
                <h3>{t("scorecard.bandsTitle")}</h3>
                <ul className={styles.bandList}>
                  {LEVELS.map((level) => {
                    const active = computed.fitness.levelKey === level;
                    const value =
                      level === "poor"
                        ? computed.fitness.thresholds.fair
                        : computed.fitness.thresholds[level];
                    return (
                      <li key={level} data-active={active ? "true" : "false"}>
                        <span>{t(`fitnessLevel.levels.${level}.label`)}</span>
                        <span>
                          {level === "poor"
                            ? t("scorecard.bandBelow", {
                                value: oneDecimal(value),
                              })
                            : t("scorecard.bandAtLeast", {
                                value: oneDecimal(value),
                              })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <p className={styles.source}>
                {t("scorecard.source")}{" "}
                <a
                  href="https://www8.garmin.com/manuals/webhelp/GUID-CB71AAE9-99E6-47B4-AB7F-F14BA316E7C6/EN-US/GUID-1FBCCD9E-19E1-4E4C-BD60-1793B5B97EB3.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  The Cooper Institute / Garmin
                </a>
              </p>
              {computed.age < 20 || computed.age >= 80 ? (
                <p className={styles.limitation}>{t("scorecard.ageLimit")}</p>
              ) : null}
              <div className={styles.resultEvidence}>
                <span>{t("scorecard.evidence")}</span>
                <strong>{t(`calculation.${computed.method}`)}</strong>
              </div>
              {computed.method === "race" ? (
                <p className={styles.limitation}>{t("scorecard.raceNote")}</p>
              ) : null}
              <p className={styles.retest}>{t("scorecard.retest")}</p>
              {computed.detail.kind === "race" ? (
                <p className={styles.limitation}>
                  <Link
                    href={`${prefix}/vdot-calculator`}
                    className={styles.vdotLink}
                  >
                    {t("scorecard.vdotLink")}
                  </Link>
                </p>
              ) : null}
              <p className={styles.limitation}>{t("scorecard.limitation")}</p>
            </>
          ) : (
            <div className={styles.emptyScore}>
              <p className={styles.scoreNumber}>—</p>
              <p>{t("scorecard.empty")}</p>
            </div>
          )}
        </section>
        <div className={styles.scoreActions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={onPrint}
            disabled={!computed}
          >
            <Printer className="size-3.5" aria-hidden />
            {t("scorecard.print")}
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={onShare}
            disabled={!computed}
          >
            <Share2 className="size-3.5" aria-hidden />
            {copied ? t("scorecard.copied") : t("scorecard.share")}
          </button>
        </div>
      </div>
    </div>
  );
}
