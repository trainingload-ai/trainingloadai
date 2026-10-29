"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { Printer, Share2, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CpFileInput } from "./file-input";
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
import {
  CP_DURATION_IDEAL_MAX_S,
  CP_DURATION_IDEAL_MIN_S,
  CP_DURATION_MAX_S,
  CP_DURATION_MIN_S,
  CP_POWER_MAX_W,
  CP_PRESET_SECONDS,
  bodyMassLimits,
  buildCpSearch,
  canonicalKgFromDisplay,
  cpWattsPerKg,
  cpZonesHref,
  displayMassFromKg,
  fitCriticalPower,
  formatRSquared,
  formatWPrimeKj,
  parseCpQuery,
  predictPowerWatts,
  roundCpWatts,
  secondsFromDraft,
  type CpEffort,
  type CpEffortDraft,
  type CpUnitSystem,
} from "@/lib/critical-power";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import {
  calculatePowerZones,
  POWER_ZONE_MODELS,
  POWER_ZONE_MODEL_NAMES,
  type PowerZoneModel,
} from "@/lib/power-zones";
import { parsePowerZonesPrefill } from "@/lib/zone-tool-links";
import styles from "./critical-power-calculator.module.css";

const CpFitChart = dynamic(
  () => import("./fit-chart").then((module) => module.CpFitChart),
  {
    loading: () => <div className={styles.chartLoading} aria-busy="true" />,
  },
);

function UnitInput({
  suffix,
  className,
  ...props
}: { suffix: string } & ComponentProps<typeof Input>) {
  return (
    <div className={styles.inputShell}>
      <Input className={`pr-11 ${className ?? ""}`} {...props} />
      <span className={styles.inputSuffix} aria-hidden="true">
        {suffix}
      </span>
    </div>
  );
}

const EMPTY_EFFORTS: [CpEffortDraft, CpEffortDraft, CpEffortDraft] = [
  { preset: "180", minutes: "", watts: "" },
  { preset: "720", minutes: "", watts: "" },
  { preset: "unset", minutes: "", watts: "" },
];

