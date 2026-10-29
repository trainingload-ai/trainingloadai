"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import {
  calculateTss,
  durationHoursFromParts,
  formatIntensityFactor,
  formatTssScore,
  parseNonNegativeNumber,
  parsePositiveNumber,
  type PowerKind,
  type TssResult,
} from "@/lib/tss";
import {
  EXAMPLE_TSS_INPUTS,
  tssSearchParams,
  type TssInputs,
} from "./share-inputs";
import layout from "@/components/calculators/tool-page.module.css";
import styles from "./tss-calculator.module.css";

function calculateFromInputs(inputs: TssInputs): TssResult | null {
  const hours = parseNonNegativeNumber(inputs.hours || "0");
  const minutes = parseNonNegativeNumber(inputs.minutes || "0");
  const powerWatts = parsePositiveNumber(inputs.power);
  const ftpWatts = parsePositiveNumber(inputs.ftp);
  const durationHours =
    hours != null && minutes != null
      ? durationHoursFromParts(hours, minutes)
      : null;
  if (durationHours == null || powerWatts == null || ftpWatts == null) {
    return null;
  }
  const value = calculateTss({
    durationHours,
    powerWatts,
    ftpWatts,
    powerKind: inputs.kind,
  });
  return value && Number.isFinite(value.tss) ? value : null;
}

