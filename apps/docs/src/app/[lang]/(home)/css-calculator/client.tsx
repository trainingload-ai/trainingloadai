"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { Share2, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import {
  METERS_PER_YARD,
  calculateCss,
  formatPaceClock,
  formatSpeedMps,
  isUnusualCssPace,
  parsePositiveNumber,
  timePartsToSeconds,
  type PoolUnit,
  type CssSwim,
} from "@/lib/css";
import styles from "./css-calculator.module.css";

const CssFileInput = dynamic(() =>
  import("./file-input").then((module) => module.CssFileInput),
);
const CssFitChart = dynamic(
  () => import("./fit-chart").then((module) => module.CssFitChart),
  { loading: () => <div className={styles.chartLoading} /> },
);

const ZONE_IDS = ["easy", "aerobic", "threshold", "vo2", "speed"] as const;

const QUERY_KEYS = [
  "pool",
  "d1",
  "m1",
  "s1",
  "d2",
  "m2",
  "s2",
  "example",
] as const;

type SwimDraft = {
  distance: string;
  minutes: string;
  seconds: string;
};

const EXAMPLE_METERS: [SwimDraft, SwimDraft] = [
  { distance: "400", minutes: "6", seconds: "0" },
  { distance: "200", minutes: "2", seconds: "40" },
];

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

function parseClockPart(value: string, max: number | null): number | null {
  const raw = value.trim();
  if (!raw) return 0;
  if (!(max == null ? /^\d+$/ : /^\d+(?:\.\d{1,3})?$/).test(raw)) return null;
  const n = Number(raw);
  if (max != null && n >= 60) return null;
  return n;
}

function formatSwimClock(totalSeconds: number) {
  return formatPaceClock(totalSeconds);
}

function formatOffset(start: number, end: number) {
  if (start === end) return "0";
  const fmt = (value: number) => (value > 0 ? `+${value}` : String(value));
  return `${fmt(start)}–${fmt(end)}`;
}

function readPool(value: string | null): PoolUnit | null {
  if (value === "meters" || value === "yards") return value;
  return null;
}

