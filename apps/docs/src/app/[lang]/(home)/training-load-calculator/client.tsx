"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Printer, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import {
  EXAMPLE_PMC_STARTING_ATL,
  EXAMPLE_PMC_STARTING_CTL,
  MAX_PMC_DAYS,
  MIN_PMC_DAYS,
  examplePmcWeek,
  formatPmcValue,
  projectPmc,
  type PmcProjection,
} from "@/lib/pmc-ewma";
import { parseNonNegativeNumber } from "@/lib/tss";
import type { TrainingLoadInputs } from "./share-inputs";
import { LoadTrendChart } from "./load-trend-chart";
import styles from "./training-load-calculator.module.css";

function formatSigned(value: number): string {
  const text = formatPmcValue(value);
  if (text === "—" || value <= 0) return text;
  return `+${text}`;
}

export function TrainingLoadCalculatorClient({
  hero,
  initialInputs,
}: {
  hero: ReactNode;
  initialInputs: TrainingLoadInputs;
}) {
  const t = useTranslations("trainingLoadCalculator.page");
  const [startingCtlText, setStartingCtlText] = useState(initialInputs.ctl);
  const [startingAtlText, setStartingAtlText] = useState(initialInputs.atl);
  const [dailyTssText, setDailyTssText] = useState(initialInputs.tss);
  const [copied, setCopied] = useState(false);

  const startingCtl = useMemo(
    () => parseNonNegativeNumber(startingCtlText),
    [startingCtlText],
  );
  const startingAtl = useMemo(
    () => parseNonNegativeNumber(startingAtlText),
    [startingAtlText],
  );
  const dailyTss = useMemo(
    () => dailyTssText.map((value) => parseNonNegativeNumber(value)),
    [dailyTssText],
  );

  const projection = useMemo(() => {
    if (startingCtl == null || startingAtl == null) return null;
    if (dailyTss.some((value) => value == null)) return null;
    return projectPmc({
      startingCtl,
      startingAtl,
      dailyTss: dailyTss as number[],
    });
  }, [dailyTss, startingAtl, startingCtl]);

  useInstantToolAnalytics(
    "training_load_calculator",
    "calculate_training_load",
    Boolean(projection),
  );

  const resetExample = () => {
    setStartingCtlText(String(EXAMPLE_PMC_STARTING_CTL));
    setStartingAtlText(String(EXAMPLE_PMC_STARTING_ATL));
    setDailyTssText(examplePmcWeek().map(String));
  };

  const addDay = () => {
    setDailyTssText((current) =>
      current.length >= MAX_PMC_DAYS ? current : [...current, "0"],
    );
  };

  const removeDay = () => {
    setDailyTssText((current) =>
      current.length <= MIN_PMC_DAYS ? current : current.slice(0, -1),
    );
  };

  const updateDay = (index: number, value: string) => {
    setDailyTssText((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  };

  return (
    <>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <div className={styles.boardHead}>
            <h2 className={styles.boardLabel}>{t("board.title")}</h2>
            <div className={styles.boardActions}>
              <button
                type="button"
                className={styles.textButton}
                onClick={resetExample}
              >
                {t("board.reset")}
              </button>
            </div>
          </div>
          <p className={styles.boardLead}>{t("board.lead")}</p>
          <ol className={styles.stepList}>
            {(["start", "days", "read"] as const).map((step, index) => (
              <li key={step} className={styles.stepItem}>
                <span className={styles.stepIndex}>{index + 1}</span>
                <p>
                  <strong>{t(`howTo.steps.${step}.title`)}</strong>{" "}
                  {t(`howTo.steps.${step}.body`)}
                </p>
              </li>
            ))}
          </ol>
          <div className={styles.seedGrid}>
            <label className={styles.field}>
              <span>{t("board.startingCtl")}</span>
              <input
                className={styles.input}
                inputMode="decimal"
                maxLength={32}
                autoComplete="off"
                value={startingCtlText}
                aria-invalid={startingCtl == null}
                onChange={(event) => setStartingCtlText(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>{t("board.startingAtl")}</span>
              <input
                className={styles.input}
                inputMode="decimal"
                maxLength={32}
                autoComplete="off"
                value={startingAtlText}
                aria-invalid={startingAtl == null}
                onChange={(event) => setStartingAtlText(event.target.value)}
              />
            </label>
          </div>
          <p className={styles.inputHint}>{t("board.seedHint")}</p>
          <div className={styles.dayTableWrap}>
            <table className={styles.dayTable}>
              <caption className="sr-only">{t("board.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("board.day")}</th>
                  <th scope="col">{t("board.tss")}</th>
                  <th scope="col">{t("scorecard.ctl")}</th>
                  <th scope="col">{t("scorecard.atl")}</th>
                  <th scope="col">{t("scorecard.tsb")}</th>
                </tr>
              </thead>
              <tbody>
                {dailyTssText.map((value, index) => {
                  const point = projection?.days[index];
                  return (
                    <tr key={index}>
                      <th scope="row">{t("board.dayN", { day: index + 1 })}</th>
                      <td>
                        <input
                          className={`${styles.input} ${styles.dayInput}`}
                          inputMode="decimal"
                          maxLength={32}
                          autoComplete="off"
                          value={value}
                          aria-invalid={dailyTss[index] == null}
                          aria-label={t("board.tssAria", { day: index + 1 })}
                          onChange={(event) =>
                            updateDay(index, event.target.value)
                          }
                        />
                      </td>
                      <td>{point ? formatPmcValue(point.ctl) : "—"}</td>
                      <td>{point ? formatPmcValue(point.atl) : "—"}</td>
                      <td>{point ? formatSigned(point.tsb) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.dayActions}>
            <span>{t("board.period", { days: dailyTssText.length })}</span>
            <div className={styles.boardActions}>
              <button
                type="button"
                className={styles.textButton}
                onClick={addDay}
                disabled={dailyTssText.length >= MAX_PMC_DAYS}
              >
                {t("board.addDay")}
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={removeDay}
                disabled={dailyTssText.length <= MIN_PMC_DAYS}
              >
                {t("board.removeDay")}
              </button>
            </div>
          </div>
          {!projection && (
            <p role="status" className={styles.inputError}>
              {t("board.invalid")}
            </p>
          )}
        </section>
      </div>
      <Scorecard
        copied={copied}
        dailyTssText={dailyTssText}
        projection={projection}
        setCopied={setCopied}
        startingAtlText={startingAtlText}
        startingCtlText={startingCtlText}
      />
    </>
  );
}

function Scorecard({
  projection,
  dailyTssText,
  startingCtlText,
  startingAtlText,
  copied,
  setCopied,
}: {
  projection: PmcProjection | null;
  dailyTssText: string[];
  startingCtlText: string;
  startingAtlText: string;
  copied: boolean;
  setCopied: (value: boolean) => void;
}) {
  const t = useTranslations("trainingLoadCalculator.page.scorecard");
  const tBand = useTranslations("trainingLoadCalculator.client.interpretation");

  const shareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.hash = "result";
    url.searchParams.set("ctl", startingCtlText.trim());
    url.searchParams.set("atl", startingAtlText.trim());
    url.searchParams.set(
      "tss",
      dailyTssText.map((value) => value.trim()).join(","),
    );
    return url.toString();
  }, [dailyTssText, startingAtlText, startingCtlText]);

  const onShare = async () => {
    const url = shareUrl();
    window.history.replaceState(window.history.state, "", url);
    try {
      if (navigator.share) {
        await navigator.share({ title: t("summaryTitle"), url });
        trackToolEvent("tool_result_copied", "training_load_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      trackToolEvent("tool_result_copied", "training_load_calculator", {
        action: "copy_share_link",
      });
      setCopied(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "training_load_calculator", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      setCopied(false);
      return;
    }
    window.setTimeout(() => setCopied(false), 1600);
  };

  const onPrint = () => {
    trackToolEvent("tool_result_copied", "training_load_calculator", {
      action: "print_result_card",
    });
    window.print();
  };

  const final = projection?.final;
  const band = projection?.tsbBand;

  return (
    <div className={styles.posterWrap}>
      <section id="result" aria-live="polite" className={styles.poster}>
        <div className={styles.posterSheet}>
          <div className={styles.posterBrand}>
            <h2 className={styles.posterHeading}>{t("summaryTitle")}</h2>
            <p className={styles.posterMark}>{t("brand")}</p>
          </div>
          <p className={styles.period}>
            {t("period", { days: dailyTssText.length })}
          </p>
          <div className={styles.metrics}>
            {(
              [
                ["ctl", final?.ctl, t("ctlHint")],
                ["atl", final?.atl, t("atlHint")],
                ["tsb", final?.tsb, t("tsbHint")],
              ] as const
            ).map(([key, value, hint]) => (
              <div key={key} className={styles.metric} data-metric={key}>
                <p className={styles.metricLabel}>{t(key)}</p>
                <p className={styles.metricValue}>
                  {typeof value === "number"
                    ? key === "tsb"
                      ? formatSigned(value)
                      : formatPmcValue(value)
                    : "—"}
                </p>
                <p className={styles.metricHint}>{hint}</p>
              </div>
            ))}
          </div>
          <div className={styles.posterMeta}>
            {band ? (
              <p className={styles.band} data-band={band}>
                {tBand(`${band}.label`)}
              </p>
            ) : (
              <p className={styles.posterEmpty}>{t("empty")}</p>
            )}
            {projection ? (
              <p className={styles.delta}>
                {t("delta", {
                  from: formatPmcValue(projection.startingCtl),
                  to: formatPmcValue(projection.final.ctl),
                  delta: formatSigned(projection.ctlDelta),
                })}
              </p>
            ) : null}
          </div>
          {projection ? <LoadTrendChart projection={projection} /> : null}
          {projection ? (
            <div className={styles.weekSection}>
              <p className={styles.weekTitle}>{t("week")}</p>
              <ol className={styles.week} aria-label={t("week")}>
                {projection.days.map((day) => (
                  <li key={day.dayIndex}>
                    <span>{t("dayN", { day: day.dayIndex + 1 })}</span>
                    <strong>
                      {formatPmcValue(day.tss).replace(/\.0$/, "")}
                    </strong>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {band ? (
            <p className={styles.disclaimer}>{tBand(`${band}.body`)}</p>
          ) : null}
          <p className={styles.disclaimer}>{t("disclaimer")}</p>
        </div>
      </section>
      <div className={`${styles.posterActions} tl-share-actions`}>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!projection}
          onClick={onPrint}
        >
          <Printer className="size-3.5" aria-hidden />
          {t("print")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!projection}
          onClick={() => void onShare()}
        >
          <Share2 className="size-3.5" aria-hidden />
          {copied ? t("copied") : t("copyLink")}
        </Button>
      </div>
    </div>
  );
}