export function TssCalculatorClient({
  hero,
  initialInputs,
}: {
  hero: ReactNode;
  initialInputs: TssInputs;
}) {
  const t = useTranslations("tssCalculator.client");
  const common = useTranslations("commonLinks");
  const locale = useLocale();
  const [inputs, setInputs] = useState(initialInputs);
  const [resultInputs, setResultInputs] = useState(initialInputs);
  const [result, setResult] = useState<TssResult | null>(() =>
    calculateFromInputs(initialInputs),
  );
  const [showError, setShowError] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const change = (key: keyof TssInputs, value: string) => {
    setInputs((current) => ({ ...current, [key]: value }));
    setResult(null);
    setShowError(false);
    setShareStatus("");
  };
  useInstantToolAnalytics("tss_calculator", "calculate_tss", Boolean(result));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextResult = calculateFromInputs(inputs);
    if (!nextResult) {
      setResult(null);
      setShowError(true);
      trackToolEvent("tool_failed", "tss_calculator", {
        action: "calculate_tss",
      });
      return;
    }
    setResultInputs(inputs);
    setResult(nextResult);
    setShowError(false);
    setShareStatus("");
    const search = tssSearchParams(inputs).toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?${search}#result`,
    );
    requestAnimationFrame(() => {
      document.getElementById("result")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function share() {
    const url = new URL(window.location.href);
    url.search = tssSearchParams(resultInputs).toString();
    url.hash = "result";
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareStatus(t("report.copied"));
      trackToolEvent("tool_result_copied", "tss_calculator", {
        action: "share_result",
      });
    } catch {
      setShareStatus(t("report.copyError"));
    }
  }
  return (
    <div className={styles.calculator}>
      <div className={layout.split}>
        {hero}
        <form
          id="calculator"
          className={layout.form}
          aria-label={t("panel.title")}
          onSubmit={submit}
        >
          <div className={styles.formHeader}>
            <h2>{t("panel.title")}</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setInputs(EXAMPLE_TSS_INPUTS);
                setResultInputs(EXAMPLE_TSS_INPUTS);
                setResult(calculateFromInputs(EXAMPLE_TSS_INPUTS));
                setShowError(false);
                setShareStatus("");
              }}
            >
              {t("report.example")}
            </Button>
          </div>
          <FieldDescription>{t("panel.subtitle")}</FieldDescription>
          <FieldGroup className={styles.formFields}>
            <FieldSet className={styles.fieldSet}>
              <FieldLegend variant="label">
                {t("inputs.duration.label")}
              </FieldLegend>
              <div className={styles.fields}>
                {(["hours", "minutes"] as const).map((key) => (
                  <Field key={key} data-invalid={showError || undefined}>
                    <FieldLabel htmlFor={`tss-${key}`}>
                      {t(`inputs.duration.${key}`)}
                    </FieldLabel>
                    <Input
                      id={`tss-${key}`}
                      inputMode="numeric"
                      aria-invalid={showError || undefined}
                      value={inputs[key]}
                      placeholder={key === "hours" ? "1" : "30"}
                      onChange={(event) => change(key, event.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </FieldSet>
            <FieldSet className={styles.fieldSet}>
              <FieldLegend variant="label">
                {t("inputs.powerKind.label")}
              </FieldLegend>
              <ToggleGroup
                type="single"
                variant="outline"
                value={inputs.kind}
                onValueChange={(value) => {
                  if (value) change("kind", value as PowerKind);
                }}
                aria-label={t("inputs.powerKind.label")}
                className={styles.powerToggle}
              >
                {(["normalized", "average"] as const).map((key) => (
                  <ToggleGroupItem key={key} value={key}>
                    {t(`inputs.powerKind.options.${key}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                {t(`inputs.powerKind.hints.${inputs.kind}`)}
              </FieldDescription>
            </FieldSet>
            <div className={styles.fields}>
              <Field data-invalid={showError || undefined}>
                <FieldLabel htmlFor="tss-power">
                  {t(`inputs.power.label.${inputs.kind}`)}
                </FieldLabel>
                <Input
                  id="tss-power"
                  inputMode="decimal"
                  aria-invalid={showError || undefined}
                  value={inputs.power}
                  placeholder="200"
                  onChange={(event) => change("power", event.target.value)}
                />
              </Field>
              <Field data-invalid={showError || undefined}>
                <FieldLabel htmlFor="tss-ftp">
                  {t("inputs.ftp.label")}
                </FieldLabel>
                <Input
                  id="tss-ftp"
                  inputMode="decimal"
                  aria-invalid={showError || undefined}
                  value={inputs.ftp}
                  placeholder="250"
                  onChange={(event) => change("ftp", event.target.value)}
                />
              </Field>
            </div>
            <FieldDescription>{t("inputs.ftp.hint")}</FieldDescription>
            {showError ? <FieldError>{t("inputs.invalid")}</FieldError> : null}
            <Button type="submit" size="lg" className={styles.calculateButton}>
              {t("panel.calculate")}
            </Button>
            <FieldDescription>{t("panel.note")}</FieldDescription>
          </FieldGroup>
        </form>
      </div>
      <section
        id="result"
        className={styles.result}
        aria-label={t("report.title")}
        aria-live="polite"
      >
        <article className={styles.report}>
          <div className={styles.reportHeader}>
            <span>{t("report.title")}</span>
            <b>Trainingload.ai</b>
          </div>
          <div className={styles.score}>
            <div>
              <p>{t("result.tss")}</p>
              <strong>{result ? formatTssScore(result.tss) : "—"}</strong>
              <p>
                {result ? t(`report.${resultInputs.kind}`) : t("report.empty")}
              </p>
            </div>
            <div className={styles.secondary}>
              <p>{t("result.if")} · IF</p>
              <b>
                {result ? formatIntensityFactor(result.intensityFactor) : "—"}
              </b>
              <p>{t("report.duration")}</p>
              <b>
                {result ? Math.round(result.durationHours * 60) : "—"}{" "}
                <small>{t("report.minutes")}</small>
              </b>
            </div>
          </div>
          <div className={styles.reportFooter}>
            {result ? (
              <>
                <p>
                  {Number(resultInputs.power)} W / {Number(resultInputs.ftp)} W
                  = {formatIntensityFactor(result.intensityFactor)} IF
                </p>
                <p>{t("result.formula")}</p>
                {resultInputs.kind === "average" ? (
                  <p>{t("report.averageNote")}</p>
                ) : null}
                {result.intensityFactor > 1.3 ? (
                  <p>{t("warnings.highIf")}</p>
                ) : null}
                <p>{t("result.equivalents")}</p>
              </>
            ) : (
              <p>{t("result.subtitleEmpty")}</p>
            )}
          </div>
        </article>
        <div className={styles.actions}>
          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={
              <a href={`${localePrefix(locale)}/training-load-calculator`} />
            }
          >
            {common("trainingLoadCalculatorAction")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => window.print()}
            disabled={!result}
          >
            <Printer data-icon="inline-start" aria-hidden />
            {t("report.print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void share()}
            disabled={!result}
          >
            <Share2 data-icon="inline-start" aria-hidden />
            {t("report.share")}
          </Button>
        </div>
        <p role="status" className={styles.status}>
          {shareStatus}
        </p>
      </section>
    </div>
  );
}