export function CssCalculatorClient({
  hero,
  method,
}: {
  hero: ReactNode;
  method: ReactNode;
}) {
  const t = useTranslations("cssCalculator.page");
  const prefix = localePrefix(useLocale());
  const [unit, setUnit] = useState<PoolUnit>("meters");
  const [swimA, setSwimA] = useState<SwimDraft>({
    distance: "400",
    minutes: "",
    seconds: "",
  });
  const [swimB, setSwimB] = useState<SwimDraft>({
    distance: "200",
    minutes: "",
    seconds: "",
  });
  const [ready, setReady] = useState(false);
  const urlInitialized = useRef(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [inputSource, setInputSource] = useState("manual");
  const [example, setExample] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useLayoutEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore the shared URL after SSR */
    const query = new URLSearchParams(window.location.search);
    const hasQuery = QUERY_KEYS.some((key) => query.has(key));
    if (!hasQuery) {
      setReady(true);
      return;
    }
    const pool = readPool(query.get("pool"));
    if (pool) setUnit(pool);
    const readDraft = (
      distanceKey: "d1" | "d2",
      minutesKey: "m1" | "m2",
      secondsKey: "s1" | "s2",
      fallback: SwimDraft,
    ): SwimDraft => ({
      distance: query.get(distanceKey) ?? fallback.distance,
      minutes: query.get(minutesKey) ?? fallback.minutes,
      seconds: query.get(secondsKey) ?? fallback.seconds,
    });
    setSwimA(
      readDraft("d1", "m1", "s1", {
        distance: "400",
        minutes: "",
        seconds: "",
      }),
    );
    setSwimB(
      readDraft("d2", "m2", "s2", {
        distance: "200",
        minutes: "",
        seconds: "",
      }),
    );
    setExample(query.get("example") === "1");
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Preserve the initial URL while sibling Suspense boundaries hydrate.
    // The restored inputs already represent that URL; sync subsequent edits only.
    if (!urlInitialized.current) {
      urlInitialized.current = true;
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("pool", unit);
    url.searchParams.set("d1", swimA.distance);
    url.searchParams.set("m1", swimA.minutes);
    url.searchParams.set("s1", swimA.seconds);
    url.searchParams.set("d2", swimB.distance);
    url.searchParams.set("m2", swimB.minutes);
    url.searchParams.set("s2", swimB.seconds);
    if (example) url.searchParams.set("example", "1");
    else url.searchParams.delete("example");
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [ready, unit, swimA, swimB, example]);

  const distanceA = useMemo(
    () => parsePositiveNumber(swimA.distance),
    [swimA.distance],
  );
  const distanceB = useMemo(
    () => parsePositiveNumber(swimB.distance),
    [swimB.distance],
  );
  const minutesA = parseClockPart(swimA.minutes, null);
  const secondsA = parseClockPart(swimA.seconds, 59);
  const minutesB = parseClockPart(swimB.minutes, null);
  const secondsB = parseClockPart(swimB.seconds, 59);
  const timeA =
    minutesA == null || secondsA == null
      ? null
      : timePartsToSeconds(minutesA, secondsA);
  const timeB =
    minutesB == null || secondsB == null
      ? null
      : timePartsToSeconds(minutesB, secondsB);

  const result = useMemo(() => {
    if (
      distanceA == null ||
      distanceB == null ||
      timeA == null ||
      timeB == null
    ) {
      return null;
    }
    return calculateCss(
      { distance: distanceA, timeSec: timeA },
      { distance: distanceB, timeSec: timeB },
      unit,
    );
  }, [distanceA, distanceB, timeA, timeB, unit]);

  useInstantToolAnalytics("css_calculator", "calculate_css", Boolean(result));

  const inputInvalid =
    (swimA.distance.trim() !== "" && distanceA == null) ||
    (swimB.distance.trim() !== "" && distanceB == null) ||
    minutesA == null ||
    secondsA == null ||
    minutesB == null ||
    secondsB == null ||
    (timeA == null &&
      (swimA.minutes.trim() !== "" || swimA.seconds.trim() !== "")) ||
    (timeB == null &&
      (swimB.minutes.trim() !== "" || swimB.seconds.trim() !== ""));

  const unusable =
    !inputInvalid &&
    distanceA != null &&
    distanceB != null &&
    timeA != null &&
    timeB != null &&
    result == null;

  const unusual = result != null && isUnusualCssPace(result.pacePer100mSec);

  function selectUnit(next: PoolUnit) {
    if (next === unit) return;
    const factor = next === "yards" ? 1 / METERS_PER_YARD : METERS_PER_YARD;
    const convert = (draft: SwimDraft) => {
      const distance = parsePositiveNumber(draft.distance);
      return {
        ...draft,
        distance:
          distance == null
            ? draft.distance
            : String(Number((distance * factor).toFixed(4))),
      };
    };
    setUnit(next);
    setSwimA(convert);
    setSwimB(convert);
    setCopied(false);
  }

  function loadExample() {
    setInputSource("manual");
    setUnit("meters");
    setSwimA(EXAMPLE_METERS[0]);
    setSwimB(EXAMPLE_METERS[1]);
    setExample(true);
  }

  function resetFileResult() {
    setSwimA((current) => ({ ...current, minutes: "", seconds: "" }));
    setSwimB((current) => ({ ...current, minutes: "", seconds: "" }));
    setExample(false);
  }

  function useFileResult(swims: [CssSwim, CssSwim]) {
    const draft = (swim: CssSwim): SwimDraft => {
      const milliseconds = Math.round(swim.timeSec * 1000);
      return {
        distance: String(
          Number(
            (
              swim.distance * (unit === "yards" ? 1 / METERS_PER_YARD : 1)
            ).toFixed(4),
          ),
        ),
        minutes: String(Math.floor(milliseconds / 60000)),
        seconds: String((milliseconds % 60000) / 1000),
      };
    };
    setSwimA(draft(swims[0]));
    setSwimB(draft(swims[1]));
    setExample(false);
  }

  function onUnitKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: PoolUnit = event.key === "ArrowRight" ? "yards" : "meters";
    selectUnit(next);
    document
      .getElementById(
        next === "meters" ? "css-units-meters" : "css-units-yards",
      )
      ?.focus();
  }

  function onPrint() {
    trackToolEvent("tool_result_copied", "css_calculator", {
      action: "print_result_card",
    });
    window.print();
  }

  async function onCopyLink() {
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
        trackToolEvent("tool_result_copied", "css_calculator", {
          action: "native_share",
        });
        return;
      }
      await navigator.clipboard.writeText(href);
      trackToolEvent("tool_result_copied", "css_calculator", {
        action: "copy_link",
      });
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareError(true);
      trackToolEvent("tool_failed", "css_calculator", {
        action: "copy_link",
        error_code: "clipboard_failed",
      });
    }
  }

  const paceUnit = unit === "yards" ? t("result.per100y") : t("result.per100m");
  const distanceSuffix =
    unit === "yards" ? t("manual.suffix.yards") : t("manual.suffix.meters");
  const distanceWord =
    unit === "yards" ? t("manual.unitName.yards") : t("manual.unitName.meters");
  const steps = [
    ["inputs", t("howTo.steps.inputs.title"), t("howTo.steps.inputs.body")],
    ["formula", t("howTo.steps.formula.title"), t("howTo.steps.formula.body")],
    ["next", t("howTo.steps.next.title"), t("howTo.steps.next.body")],
  ] as const;

  const effortLine = result
    ? t("result.efforts", {
        longDistance: String(Number(result.longDistance.toFixed(1))),
        longTime: formatSwimClock(result.longTimeSec),
        shortDistance: String(Number(result.shortDistance.toFixed(1))),
        shortTime: formatSwimClock(result.shortTimeSec),
        unit: distanceWord,
      })
    : t("result.empty");

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
                id="css-units-meters"
                type="button"
                role="radio"
                variant="ghost"
                aria-checked={unit === "meters"}
                tabIndex={unit === "meters" ? 0 : -1}
                onClick={() => selectUnit("meters")}
                onKeyDown={onUnitKeyDown}
                className={styles.unitOption}
              >
                {t("manual.meters")}
              </Button>
              <Button
                id="css-units-yards"
                type="button"
                role="radio"
                variant="ghost"
                aria-checked={unit === "yards"}
                tabIndex={unit === "yards" ? 0 : -1}
                onClick={() => selectUnit("yards")}
                onKeyDown={onUnitKeyDown}
                className={styles.unitOption}
              >
                {t("manual.yards")}
              </Button>
            </div>
          </div>
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
          <fieldset className={styles.inputSources}>
            <legend className="sr-only">{t("source.label")}</legend>
            <span className={styles.inputSourceLabel} aria-hidden="true">
              {t("source.label")}
            </span>
            <div className={styles.inputSourceOptions}>
              {(["manual", "file"] as const).map((source) => (
                <label key={source}>
                  <input
                    type="radio"
                    name="css-source"
                    checked={inputSource === source}
                    onChange={() => {
                      setInputSource(source);
                      if (source === "file") resetFileResult();
                    }}
                  />
                  <span>{t(`source.${source}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {inputSource === "file" ? (
            <CssFileInput onResult={useFileResult} onReset={resetFileResult} />
          ) : (
            <div className={styles.formStack}>
              <SwimFields
                idPrefix="css-a"
                legend={t("manual.swimA")}
                draft={swimA}
                distanceSuffix={distanceSuffix}
                distanceLabel={t("manual.distance")}
                minutesLabel={t("manual.minutes")}
                secondsLabel={t("manual.seconds")}
                minutesSuffix={t("manual.suffix.minutes")}
                secondsSuffix={t("manual.suffix.seconds")}
                onChange={(draft) => {
                  setSwimA(draft);
                  setExample(false);
                  setCopied(false);
                }}
              />
              <SwimFields
                idPrefix="css-b"
                legend={t("manual.swimB")}
                draft={swimB}
                distanceSuffix={distanceSuffix}
                distanceLabel={t("manual.distance")}
                minutesLabel={t("manual.minutes")}
                secondsLabel={t("manual.seconds")}
                minutesSuffix={t("manual.suffix.minutes")}
                secondsSuffix={t("manual.suffix.seconds")}
                onChange={(draft) => {
                  setSwimB(draft);
                  setExample(false);
                  setCopied(false);
                }}
              />
              <div className={styles.formFoot}>
                <p className={styles.fileHint}>{t("manual.unitHelp")}</p>
                <button type="button" onClick={loadExample}>
                  {t("manual.example")}
                </button>
              </div>
            </div>
          )}
          {inputInvalid ? (
            <p role="alert" className={styles.alert}>
              {t("manual.invalid")}
            </p>
          ) : null}
          {unusable ? (
            <p role="alert" className={styles.alert}>
              {t("manual.unusable")}
            </p>
          ) : null}
          {unusual ? (
            <p role="status" className={styles.inputNotice}>
              {t("manual.unusual")}
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
                <p className={styles.posterEyebrow}>{t("result.paceLabel")}</p>
                <p
                  className={styles.posterWatts}
                  data-pace={result ? "true" : "false"}
                >
                  <span className={styles.posterNumber}>
                    {result ? formatPaceClock(result.pacePer100UnitSec) : "—"}
                  </span>
                  {result ? (
                    <span className={styles.posterUnit}>{paceUnit}</span>
                  ) : null}
                </p>
                <p className={styles.posterProtocol}>{effortLine}</p>
                {example && result ? (
                  <p className={styles.posterHint}>{t("result.example")}</p>
                ) : null}
              </div>
              <div className={styles.pride}>
                <p className={styles.posterEyebrow}>{t("result.speedLabel")}</p>
                <p className={styles.prideFigure}>
                  <span className={styles.prideValue}>
                    {result ? formatSpeedMps(result.speedMps) : "—"}
                  </span>
                  {result ? (
                    <span className={styles.prideUnit}>m/s</span>
                  ) : null}
                </p>
                <p className={styles.bandCaption}>{t("result.speedCaption")}</p>
              </div>
            </div>
            <div className={styles.posterZones}>
              <div className={styles.zoneHeading}>
                <h3>{t("result.zonesTitle")}</h3>
                <span>{paceUnit}</span>
              </div>
              <ol className={styles.zoneStrip} data-count="5">
                {ZONE_IDS.map((id, index) => {
                  const zone = result?.zones.find((item) => item.id === id);
                  const pace = zone
                    ? zone.offsetStart === zone.offsetEnd
                      ? formatPaceClock(zone.paceStartSec)
                      : `${formatPaceClock(zone.paceStartSec)}–${formatPaceClock(zone.paceEndSec)}`
                    : "—";
                  const factor = unit === "yards" ? METERS_PER_YARD : 1;
                  const offset = zone
                    ? formatOffset(
                        Number((zone.offsetStart * factor).toFixed(1)),
                        Number((zone.offsetEnd * factor).toFixed(1)),
                      )
                    : "—";
                  return (
                    <li
                      key={id}
                      className={styles.zoneCell}
                      data-zone={`z${index + 1}`}
                    >
                      <span className={styles.zoneSwatch}>
                        {t(`zones.${id}`)}
                      </span>
                      <span className={styles.zoneFigure}>{pace}</span>
                      <span className={styles.zonePercent}>
                        {offset === "0" ? t("result.thresholdOffset") : offset}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className={styles.zoneCaption}>{t("result.zonesCaption")}</p>
            </div>
          </div>
        </section>
        <div className={`${styles.posterActions} css-share-actions`}>
          <a
            href={`${prefix}/swim-training-plan`}
            className={styles.primaryAction}
          >
            {t("result.handoff")}
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
            onClick={() => void onCopyLink()}
          >
            <Share2 className="size-3.5" aria-hidden />
            {copied ? t("result.copied") : t("result.copyLink")}
          </Button>
        </div>
        {shareError ? (
          <p role="alert" className={styles.fileHint}>
            {t("result.shareError")}
          </p>
        ) : null}
      </div>
      <section id="method" className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 className={styles.sectionTitle}>{t("sections.method.title")}</h2>
          <p className={styles.sectionBody}>
            {t("sections.method.description")}
          </p>
        </div>
        <CssFitChart result={result} />
        {method}
      </section>
    </>
  );
}

function SwimFields({
  idPrefix,
  legend,
  draft,
  distanceSuffix,
  distanceLabel,
  minutesLabel,
  secondsLabel,
  minutesSuffix,
  secondsSuffix,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  draft: SwimDraft;
  distanceSuffix: string;
  distanceLabel: string;
  minutesLabel: string;
  secondsLabel: string;
  minutesSuffix: string;
  secondsSuffix: string;
  onChange: (next: SwimDraft) => void;
}) {
  return (
    <div className={styles.effort}>
      <div className={styles.effortTitle}>{legend}</div>
      <div className={styles.swimGrid}>
        <div className={styles.field}>
          <Label htmlFor={`${idPrefix}-distance`}>{distanceLabel}</Label>
          <UnitInput
            id={`${idPrefix}-distance`}
            suffix={distanceSuffix}
            inputMode="decimal"
            value={draft.distance}
            aria-label={`${legend} ${distanceLabel}`}
            onChange={(event) =>
              onChange({ ...draft, distance: event.target.value })
            }
          />
        </div>
        <div className={styles.field}>
          <Label htmlFor={`${idPrefix}-minutes`}>{minutesLabel}</Label>
          <UnitInput
            id={`${idPrefix}-minutes`}
            suffix={minutesSuffix}
            inputMode="numeric"
            value={draft.minutes}
            aria-label={`${legend} ${minutesLabel}`}
            onChange={(event) =>
              onChange({ ...draft, minutes: event.target.value })
            }
          />
        </div>
        <div className={styles.field}>
          <Label htmlFor={`${idPrefix}-seconds`}>{secondsLabel}</Label>
          <UnitInput
            id={`${idPrefix}-seconds`}
            suffix={secondsSuffix}
            inputMode="decimal"
            value={draft.seconds}
            aria-label={`${legend} ${secondsLabel}`}
            onChange={(event) =>
              onChange({ ...draft, seconds: event.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}
