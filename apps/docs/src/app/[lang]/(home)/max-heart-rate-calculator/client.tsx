"use client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InputSource } from "@/components/calculators/input-source";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Printer, Share2, SlidersHorizontal } from "lucide-react";
import { TrackedLink } from "@/components/TrackedLink";
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
import {
  calculateMhrZones,
  compareObservedPeak,
  estimateMaxHr,
  isMaxHrFormulaKey,
  parseMaxHrAge,
  parseMeasuredMaxHr,
  recommendedMaxHrFormula,
  roundBpm,
  tanakaSeeBand,
  type MaxHrFormulaChoice,
  type MaxHrFormulaKey,
  type MaxHrSex,
} from "@/lib/max-heart-rate";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import { heartRateZonesMaxHrHref } from "@/lib/zone-tool-links";
import { MaxHrFileInput, UseObservedPeakButton } from "./file-input";
import type { MaxHeartRateInputs } from "./share-inputs";
import styles from "./max-heart-rate-calculator.module.css";

const FormulaComparisonChart = dynamic(
  () =>
    import("./formula-comparison-chart").then(
      (module) => module.FormulaComparisonChart,
    ),
  {
    ssr: false,
    loading: () => <div className={styles.chartLoading} aria-hidden="true" />,
  },
);

const FORMULA_SHORT: Record<MaxHrFormulaKey, string> = {
  tanaka: "Tanaka",
  gulati: "Gulati",
  hunt: "HUNT",
  arena: "Arena",
  fox: "Fox",
};

function useLang() {
  const params = useParams();
  const langParam = params?.lang;
  if (typeof langParam === "string") return langParam;
  if (Array.isArray(langParam) && langParam[0]) return langParam[0];
  return "en";
}