function parsePositiveNumber(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function CriticalPowerCalculatorClient({
  hero,
  methods,
}: {
  hero: ReactNode;
  methods: ReactNode;
}) {
  const t = useTranslations("criticalPowerCalculator.page");
  const tZones = useTranslations("powerZonesCalculator.client");
  const prefix = localePrefix(useLocale());
  const [inputTab, setInputTab] = useState("manual");
  const [sourceFile, setSourceFile] = useState<string | null>(null);
  const [efforts, setEfforts] = useState(EMPTY_EFFORTS);
  const [weightText, setWeightText] = useState("");
  const [weightKgText, setWeightKgText] = useState("");
  const [units, setUnits] = useState<CpUnitSystem>("metric");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoneModel, setZoneModel] = useState<PowerZoneModel>("FRIEL");

  useLayoutEffect(() => {
    const query = parseCpQuery(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- restore the shared URL after SSR */
    setEfforts(query.efforts);
    setUnits(query.units);
    const model = parsePowerZonesPrefill(window.location.search).model;
    if (model) setZoneModel(model);
    if (query.weightKg) {
      setWeightKgText(query.weightKg);
      setWeightText(displayMassFromKg(query.weightKg, query.units));
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!ready) return;
    const nextSearch = buildCpSearch(window.location.search, {
      efforts,
      weightKg: weightKgText,
      units,
    });
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [efforts, ready, units, weightKgText]);

  const weightLimits = bodyMassLimits(units);
  const weightRaw = parsePositiveNumber(weightText);
  const weightInvalid =
    weightText.trim() !== "" &&
    (weightRaw == null ||
      weightRaw < weightLimits.min ||
      weightRaw > weightLimits.max);
  const bodyWeightKg = weightInvalid ? null : parsePositiveNumber(weightKgText);

  function updateEffort(index: number, patch: Partial<CpEffortDraft>) {
    setSourceFile(null);
    setEfforts((current) => {
      const next = [...current] as typeof current;
      const previous = next[index]!;
      next[index] = { ...previous, ...patch };
      if (
        patch.preset &&
        patch.preset !== "custom" &&
        patch.preset !== "unset"
      ) {
        next[index] = { ...next[index]!, minutes: "" };
      }
      return next;
    });
  }

  function onWeightInput(value: string) {
    setWeightText(value);
    setWeightKgText(canonicalKgFromDisplay(value, units));
  }

  function selectUnits(next: CpUnitSystem) {
    if (next === units) return;
    if (weightKgText.trim()) {
      setWeightText(displayMassFromKg(weightKgText, next));
    }
    setUnits(next);
  }

  function onUnitKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? "imperial" : "metric";
    selectUnits(next);
    document
      .getElementById(
        next === "metric" ? "cp-units-metric" : "cp-units-imperial",
      )
      ?.focus();
  }

  const parsedEfforts = useMemo(() => {
    return efforts.map((draft) => {
      const seconds = secondsFromDraft(draft);
      const watts = parsePositiveNumber(draft.watts);
      const touched =
        draft.watts.trim() !== "" ||
        draft.minutes.trim() !== "" ||
        (draft.preset !== "unset" &&
          draft.preset !== "180" &&
          draft.preset !== "720");
      const durationInvalid =
        draft.preset === "custom" &&
        draft.minutes.trim() !== "" &&
        (seconds == null ||
          seconds < CP_DURATION_MIN_S ||
          seconds > CP_DURATION_MAX_S);
      const powerInvalid =
        draft.watts.trim() !== "" && (watts == null || watts > CP_POWER_MAX_W);
      const complete =
        seconds != null &&
        watts != null &&
        watts <= CP_POWER_MAX_W &&
        seconds >= CP_DURATION_MIN_S &&
        seconds <= CP_DURATION_MAX_S;
      return {
        draft,
        seconds,
        watts,
        touched,
        durationInvalid,
        powerInvalid,
        complete,
      };
    });
  }, [efforts]);

  const completeEfforts: CpEffort[] = parsedEfforts
    .filter(
      (effort) =>
        effort.complete && effort.seconds != null && effort.watts != null,
    )
    .map((effort) => ({ seconds: effort.seconds!, watts: effort.watts! }));

  const fit =
    completeEfforts.length >= 2 ? fitCriticalPower(completeEfforts) : null;
  const usable =
    fit != null && fit.cpWatts > 0 && fit.wPrimeJoules > 0 ? fit : null;
  const cpRounded = usable ? roundCpWatts(usable.cpWatts) : null;
  const wkg =
    cpRounded != null && bodyWeightKg != null
      ? cpWattsPerKg(cpRounded, bodyWeightKg)
      : null;
  const zones =
    cpRounded == null ? null : calculatePowerZones(zoneModel, cpRounded);
  const zoneName = (order: number) =>
    tZones(
      `zoneNames.${zoneModel === "COGGAN" ? "FRIEL" : zoneModel}.z${order}`,
    );

  function onZoneModelChange(value: string) {
    const model = POWER_ZONE_MODELS.find((item) => item === value);
    if (!model) return;
    setZoneModel(model);
    setCopied(false);
    const url = new URL(window.location.href);
    url.searchParams.set("model", model.toLowerCase());
    window.history.replaceState(window.history.state, "", url);
  }

  const warnings = (() => {
    const items: string[] = [];
    const started = parsedEfforts.some(
      (effort) =>
        effort.draft.watts.trim() !== "" || effort.draft.minutes.trim() !== "",
    );
    if (parsedEfforts.some((effort) => effort.powerInvalid)) {
      items.push(t("manual.invalidPower"));
    }
    if (
      parsedEfforts.some(
        (effort) =>
          effort.complete &&
          effort.watts != null &&
          (effort.watts < 50 || effort.watts > 1500),
      )
    ) {
      items.push(t("manual.warnings.powerRange"));
    }
    if (parsedEfforts.some((effort) => effort.durationInvalid)) {
      items.push(t("manual.invalidDuration"));
    }
    const outside = completeEfforts.some(
      (effort) =>
        effort.seconds < CP_DURATION_IDEAL_MIN_S ||
        effort.seconds > CP_DURATION_IDEAL_MAX_S,
    );
    if (outside) items.push(t("manual.warnings.durationWindow"));
    if (started && completeEfforts.length < 2) {
      items.push(t("manual.warnings.needTwo"));
    }
    if (completeEfforts.length >= 2) {
      const durations = completeEfforts.map((effort) => effort.seconds);
      if (new Set(durations).size !== durations.length) {
        items.push(t("manual.warnings.sameDuration"));
      }
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);
      if (maxDuration / minDuration < 2.5) {
        items.push(t("manual.warnings.durationSpread"));
      }
      const ordered = [...completeEfforts].sort(
        (a, b) => a.seconds - b.seconds,
      );
      for (let index = 1; index < ordered.length; index += 1) {
        if (ordered[index]!.watts > ordered[index - 1]!.watts * 1.02) {
          items.push(t("manual.warnings.increasingPower"));
          break;
        }
      }
    }
    if (fit && !usable) items.push(t("manual.warnings.fitQuality"));
    return items;
  })();

  useInstantToolAnalytics(
    "critical_power_calculator",
    "calculate_critical_power",
    usable != null,
  );

  const pacing = (() => {
    if (!usable) return null;
    const five = predictPowerWatts(usable.cpWatts, usable.wPrimeJoules, 300);
    const twenty = predictPowerWatts(usable.cpWatts, usable.wPrimeJoules, 1200);
    const eight = predictPowerWatts(usable.cpWatts, usable.wPrimeJoules, 480);
    return {
      five: five == null ? null : Math.round(five),
      twenty: twenty == null ? null : Math.round(twenty),
      eight: eight == null ? null : Math.round(eight),
    };
  })();

  async function onShare() {
    const url = new URL(window.location.href);
    url.hash = "result";
    try {
      if (navigator.share) {
        await navigator.share({
          title: t("result.summaryTitle"),
          url: url.toString(),
        });
        trackToolEvent("tool_result_copied", "critical_power_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      trackToolEvent("tool_result_copied", "critical_power_calculator", {
        action: "copy_link",
      });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "critical_power_calculator", {
        action: "copy_link",
        error_code: "clipboard_failed",
      });
    }
  }

  function onPrint() {
    trackToolEvent("tool_result_copied", "critical_power_calculator", {
      action: "print_result_card",
    });
    window.print();
  }

  const steps = [
    ["efforts", t("howTo.steps.efforts.title"), t("howTo.steps.efforts.body")],
    ["card", t("howTo.steps.card.title"), t("howTo.steps.card.body")],
    ["zones", t("howTo.steps.zones.title"), t("howTo.steps.zones.body")],
  ] as const;

  return (
    <>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <div className={styles.boardHead}>
            <h2 className={styles.boardLabel}>{t("manual.title")}</h2>
            <div
              role="radiogroup"
              aria-label={t("manual.unitsLabel")}
              className={styles.unitSwitch}
            >
              <Button
                id="cp-units-metric"
                type="button"
                role="radio"
                variant="ghost"
                aria-checked={units === "metric"}
                tabIndex={units === "metric" ? 0 : -1}
                onClick={() => selectUnits("metric")}
                onKeyDown={onUnitKeyDown}
                className={styles.unitOption}
              >
                {t("manual.unitsMetric")}
              </Button>
              <Button
                id="cp-units-imperial"
                type="button"
                role="radio"
                variant="ghost"
                aria-checked={units === "imperial"}
                tabIndex={units === "imperial" ? 0 : -1}
                onClick={() => selectUnits("imperial")}
                onKeyDown={onUnitKeyDown}
                className={styles.unitOption}
              >
                {t("manual.unitsImperial")}
              </Button>
            </div>
          </div>
          <Tabs value={inputTab} onValueChange={setInputTab}>
            <TabsList
              className={styles.inputTabs}
              aria-label={t("file.inputMode")}
            >
              <TabsTrigger value="manual">{t("file.manualTab")}</TabsTrigger>
              <TabsTrigger value="file">{t("file.fileTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="manual">
              <p className={styles.boardLead}>{t("manual.lead")}</p>
              <ol className={styles.stepList}>
                {steps.map(([key, title, body], index) => (
                  <li key={key} className={styles.stepItem}>
                    <span className={styles.stepIndex}>{index + 1}</span>
                    <p>
                      <strong>{title}</strong> {body}
                    </p>
                  </li>
                ))}
              </ol>
              <div className={styles.formStack}>
                {parsedEfforts.map((effort, index) => (
                  <div key={index} className={styles.effort}>
                    <div className={styles.effortHead}>
                      <div className={styles.effortTitle}>
                        {t("manual.effort", { index: index + 1 })}
                      </div>
                      {index === 2 ? (
                        <span className={styles.effortOptional}>
                          {t("manual.optional")}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.effortGrid}>
                      <div className={styles.field}>
                        <Label htmlFor={`cp-duration-${index}`}>
                          {t("manual.duration")}
                        </Label>
                        <Select
                          value={effort.draft.preset}
                          onValueChange={(value) =>
                            updateEffort(index, { preset: value })
                          }
                        >
                          <SelectTrigger
                            id={`cp-duration-${index}`}
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectItem value="unset">
                              {t("manual.durationPlaceholder")}
                            </SelectItem>
                            {CP_PRESET_SECONDS.map((seconds) => (
                              <SelectItem key={seconds} value={String(seconds)}>
                                {t("manual.minutes", { count: seconds / 60 })}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">
                              {t("manual.custom")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className={styles.field}>
                        <Label htmlFor={`cp-power-${index}`}>
                          {t("manual.power")}
                        </Label>
                        <UnitInput
                          id={`cp-power-${index}`}
                          suffix="W"
                          inputMode="decimal"
                          value={effort.draft.watts}
                          placeholder={t("manual.powerPlaceholder")}
                          aria-invalid={effort.powerInvalid}
                          onChange={(event) =>
                            updateEffort(index, { watts: event.target.value })
                          }
                        />
                      </div>
                    </div>
                    {effort.draft.preset === "custom" ? (
                      <div className={styles.field}>
                        <Label htmlFor={`cp-minutes-${index}`}>
                          {t("manual.customMinutes")}
                        </Label>
                        <UnitInput
                          id={`cp-minutes-${index}`}
                          suffix="min"
                          inputMode="decimal"
                          value={effort.draft.minutes}
                          placeholder={t("manual.customPlaceholder")}
                          aria-invalid={effort.durationInvalid}
                          onChange={(event) =>
                            updateEffort(index, { minutes: event.target.value })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
                {warnings.length > 0 ? (
                  <div role="status" className={styles.alert}>
                    <ul>
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </TabsContent>
            <TabsContent value="file" forceMount hidden={inputTab !== "file"}>
              <CpFileInput
                active={inputTab === "file"}
                onResult={(next, filename) => {
                  setEfforts(next);
                  setSourceFile(filename);
                  setCopied(false);
                }}
              />
            </TabsContent>
          </Tabs>
          <div className={styles.sharedWeight}>
            <div className={styles.field}>
              <Label htmlFor="cp-weight">
                {units === "imperial"
                  ? t("manual.weightLabelLb")
                  : t("manual.weightLabel")}{" "}
                <span className={styles.fieldOptional}>
                  {t("manual.weightOptional")}
                </span>
              </Label>
              <UnitInput
                id="cp-weight"
                suffix={units === "imperial" ? "lb" : "kg"}
                inputMode="decimal"
                value={weightText}
                placeholder={
                  units === "imperial"
                    ? t("manual.weightPlaceholderLb")
                    : t("manual.weightPlaceholder")
                }
                aria-invalid={weightInvalid}
                onChange={(event) => onWeightInput(event.target.value)}
              />
            </div>
            {weightInvalid ? (
              <p role="alert" className={styles.alert}>
                {units === "imperial"
                  ? t("manual.invalidWeightLb")
                  : t("manual.invalidWeight")}
              </p>
            ) : null}
          </div>
          {sourceFile ? (
            <p className={styles.fileHint}>
              {t("file.source", { filename: sourceFile })}
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
              <div className={styles.posterPower}>
                <p className={styles.posterEyebrow}>{t("result.cpLabel")}</p>
                <p
                  className={styles.posterWatts}
                  data-wide={cpRounded != null && cpRounded >= 1000}
                >
                  <span className={styles.posterNumber}>
                    {cpRounded ?? "—"}
                  </span>
                  {cpRounded != null ? (
                    <span className={styles.posterUnit}>W</span>
                  ) : null}
                </p>
                <p className={styles.posterProtocol}>
                  {usable
                    ? t("result.records", { count: completeEfforts.length })
                    : t("result.empty")}
                </p>
              </div>
              <div className={styles.pride}>
                <p className={styles.posterEyebrow}>
                  {t("result.wPrimeLabel")}
                </p>
                <p className={styles.prideFigure}>
                  <span
                    className={styles.prideValue}
                    data-wide={usable != null && usable.wPrimeJoules >= 1000000}
                  >
                    {usable ? formatWPrimeKj(usable.wPrimeJoules) : "—"}
                  </span>
                  <span className={styles.prideUnit}>kJ</span>
                </p>
                {wkg != null ? (
                  <div className={styles.prideClassification}>
                    <p className={styles.prideBand}>
                      {wkg.toFixed(2)} <span>W/kg</span>
                    </p>
                    <p className={styles.bandCaption}>{t("result.wkgLabel")}</p>
                  </div>
                ) : usable ? (
                  <p className={styles.posterHint}>{t("result.wkgMissing")}</p>
                ) : null}
              </div>
            </div>
            {pacing ? (
              <div
                className={styles.paceRow}
                role="group"
                aria-label={t("result.pacingTitle")}
              >
                {(["five", "eight", "twenty"] as const).map((key, index) => (
                  <div key={key}>
                    <span>
                      {t(`result.${["pace5", "pace8", "pace20"][index]}`)}
                    </span>
                    <strong>
                      {pacing[key] == null ? "—" : `${pacing[key]} W`}
                    </strong>
                  </div>
                ))}
              </div>
            ) : null}
            {zones ? (
              <div className={styles.posterZones}>
                <div className={styles.zoneHeading}>
                  <h3>
                    {t("result.zonesTitle", {
                      model: POWER_ZONE_MODEL_NAMES[zoneModel],
                    })}
                  </h3>
                  <span>{t("result.wattsCol")} · W</span>
                </div>
                <ol className={styles.zoneStrip} data-count={zones.length}>
                  {zones.map((zone) => (
                    <li
                      key={zone.order}
                      className={styles.zoneCell}
                      data-zone={`z${zone.order}`}
                      aria-label={`Z${zone.order} ${zoneName(zone.order)} ${zone.wattLabel}, ${zone.percentLabel} CP`}
                    >
                      <span className={styles.zoneSwatch}>Z{zone.order}</span>
                      <span className={styles.zoneName}>
                        {zoneName(zone.order)}
                      </span>
                      <span className={styles.zoneFigure}>
                        {zone.wattLabel.replace(/\s*W$/, "")}
                      </span>
                      <span className={styles.zonePercent}>
                        {zone.percentLabel}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className={styles.zoneCaption}>
                  {t("result.intensityCaption")}
                </p>
                {usable ? (
                  <p className={styles.posterFit}>
                    <span>
                      {usable.rSquared == null
                        ? t("result.fitExact")
                        : t("result.fitR2", {
                            r2: formatRSquared(usable.rSquared),
                          })}
                    </span>
                    {usable.rSquared != null ? (
                      <span>
                        {t("result.fitMiss", {
                          watts: Math.round(usable.maxAbsResidualWatts),
                        })}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
        <div className={`${styles.posterActions} cp-share-actions`}>
          <Select value={zoneModel} onValueChange={onZoneModelChange}>
            <SelectTrigger
              aria-label={t("result.switchZones")}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              {t("result.switchZones")}
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {POWER_ZONE_MODELS.map((model) => (
                <SelectItem key={model} value={model}>
                  {tZones(`inputs.model.options.${model.toLowerCase()}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cpRounded != null ? (
            <a
              href={cpZonesHref(prefix, cpRounded, zoneModel)}
              className={styles.primaryAction}
            >
              {t("result.handoff")}
            </a>
          ) : null}
          <Button type="button" variant="outline" size="lg" onClick={onPrint}>
            <Printer className="size-3.5" aria-hidden />
            {t("result.print")}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={onShare}>
            <Share2 className="size-3.5" aria-hidden />
            {copied ? t("result.copied") : t("result.copyLink")}
          </Button>
        </div>
      </div>
      <section id="methods" className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 className={styles.sectionTitle}>{t("sections.methods.title")}</h2>
          <p className={styles.sectionBody}>
            {t("sections.methods.description")}
          </p>
        </div>
        <CpFitChart fit={usable} />
        {methods}
      </section>
    </>
  );
}
