"use client";
import { InputSource } from "@/components/calculators/input-source";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Printer, Share2, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatRaceDuration, type VdotZoneKey } from "@shared/vdot";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import {
  briefRaceEquivalents,
  roundPaceSeconds,
  trainingPaceBands,
  vdotFromRace,
  type PaceUnit,
} from "@/lib/vdot-calculator";
import { parseFlexibleTime, parseTimeParts } from "@/lib/vdot-time";
import { formatClock, secondsToTimeParts } from "@/lib/running-pace";
import { VdotFileInput } from "./file-input";
import {
  VDOT_PRESET_METERS,
  exampleVdotInputs,
  type VdotPreset,
  type VdotShareInputs,
} from "./share-inputs";
import styles from "./vdot-calculator.module.css";

const PRESET_KEYS = Object.keys(VDOT_PRESET_METERS) as Array<
  keyof typeof VDOT_PRESET_METERS
>;

const RACE_LABEL = {
  "5k": "5k",
  "10k": "10k",
  half: "half",
  marathon: "full",
} as const;

const ZONE_NAME: Record<VdotZoneKey, string> = {
  E: "easy",
  M: "marathon",
  T: "threshold",
  I: "interval",
  R: "repetition",
};

function paceLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function clockParts(total: number) {
  const parts = secondsToTimeParts(total);
  return {
    hours: parts.hours > 0 ? String(parts.hours) : "",
    minutes: String(parts.minutes).padStart(2, "0"),
    seconds: String(parts.seconds).padStart(2, "0"),
    clock: formatClock(total),
  };
}