export function MaxHeartRateCalculatorClient({
  hero,
  methods,
  initialInputs,
}: {
  hero: ReactNode;
  methods: ReactNode;
  initialInputs: MaxHeartRateInputs;
}) {
  const t = useTranslations("maxHeartRateCalculator.page");
  const lang = useLang();
  const prefix = localePrefix(lang);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ageText, setAgeText] = useState(initialInputs.age);
  const [sex, setSex] = useState<MaxHrSex>(initialInputs.sex);
  const [formula, setFormula] = useState<MaxHrFormulaChoice>(
    initialInputs.formula,
  );
  const [measuredText, setMeasuredText] = useState(initialInputs.measured);
  const [referenceSource, setReferenceSource] = useState<
    "measured" | "observed"
  >(initialInputs.measuredSource ?? "measured");
  const [example, setExample] = useState(initialInputs.example);
  const [mode, setMode] = useState<"manual" | "file">("manual");
  const [fileGeneration, setFileGeneration] = useState(0);
  const [observed, setObserved] = useState<number | null>(
    initialInputs.measuredSource === "observed"
      ? parseMeasuredMaxHr(initialInputs.measured)
      : null,
  );
  const [filename, setFilename] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);

  const age = useMemo(() => parseMaxHrAge(ageText), [ageText]);
  const ageInvalid = ageText.trim() !== "" && age == null;
  const measuredParsed = useMemo(
    () =>
      measuredText.trim() === "" ? null : parseMeasuredMaxHr(measuredText),
    [measuredText],
  );
  const measuredInvalid = measuredText.trim() !== "" && measuredParsed == null;

  useEffect(() => {
    const next = new URLSearchParams();
    const hasAge = age != null;
    const hasMeasured = measuredParsed != null;
    if (hasAge || hasMeasured) {
      if (example) next.set("example", "1");
      if (hasAge) next.set("age", ageText.trim());
      if (sex !== "unspecified") next.set("sex", sex);
      if (formula !== "default") next.set("formula", formula);
      if (hasMeasured) {
        next.set("measured", measuredText.trim());
        if (referenceSource === "observed") next.set("source", "observed");
      }
    }
    const url = new URL(window.location.href);
    url.search = next.toString();
    const nextHref = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextHref !== current) {
      window.history.replaceState(window.history.state, "", nextHref);
    }
  }, [
    age,
    ageText,
    example,
    formula,
    measuredParsed,
    measuredText,
    sex,
    referenceSource,
  ]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const resolvedFormula = useMemo(() => {
    if (age == null) return null;
    return formula === "default" ? recommendedMaxHrFormula(age, sex) : formula;
  }, [age, formula, sex]);

  const formulaRaw =
    age != null && resolvedFormula != null
      ? estimateMaxHr(resolvedFormula, age)
      : null;
  const formulaBpm = formulaRaw == null ? null : roundBpm(formulaRaw);
  const measuredBpm = measuredParsed == null ? null : roundBpm(measuredParsed);
  const activeBpm = measuredBpm ?? formulaBpm;
  const usingMeasured = measuredBpm != null;
  const usingObserved = usingMeasured && referenceSource === "observed";
  const displayedPeak = observed ?? (usingObserved ? measuredBpm : null);
  const seeBand =
    !usingMeasured && resolvedFormula === "tanaka" && age != null
      ? tanakaSeeBand(age)
      : null;
  const comparison =
    observed != null && activeBpm != null
      ? compareObservedPeak(observed, activeBpm)
      : null;

  useInstantToolAnalytics(
    "max_heart_rate_calculator",
    "calculate_hrmax",
    activeBpm != null,
  );

  const comparisons = useMemo(() => {
    if (age == null) return [];
    return (Object.keys(FORMULA_SHORT) as MaxHrFormulaKey[]).map((key) => {
      const raw = estimateMaxHr(key, age);
      return {
        key,
        bpm: raw == null ? null : roundBpm(raw),
        isApplicable: key !== "gulati" || sex === "female",
        isSelected: resolvedFormula === key,
      };
    });
  }, [age, resolvedFormula, sex]);

  const chartDomain = useMemo(() => {
    const values = comparisons.flatMap((row) =>
      row.bpm == null ? [] : [row.bpm],
    );
    if (values.length === 0) return [0, 100] as const;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(3, Math.ceil((max - min) * 0.25));
    return [Math.max(0, min - pad), max + pad] as const;
  }, [comparisons]);

  const zones = activeBpm == null ? null : calculateMhrZones(activeBpm);
  const zonesHref =
    activeBpm == null ? null : heartRateZonesMaxHrHref(prefix, activeBpm);

  function onPrint() {
    if (activeBpm == null) return;
    trackToolEvent("tool_result_copied", "max_heart_rate_calculator", {
      action: "print_result_card",
    });
    window.print();
  }

  async function onShare() {
    if (activeBpm == null) return;
    setShareError(false);
    const url = new URL(window.location.href);
    url.hash = "result";
    const href = url.toString();
    const nextHref = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextHref !== current) {
      window.history.replaceState(window.history.state, "", nextHref);
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: t("scorecard.summaryTitle"),
          url: href,
        });
        trackToolEvent("tool_result_copied", "max_heart_rate_calculator", {
          action: "native_share",
        });
        return;
      }
      await navigator.clipboard.writeText(href);
      trackToolEvent("tool_result_copied", "max_heart_rate_calculator", {
        action: "copy_link",
      });
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareError(true);
      trackToolEvent("tool_failed", "max_heart_rate_calculator", {
        action: "copy_link",
        error_code: "clipboard_failed",
      });
    }
  }

  const protocolLine = usingMeasured
    ? t(usingObserved ? "scorecard.observedLabel" : "scorecard.measuredSource")
    : resolvedFormula
      ? formula === "default"
        ? t("scorecard.defaultProtocol", {
            name: FORMULA_SHORT[resolvedFormula],
          })
        : FORMULA_SHORT[resolvedFormula]
      : t("scorecard.empty");

  const showSources =
    formulaBpm != null || measuredBpm != null || observed != null;

  return (
    <>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <div className={styles.boardHead}>
            <h2 className={styles.boardLabel}>{t("title")}</h2>
            <p className={styles.boardLead}>{t("cardSubtitle")}</p>
          </div>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              document.getElementById("result")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
          >
            <InputSource
              value={mode}
              label={t("file.legend")}
              manual={t("file.manual")}
              file={t("file.upload")}
              onValueChange={(next) => {
                setFileGeneration((current) => current + 1);
                setMode(next);
              }}
            />

            {mode === "manual" ? (
              <div className={styles.inputs}>
                <div className={styles.field}>
                  <Label htmlFor="max-heart-rate-age">{t("ageLabel")}</Label>
                  <Input
                    id="max-heart-rate-age"
                    name="age"
                    className={styles.input}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-describedby="max-heart-rate-age-hint"
                    aria-invalid={ageInvalid}
                    value={ageText}
                    placeholder={t("agePlaceholder")}
                    onChange={(event) => {
                      setExample(false);
                      setAgeText(
                        event.target.value.replace(/[^\d.]/g, "").slice(0, 6),
                      );
                    }}
                  />
                  <p id="max-heart-rate-age-hint" className={styles.hint}>
                    {t("ageHint")}
                  </p>
                  {ageInvalid ? (
                    <p className={styles.error} role="alert">
                      {t("ageError")}
                    </p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <Label htmlFor="max-hr-measured">
                    {t(
                      referenceSource === "observed"
                        ? "scorecard.observedLabel"
                        : "measuredField.label",
                    )}
                    <span className={styles.optional}>
                      {t("measuredField.optional")}
                    </span>
                  </Label>
                  <Input
                    id="max-hr-measured"
                    name="measured"
                    className={styles.input}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-describedby="max-hr-measured-hint"
                    aria-invalid={measuredInvalid}
                    value={measuredText}
                    placeholder={t("measuredField.placeholder")}
                    onChange={(event) => {
                      setExample(false);
                      setReferenceSource("measured");
                      setMeasuredText(
                        event.target.value.replace(/[^\d.]/g, "").slice(0, 6),
                      );
                    }}
                  />
                  <p id="max-hr-measured-hint" className={styles.hint}>
                    {t(
                      referenceSource === "observed"
                        ? "scorecard.observedNote"
                        : "measuredField.hint",
                    )}
                  </p>
                  {measuredInvalid ? (
                    <p className={styles.error} role="alert">
                      {t("measuredField.error")}
                    </p>
                  ) : null}
                </div>
                <fieldset className={styles.field}>
                  <legend className={styles.fieldLabel} id="max-hr-sex-label">
                    {t("sexLabel")}
                  </legend>
                  <RadioGroup
                    value={sex}
                    onValueChange={(next) => setSex(next as typeof sex)}
                    orientation="horizontal"
                    className={styles.choices}
                    aria-labelledby="max-hr-sex-label"
                  >
                    {(["unspecified", "male", "female"] as const).map(
                      (option) => (
                        <label key={option}>
                          <RadioGroupItem value={option} />
                          {t(`sexOptions.${option}`)}
                        </label>
                      ),
                    )}
                  </RadioGroup>
                  <p className={styles.hint}>{t("sexHint")}</p>
                </fieldset>
              </div>
            ) : (
              <MaxHrFileInput
                generation={fileGeneration}
                onPeak={(peak, name) => {
                  setObserved(peak);
                  setFilename(name);
                }}
                onClear={() => {
                  setObserved(null);
                  setFilename("");
                }}
              />
            )}

            <div className={styles.actions}>
              <button type="submit" className={styles.submit}>
                {t("calculateButton")}
              </button>
              <button
                type="button"
                className={styles.exampleButton}
                onClick={() => {
                  setExample(true);
                  setAgeText("40");
                  setSex("unspecified");
                  setFormula("default");
                  setMeasuredText("");
                  setReferenceSource("measured");
                  setMode("manual");
                }}
              >
                {t("exampleButton")}
              </button>
            </div>
          </form>
        </section>
      </div>

      <div className={styles.posterWrap}>
        <section id="result" aria-live="polite" className={styles.poster}>
          <div className={styles.posterSheet}>
            <div className={styles.posterBrand}>
              <h2 className={styles.posterHeading}>
                {t("scorecard.summaryTitle")}
              </h2>
              <p className={styles.posterMark}>Trainingload.ai</p>
            </div>
            <div className={styles.posterMain}>
              <div>
                <p className={styles.posterEyebrow}>{t("scorecard.eyebrow")}</p>
                <p
                  className={styles.posterWatts}
                  data-wide={activeBpm != null && activeBpm >= 100}
                >
                  <span className={styles.posterNumber}>
                    {activeBpm ?? "—"}
                  </span>
                  {activeBpm != null ? (
                    <span className={styles.posterUnit}>bpm</span>
                  ) : null}
                </p>
                <p className={styles.posterProtocol}>{protocolLine}</p>
                {example && activeBpm != null ? (
                  <p className={styles.posterHint}>
                    {t("scorecard.exampleBadge")}
                  </p>
                ) : null}
                {usingMeasured ? (
                  <p className={styles.posterHint}>
                    {t(
                      usingObserved
                        ? "scorecard.observedNote"
                        : "scorecard.measuredNote",
                    )}
                  </p>
                ) : resolvedFormula ? (
                  <p className={styles.posterHint}>
                    {t(`formulas.${resolvedFormula}.equation`)}
                  </p>
                ) : null}
              </div>
              <div className={styles.pride}>
                <p className={styles.posterEyebrow}>
                  {displayedPeak != null
                    ? t("scorecard.observedLabel")
                    : seeBand
                      ? t("scorecard.seeLabel")
                      : usingMeasured
                        ? t("scorecard.measuredSource")
                        : t("scorecard.formulaNoteLabel")}
                </p>
                <p
                  className={styles.prideValue}
                  data-wide={seeBand != null || displayedPeak != null}
                >
                  {displayedPeak != null
                    ? displayedPeak
                    : seeBand
                      ? `${seeBand.min}–${seeBand.max}`
                      : usingMeasured
                        ? t("scorecard.measuredValue")
                        : "—"}
                </p>
                {displayedPeak != null ? (
                  <p className={styles.posterHint}>
                    {t("scorecard.observedNote")}
                  </p>
                ) : seeBand ? (
                  <p className={styles.posterHint}>
                    {t("scorecard.seeNote")}{" "}
                    <a href="https://pubmed.ncbi.nlm.nih.gov/11153730/">
                      {t("scorecard.seeLink")}
                    </a>
                  </p>
                ) : activeBpm != null && !usingMeasured ? (
                  <p className={styles.posterHint}>
                    {t("scorecard.formulaNote")}
                  </p>
                ) : null}
              </div>
            </div>
            {showSources ? (
              <ul className={styles.sourceRow}>
                <li>
                  <span>{t("scorecard.formulaColumn")}</span>
                  <strong>{formulaBpm ?? "—"}</strong>
                </li>
                <li>
                  <span>{t("scorecard.measuredColumn")}</span>
                  <strong>{usingObserved ? "—" : (measuredBpm ?? "—")}</strong>
                </li>
                <li>
                  <span>{t("scorecard.observedLabel")}</span>
                  <strong>{displayedPeak ?? "—"}</strong>
                </li>
              </ul>
            ) : null}
            {filename ? (
              <p className={styles.posterHint}>
                {t("file.fromFile", { filename })}
              </p>
            ) : null}
            {comparison === "higher" ? (
              <p className={styles.posterHint}>
                {t("scorecard.observedHigher")}
              </p>
            ) : null}
            {comparison === "lower" ? (
              <p className={styles.posterHint}>
                {t("scorecard.observedLower")}
              </p>
            ) : null}
            {observed != null ? (
              <UseObservedPeakButton
                disabled={usingObserved && measuredBpm === observed}
                onClick={() => {
                  setExample(false);
                  setMeasuredText(String(observed));
                  setReferenceSource("observed");
                  setMode("manual");
                }}
              />
            ) : null}
            <div className={styles.posterZones}>
              <div className={styles.zoneHeading}>
                <h3>{t("scorecard.zonesTitle")}</h3>
                <span>bpm</span>
              </div>
              <ol className={styles.zoneStrip}>
                {(
                  zones ?? [
                    {
                      key: "z1",
                      percentLabel: "50%–60%",
                      bpmMin: null,
                      bpmMax: null,
                    },
                    {
                      key: "z2",
                      percentLabel: "60%–70%",
                      bpmMin: null,
                      bpmMax: null,
                    },
                    {
                      key: "z3",
                      percentLabel: "70%–80%",
                      bpmMin: null,
                      bpmMax: null,
                    },
                    {
                      key: "z4",
                      percentLabel: "80%–90%",
                      bpmMin: null,
                      bpmMax: null,
                    },
                    {
                      key: "z5",
                      percentLabel: "90%–100%",
                      bpmMin: null,
                      bpmMax: null,
                    },
                  ]
                ).map((zone) => (
                  <li
                    key={zone.key}
                    className={styles.zoneCell}
                    data-zone={zone.key}
                  >
                    <span className={styles.zoneSwatch}>
                      {zone.key.toUpperCase()}
                    </span>
                    <span className={styles.zoneName}>
                      {t(`zones.${zone.key}.label`)}
                    </span>
                    <span className={styles.zoneFigure}>
                      {zone.bpmMin == null || zone.bpmMax == null
                        ? "—"
                        : `${zone.bpmMin}–${zone.bpmMax}`}
                    </span>
                    <span className={styles.zonePercent}>
                      {zone.percentLabel}
                    </span>
                  </li>
                ))}
              </ol>
              <p className={styles.zoneCaption}>{t("scorecard.zonesWhy")}</p>
            </div>
          </div>
        </section>
        <div className={`${styles.posterActions} hrmax-share-actions`}>
          <Select
            value={formula}
            onValueChange={(value) => {
              setFormula(isMaxHrFormulaKey(value) ? value : "default");
            }}
          >
            <SelectTrigger
              id="max-hr-formula"
              aria-label={t("formulaField.label")}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-10",
                styles.actionControl,
              )}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="default">
                {t("formulaField.defaultOption")}
              </SelectItem>
              {(Object.keys(FORMULA_SHORT) as MaxHrFormulaKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {FORMULA_SHORT[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {zonesHref ? (
            <TrackedLink
              href={zonesHref}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-10",
                styles.actionControl,
              )}
              eventName="related_tool_clicked"
              eventProperties={{ href: zonesHref, location: "hrmax_scorecard" }}
            >
              {t("scorecard.viewZones")}
            </TrackedLink>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={cn("h-10", styles.actionControl)}
              disabled
            >
              {t("scorecard.viewZones")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={cn("h-10", styles.actionControl)}
            disabled={activeBpm == null}
            onClick={onPrint}
          >
            <Printer className="size-3.5" aria-hidden />
            {t("scorecard.print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={cn("h-10", styles.actionControl)}
            disabled={activeBpm == null}
            onClick={() => void onShare()}
          >
            <Share2 className="size-3.5" aria-hidden />
            {copied ? t("scorecard.copied") : t("scorecard.share")}
          </Button>
        </div>
        {age != null && resolvedFormula ? (
          <p className={styles.hint}>
            {t("formulaField.defaultHint", {
              name: FORMULA_SHORT[recommendedMaxHrFormula(age, sex)],
            })}
          </p>
        ) : null}
        {shareError ? (
          <p role="alert" className={styles.error}>
            {t("scorecard.shareError")}
          </p>
        ) : null}
        {activeBpm != null ? (
          <p className={styles.disclaimer}>{t("medicalDisclaimer")}</p>
        ) : null}
      </div>

      {comparisons.length > 0 ? (
        <section
          className={styles.section}
          aria-labelledby="hrmax-compare-title"
        >
          <div className={styles.sectionHeading}>
            <h2 id="hrmax-compare-title" className={styles.sectionTitle}>
              {t("formulasTable.title")}
            </h2>
            <p className={styles.sectionBody}>{t("formulasTable.subtitle")}</p>
          </div>
          <div className={styles.chartBlock}>
            <FormulaComparisonChart
              data={comparisons.flatMap((row) =>
                row.bpm == null
                  ? []
                  : [
                      {
                        key: row.key,
                        name: row.isApplicable
                          ? FORMULA_SHORT[row.key]
                          : `${FORMULA_SHORT[row.key]}*`,
                        bpm: row.bpm,
                        isRecommended: row.isSelected,
                        isApplicable: row.isApplicable,
                      },
                    ],
              )}
              domain={chartDomain}
              recommendedBpm={formulaBpm}
              markerLabel={
                formulaBpm == null
                  ? ""
                  : t("formulasTable.markerLabel", { bpm: formulaBpm })
              }
              chartTitle={t("formulasTable.chartTitle")}
              chartHint={t("formulasTable.chartHint")}
              sexSpecificNote={
                sex === "female"
                  ? undefined
                  : t("formulasTable.sexSpecificNote")
              }
            />
            <div className={styles.formulaRows}>
              {comparisons.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className={styles.formulaRow}
                  data-active={row.isSelected}
                  onClick={() => setFormula(row.key)}
                >
                  <span>
                    <strong>{t(`formulas.${row.key}.name`)}</strong>
                    <span className={styles.equation}>
                      {t(`formulas.${row.key}.equation`)}
                    </span>
                  </span>
                  <span className={styles.formulaBpm}>
                    {row.bpm == null ? "—" : `${row.bpm} bpm`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {methods}
    </>
  );
}