export function VdotCalculatorClient({
  hero,
  methods,
  initialInputs,
}: {
  hero: ReactNode;
  methods: ReactNode;
  initialInputs: VdotShareInputs;
}) {
  const t = useTranslations("vdotCalculator.client");
  const locale = useLocale();
  const prefix = localePrefix(locale);
  const initialClock =
    initialInputs.timeSec == null ? null : clockParts(initialInputs.timeSec);
  const [preset, setPreset] = useState<VdotPreset>(initialInputs.preset);
  const [customKm, setCustomKm] = useState(initialInputs.customKm);
  const [hours, setHours] = useState(initialClock?.hours ?? "");
  const [minutes, setMinutes] = useState(initialClock?.minutes ?? "");
  const [seconds, setSeconds] = useState(initialClock?.seconds ?? "");
  const [clockText, setClockText] = useState(initialClock?.clock ?? "");
  const [timeSource, setTimeSource] = useState<"parts" | "clock" | "exact">(
    initialInputs.timeSec == null ? "parts" : "exact",
  );
  const [exactTime, setExactTime] = useState<number | null>(
    initialInputs.timeSec,
  );
  const [unit, setUnit] = useState<PaceUnit>(initialInputs.unit);
  const [example, setExample] = useState(initialInputs.example);
  const [entry, setEntry] = useState<"manual" | "file">("manual");
  const [fileName, setFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const completed = useRef<string | null>(null);

  const distanceM = useMemo(() => {
    if (preset !== "custom") return VDOT_PRESET_METERS[preset];
    const km = Number(customKm.trim().replace(",", "."));
    if (!Number.isFinite(km) || km <= 0) return null;
    return km * 1000;
  }, [customKm, preset]);

  const timeSec = useMemo(() => {
    if (timeSource === "exact") return exactTime;
    if (timeSource === "clock") {
      return clockText.trim() ? parseFlexibleTime(clockText) : null;
    }
    return parseTimeParts(hours, minutes, seconds);
  }, [clockText, exactTime, hours, minutes, seconds, timeSource]);

  const clockInvalid =
    clockText.trim() !== "" && timeSource === "clock" && timeSec == null;
  const distanceInvalid =
    preset === "custom" && customKm.trim() !== "" && distanceM == null;

  const result = useMemo(() => {
    if (distanceM == null || timeSec == null) return null;
    const vdot = vdotFromRace(distanceM, timeSec);
    const equivalents = briefRaceEquivalents(distanceM, timeSec);
    const bands = vdot == null ? null : trainingPaceBands(vdot, unit);
    if (vdot == null || equivalents == null || bands == null) return null;
    const paceSecPerKm = timeSec / (distanceM / 1000);
    return {
      vdot,
      distanceM,
      timeSec,
      paceSec: roundPaceSeconds(paceSecPerKm, unit),
      bands,
      equivalents,
    };
  }, [distanceM, timeSec, unit]);

  useEffect(() => {
    const current = new URL(window.location.href);
    const next = new URL(current.href);
    next.search = "";
    if (result) {
      next.searchParams.set("d", String(result.distanceM));
      next.searchParams.set("t", String(result.timeSec));
      if (unit === "mi") next.searchParams.set("unit", "mi");
      if (example) next.searchParams.set("example", "1");
    }
    next.hash = current.hash;
    if (
      `${next.pathname}${next.search}${next.hash}` !==
      `${current.pathname}${current.search}${current.hash}`
    ) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [example, result, unit]);

  useEffect(() => {
    if (!result) return;
    const signature = `${result.distanceM}|${result.timeSec}|${result.vdot}`;
    if (completed.current === signature) return;
    completed.current = signature;
    trackToolEvent("tool_completed", "vdot_calculator", {
      action: "calculate_vdot",
    });
  }, [result]);

  useEffect(
    () => () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const applyTime = (total: number, nextExample: boolean) => {
    const parts = clockParts(total);
    setHours(parts.hours);
    setMinutes(parts.minutes);
    setSeconds(parts.seconds);
    setClockText(parts.clock);
    setExactTime(total);
    setTimeSource("exact");
    setExample(nextExample);
  };

  const useExample = () => {
    const sample = exampleVdotInputs(unit);
    setPreset(sample.preset);
    setCustomKm("");
    setEntry("manual");
    setFileName(null);
    applyTime(sample.timeSec ?? 25 * 60, true);
    trackToolEvent("tool_started", "vdot_calculator", {
      action: "try_example",
    });
  };

  const onUnitChange = (value: string) => {
    if (value !== "km" && value !== "mi") return;
    setUnit(value);
  };

  const onShare = async () => {
    if (!result) return;
    const shareUrl = new URL(window.location.href);
    shareUrl.hash = "result";
    const url = shareUrl.toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: t("scorecard.title"), url });
        trackToolEvent("tool_result_copied", "vdot_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      trackToolEvent("tool_result_copied", "vdot_calculator", {
        action: "copy_share_link",
      });
      setShareError(null);
      setCopied(true);
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "vdot_calculator", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      setShareError(t("scorecard.shareError"));
    }
  };

  const onPrint = () => {
    if (!result) return;
    trackToolEvent("tool_result_copied", "vdot_calculator", {
      action: "print_result_card",
    });
    window.print();
  };

  const distanceLabel =
    preset === "custom"
      ? t("scorecard.customDistance", {
          km:
            distanceM == null
              ? customKm
              : String(Math.round((distanceM / 1000) * 1000) / 1000),
        })
      : t(`presets.${preset}`);

  return (
    <>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <div className={styles.boardHead}>
            <h2 className={styles.boardLabel}>{t("panel.inputTitle")}</h2>
          </div>
          <div className={styles.formStack}>
            <InputSource
              value={entry}
              label={t("file.legend")}
              manual={t("file.manual")}
              file={t("file.upload")}
              onValueChange={setEntry}
            />

            {entry === "file" ? (
              <VdotFileInput
                active={entry === "file"}
                onApply={({ distanceM: meters, timeSec: effort, filename }) => {
                  const matched = PRESET_KEYS.find(
                    (key) => Math.abs(VDOT_PRESET_METERS[key] - meters) < 1,
                  );
                  if (matched) {
                    setPreset(matched);
                    setCustomKm("");
                  } else {
                    setPreset("custom");
                    setCustomKm(
                      String(Math.round((meters / 1000) * 1000) / 1000),
                    );
                  }
                  setFileName(filename);
                  applyTime(effort, false);
                  trackToolEvent("tool_started", "vdot_calculator", {
                    action: "activity_file",
                  });
                }}
              />
            ) : (
              <>
                <div className={styles.field}>
                  <Label htmlFor="vdot-distance">
                    {t("inputs.distancePreset.label")}
                  </Label>
                  <Select
                    value={preset}
                    onValueChange={(value) => {
                      setPreset(value as VdotPreset);
                      setExample(false);
                    }}
                  >
                    <SelectTrigger id="vdot-distance" className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESET_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`presets.${key}`)}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">
                        {t("presets.custom")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {preset === "custom" ? (
                  <div className={styles.field}>
                    <Label htmlFor="vdot-custom-distance">
                      {t("inputs.distanceCustom.label")}
                    </Label>
                    <Input
                      id="vdot-custom-distance"
                      className="h-10"
                      inputMode="decimal"
                      value={customKm}
                      aria-invalid={distanceInvalid}
                      onChange={(event) => {
                        setCustomKm(event.target.value);
                        setExample(false);
                      }}
                    />
                    <p className={styles.hint}>
                      {t("inputs.distanceCustom.unit")}
                    </p>
                  </div>
                ) : null}
                <fieldset className={styles.field}>
                  <legend className={styles.fieldLabel}>
                    {t("inputs.time.label")}
                  </legend>
                  <div className={styles.timeGrid}>
                    {(
                      [
                        ["hours", hours, setHours, t("inputs.time.units.hour")],
                        [
                          "minutes",
                          minutes,
                          setMinutes,
                          t("inputs.time.units.minute"),
                        ],
                        [
                          "seconds",
                          seconds,
                          setSeconds,
                          t("inputs.time.units.second"),
                        ],
                      ] as const
                    ).map(([key, value, setter, label]) => (
                      <label key={key} className={styles.part}>
                        <span>{label}</span>
                        <Input
                          className="h-10"
                          inputMode="decimal"
                          autoComplete="off"
                          value={value}
                          aria-label={label}
                          onChange={(event) => {
                            setter(
                              event.target.value
                                .replace(/[^\d.]/g, "")
                                .slice(0, 6),
                            );
                            setTimeSource("parts");
                            setExactTime(null);
                            setExample(false);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className={styles.field}>
                  <Label htmlFor="vdot-clock">
                    {t("inputs.time.clockLabel")}
                  </Label>
                  <Input
                    id="vdot-clock"
                    className="h-10"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={t("inputs.time.clockPlaceholder")}
                    value={clockText}
                    aria-invalid={clockInvalid}
                    onChange={(event) => {
                      setClockText(event.target.value);
                      setTimeSource("clock");
                      setExactTime(null);
                      setExample(false);
                      const parsed = parseFlexibleTime(event.target.value);
                      if (parsed == null) return;
                      const parts = clockParts(parsed);
                      setHours(parts.hours);
                      setMinutes(parts.minutes);
                      setSeconds(parts.seconds);
                    }}
                  />
                  <p className={styles.hint}>{t("inputs.time.help")}</p>
                </div>
              </>
            )}

            {fileName ? (
              <p className={styles.hint} role="status">
                {t("file.source", { filename: fileName })}
              </p>
            ) : null}
            {clockInvalid ? (
              <p className={styles.alert} role="alert">
                {t("errors.timeFormat")}
              </p>
            ) : null}
            {distanceInvalid ? (
              <p className={styles.alert} role="alert">
                {t("errors.distance")}
              </p>
            ) : null}
            <Button
              type="button"
              className={styles.exampleButton}
              onClick={useExample}
            >
              {t("example.button")}
            </Button>
          </div>
        </section>
      </div>

      <div className={styles.posterWrap}>
        <section id="result" aria-live="polite" className={styles.poster}>
          <div className={styles.posterSheet}>
            <div className={styles.posterBrand}>
              <h2 className={styles.posterHeading}>{t("scorecard.title")}</h2>
              <p className={styles.posterMark}>Trainingload.ai</p>
            </div>
            <div className={styles.posterMain}>
              <div>
                <p className={styles.eyebrow}>{t("result.vdot")}</p>
                <p
                  className={styles.posterNumber}
                  data-wide={result != null && result.vdot >= 100}
                >
                  {result ? result.vdot.toFixed(1) : "—"}
                </p>
                {result ? (
                  <p className={styles.methodLine}>
                    {t("scorecard.method", {
                      distance: distanceLabel,
                      time: formatRaceDuration(result.timeSec),
                    })}
                  </p>
                ) : (
                  <p className={styles.posterHint}>{t("scorecard.empty")}</p>
                )}
                {example && result ? (
                  <p className={styles.exampleNote}>{t("example.note")}</p>
                ) : null}
              </div>
              <div className={styles.pride}>
                <p className={styles.eyebrow}>{t("scorecard.paceLabel")}</p>
                <p className={styles.prideFigure}>
                  <span>
                    {result?.paceSec == null ? "—" : paceLabel(result.paceSec)}
                  </span>
                  <span className={styles.prideUnit}>
                    {unit === "mi"
                      ? t("scorecard.paceMi")
                      : t("scorecard.paceKm")}
                  </span>
                </p>
              </div>
            </div>
            {result ? (
              <div className={styles.posterZones} id="paces">
                <ol className={styles.zoneStrip}>
                  {result.bands.map((band) => (
                    <li
                      key={band.zone}
                      className={styles.zoneCell}
                      data-zone={band.zone}
                      style={{
                        ["--zone-color" as string]: `var(--vdot-zone-${band.zone})`,
                      }}
                    >
                      <span className={styles.zoneSwatch}>{band.zone}</span>
                      <span className={styles.zoneName}>
                        {t(`trainingPaces.rows.${ZONE_NAME[band.zone]}.label`)}
                      </span>
                      <span className={styles.zoneFigure}>
                        {paceLabel(band.fastSec)}–{paceLabel(band.slowSec)}
                      </span>
                      <span className={styles.zonePercent}>
                        {Math.round(band.lowPercent * 100)}–
                        {Math.round(band.highPercent * 100)}%
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div id="paces" hidden />
            )}
            <div className={styles.posterTables} id="equivalents">
              {result ? (
                <>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <caption className="sr-only">
                        {t("raceEquivalents.title")}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">
                            {t("raceEquivalents.headers.race")}
                          </th>
                          <th scope="col">
                            {t("raceEquivalents.headers.time")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.equivalents.rows.map((row) => (
                          <tr key={row.key}>
                            <th scope="row">
                              {t(`raceEquivalents.rows.${RACE_LABEL[row.key]}`)}
                            </th>
                            <td className={styles.mono}>
                              {row.timeSec == null
                                ? "—"
                                : formatRaceDuration(row.timeSec)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.note}>
                    <a
                      className={styles.textLink}
                      href={`${prefix}/race-time-predictor`}
                    >
                      {t("scorecard.equivalentsLink")}
                    </a>
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </section>
        <div className={`${styles.posterActions} vdot-share-actions`}>
          <Select value={unit} onValueChange={onUnitChange}>
            <SelectTrigger
              aria-label={t("scorecard.switchUnits")}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                styles.actionButton,
              )}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="km">{t("scorecard.unitsMetric")}</SelectItem>
              <SelectItem value="mi">{t("scorecard.unitsImperial")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={styles.actionButton}
            onClick={onPrint}
            disabled={!result}
          >
            <Printer className="size-3.5" aria-hidden />
            {t("scorecard.print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={styles.actionButton}
            onClick={onShare}
            disabled={!result}
          >
            <Share2 className="size-3.5" aria-hidden />
            {copied ? t("scorecard.copied") : t("scorecard.share")}
          </Button>
        </div>
        {shareError ? (
          <p className={styles.alert} role="alert">
            {shareError}
          </p>
        ) : null}
      </div>
      {methods}
    </>
  );
}
