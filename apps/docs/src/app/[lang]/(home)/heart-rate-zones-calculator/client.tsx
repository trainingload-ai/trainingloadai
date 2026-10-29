"use client";
import { InputSource } from "@/components/calculators/input-source";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Printer, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrackedLink } from "@/components/TrackedLink";
import { cn } from "@/lib/cn";
import { localePrefix } from "@/lib/locale-url";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import { compareObservedMaxHr } from "@/lib/heart-rate-activity";
import {
  buildFrielZones,
  buildKarvonenZones,
  buildMhrZones,
  formatZoneBpm,
  parseHeartRateBpm,
  type HeartRateZone,
} from "@/lib/heart-rate-zones";
import { buildHeartRateZonesSearch } from "@/lib/zone-tool-links";
import type { HeartRateZonesInputs } from "./share-inputs";
import { HeartRateFileInput, type HeartRateFileEstimate } from "./file-input";
import styles from "./heart-rate-zones-calculator.module.css";

type ModelKey = HeartRateZonesInputs["model"];
type Source = "manual" | "file";

const SLUG = { KARVONEN: "karvonen", FRIEL: "friel", MHR: "mhr" } as const;
const ZONE_COUNT = { KARVONEN: 5, MHR: 5, FRIEL: 7 } as const;

function isModelKey(value: string): value is ModelKey {
  return value === "KARVONEN" || value === "FRIEL" || value === "MHR";
}

function formatDelta(value: number) {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function HeartRateZonesCalculatorClient({
  initialInputs,
  methods,
  hero,
}: {
  initialInputs: HeartRateZonesInputs;
  methods: ReactNode;
  hero: ReactNode;
}) {
  const t = useTranslations("heartRateZonesCalculator.client");
  const tPage = useTranslations("heartRateZonesCalculator.page");
  const prefix = localePrefix(useLocale());
  const [model, setModel] = useState<ModelKey>(initialInputs.model);
  const [maxHrText, setMaxHrText] = useState(initialInputs.maxHr);
  const [restHrText, setRestHrText] = useState(initialInputs.restHr);
  const [lthrText, setLthrText] = useState(initialInputs.lthr);
  const [example, setExample] = useState(initialInputs.example);
  const [source, setSource] = useState<Source>("manual");
  const [fileEstimate, setFileEstimate] =
    useState<HeartRateFileEstimate | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState("");
  const [baseline, setBaseline] = useState<{
    lthr: string;
    maxHr: string;
  } | null>(null);
  const copiedTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const maxHr = parseHeartRateBpm(maxHrText);
  const restHr = parseHeartRateBpm(restHrText);
  const lthr = parseHeartRateBpm(lthrText);
  const slug = SLUG[model];
  const zoneCount = ZONE_COUNT[model];

  const zones = useMemo<HeartRateZone[] | null>(() => {
    if (model === "KARVONEN") {
      if (maxHr == null || restHr == null) return null;
      return buildKarvonenZones(maxHr, restHr);
    }
    if (model === "FRIEL") {
      if (lthr == null) return null;
      return buildFrielZones(lthr);
    }
    if (maxHr == null) return null;
    return buildMhrZones(maxHr);
  }, [lthr, maxHr, model, restHr]);

  useEffect(() => {
    const nextSearch = buildHeartRateZonesSearch({
      model,
      maxHr: maxHrText,
      restHr: restHrText,
      lthr: lthrText,
      example: example && zones != null,
    });
    const url = new URL(window.location.href);
    const next = nextSearch ? `?${nextSearch}` : "";
    if (url.search === next) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${next}${url.hash}`,
    );
  }, [example, lthrText, maxHrText, model, restHrText, zones]);

  useInstantToolAnalytics(
    "heart_rate_zones_calculator",
    "calculate_heart_rate_zones",
    Boolean(zones),
  );

  function chooseModel(value: string) {
    if (!isModelKey(value) || value === model) return;
    setModel(value);
    setExample(false);
  }

  function editMax(value: string) {
    setMaxHrText(value);
    setExample(false);
    setFileEstimate(null);
    setBaseline(null);
  }

  function editRest(value: string) {
    setRestHrText(value);
    setExample(false);
    setFileEstimate(null);
    setBaseline(null);
  }

  function editLthr(value: string) {
    setLthrText(value);
    setExample(false);
    setFileEstimate(null);
    setBaseline(null);
  }

  function loadExample() {
    setSource("manual");
    setModel("KARVONEN");
    setMaxHrText("190");
    setRestHrText("50");
    setLthrText("");
    setExample(true);
    setFileEstimate(null);
    setBaseline(null);
    setShareError("");
  }

  function onFileReset() {
    setBaseline({ lthr: lthrText, maxHr: maxHrText });
    setFileEstimate(null);
    setExample(false);
  }

  function onFileResult(result: HeartRateFileEstimate) {
    setFileEstimate(result);
    setExample(false);
    if (result.lthr != null) setLthrText(String(result.lthr));
    if (result.maxHr != null) setMaxHrText(String(result.maxHr));
  }

  const anchorText =
    model === "FRIEL"
      ? lthr == null
        ? "—"
        : lthrText.trim()
      : maxHr == null
        ? "—"
        : maxHrText.trim();
  const prideText =
    model === "KARVONEN"
      ? restHr == null
        ? "—"
        : restHrText.trim()
      : String(zoneCount);

  const softWarnings: string[] = [];
  if (model !== "FRIEL" && maxHr != null && (maxHr < 120 || maxHr > 230)) {
    softWarnings.push(t("warnings.maxHr"));
  }
  if (model === "KARVONEN" && restHr != null && (restHr < 30 || restHr > 100)) {
    softWarnings.push(t("warnings.restHr"));
  }
  if (model === "FRIEL" && lthr != null && (lthr < 100 || lthr > 220)) {
    softWarnings.push(t("warnings.lthr"));
  }
  const reserveBlocked =
    model === "KARVONEN" && maxHr != null && restHr != null && restHr >= maxHr;
  const invalidField =
    (model !== "FRIEL" && maxHrText.trim() !== "" && maxHr == null) ||
    (model === "KARVONEN" && restHrText.trim() !== "" && restHr == null) ||
    (model === "FRIEL" && lthrText.trim() !== "" && lthr == null);

  const onShare = async () => {
    if (!zones) return;
    const url = new URL(window.location.href);
    url.hash = "result";
    const href = url.toString();
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (`${url.pathname}${url.search}${url.hash}` !== current) {
      window.history.replaceState(window.history.state, "", href);
    }
    setShareError("");
    try {
      if (navigator.share) {
        await navigator.share({ title: t("scorecard.title"), url: href });
        trackToolEvent("tool_result_copied", "heart_rate_zones_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(href);
      trackToolEvent("tool_result_copied", "heart_rate_zones_calculator", {
        action: "copy_share_link",
      });
      setShareCopied(true);
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(
        () => setShareCopied(false),
        1600,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "heart_rate_zones_calculator", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      setShareCopied(false);
      setShareError(t("scorecard.shareError"));
    }
  };

  const onPrint = useCallback(() => {
    trackToolEvent("tool_result_copied", "heart_rate_zones_calculator", {
      action: "print_result_card",
    });
    window.print();
  }, []);

  const zone2Href = `${prefix}/zone-2-heart-rate-calculator`;
  const previousLthr = parseHeartRateBpm(baseline?.lthr ?? "");
  const previousMax = parseHeartRateBpm(baseline?.maxHr ?? "");
  const maxNote =
    fileEstimate?.maxHr == null
      ? null
      : compareObservedMaxHr(fileEstimate.maxHr, previousMax);

  return (
    <div className={styles.tool}>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <div className={styles.boardHead}>
            <h2 className={styles.boardLabel}>{tPage("title")}</h2>
            <button
              type="button"
              className={styles.textButton}
              onClick={loadExample}
            >
              {t("example.button")}
            </button>
          </div>
          <p className={styles.boardLead}>{t("panel.subtitle")}</p>
          <div className={styles.fields}>
            <InputSource
              value={source}
              label={t("source.legend")}
              manual={t("source.manual")}
              file={t("source.file")}
              onValueChange={(next) => {
                setSource(next);
                if (next === "manual") {
                  setFileEstimate(null);
                  setBaseline(null);
                }
              }}
            />

            <div className={styles.field}>
              <label className={styles.label} htmlFor="hr-zone-model">
                {t("inputs.model.label")}
              </label>
              <Select value={model} onValueChange={chooseModel}>
                <SelectTrigger id="hr-zone-model" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KARVONEN">
                    {t("inputs.model.options.karvonen")}
                  </SelectItem>
                  <SelectItem value="FRIEL">
                    {t("inputs.model.options.friel")}
                  </SelectItem>
                  <SelectItem value="MHR">
                    {t("inputs.model.options.mhr")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className={styles.useWhen}>
                {tPage(`sections.models.useWhen.${slug}`)}
              </p>
            </div>

            {source === "file" ? (
              <HeartRateFileInput
                onResult={onFileResult}
                onReset={onFileReset}
              />
            ) : null}

            {model !== "FRIEL" ? (
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="hr-max">
                    {t("inputs.maxHr.label")}
                  </label>
                  <Input
                    id="hr-max"
                    inputMode="decimal"
                    value={maxHrText}
                    onChange={(event) => editMax(event.target.value)}
                    aria-invalid={maxHrText.trim() !== "" && maxHr == null}
                  />
                </div>
                {model === "KARVONEN" ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="hr-rest">
                      {t("inputs.restHr.label")}
                    </label>
                    <Input
                      id="hr-rest"
                      inputMode="decimal"
                      value={restHrText}
                      onChange={(event) => editRest(event.target.value)}
                      aria-invalid={
                        (restHrText.trim() !== "" && restHr == null) ||
                        reserveBlocked
                      }
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="hr-lthr">
                  {t("inputs.lthr.label")}
                </label>
                <Input
                  id="hr-lthr"
                  inputMode="decimal"
                  value={lthrText}
                  onChange={(event) => editLthr(event.target.value)}
                  aria-invalid={lthrText.trim() !== "" && lthr == null}
                />
              </div>
            )}

            {fileEstimate ? (
              <div className={styles.compare} role="status">
                <p>{t("compare.from", { filename: fileEstimate.filename })}</p>
                {fileEstimate.lthr != null ? (
                  <>
                    <p>{t("compare.lthr", { value: fileEstimate.lthr })}</p>
                    <p>
                      {previousLthr == null
                        ? t("compare.noPrior")
                        : fileEstimate.lthr === previousLthr
                          ? t("compare.deltaSame", { previous: previousLthr })
                          : fileEstimate.lthr > previousLthr
                            ? t("compare.deltaUp", {
                                delta: formatDelta(
                                  fileEstimate.lthr - previousLthr,
                                ),
                                previous: previousLthr,
                              })
                            : t("compare.deltaDown", {
                                delta: formatDelta(
                                  previousLthr - fileEstimate.lthr,
                                ),
                                previous: previousLthr,
                              })}
                    </p>
                  </>
                ) : null}
                {fileEstimate.maxHr != null ? (
                  <>
                    <p>{t("compare.peak", { value: fileEstimate.maxHr })}</p>
                    {fileEstimate.maxHrInstantaneous ? null : (
                      <p>{t("compare.peakCoarse")}</p>
                    )}
                    {maxNote === "may_be_low" && previousMax != null ? (
                      <p>{t("compare.peakLow", { previous: previousMax })}</p>
                    ) : null}
                    {maxNote === "not_a_decline" && previousMax != null ? (
                      <p>
                        {t("compare.peakNotDecline", { previous: previousMax })}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {invalidField ? (
              <p role="alert" className={styles.alert}>
                {t("warnings.invalid")}
              </p>
            ) : null}
            {reserveBlocked ? (
              <p role="alert" className={styles.alert}>
                {t("warnings.reserve")}
              </p>
            ) : null}
            {softWarnings.length > 0 ? (
              <div role="status" className={styles.note}>
                {softWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className={styles.posterWrap}>
        {example && zones ? (
          <p className={styles.exampleBanner} role="status">
            {t("example.banner")}
          </p>
        ) : null}
        <section id="result" aria-live="polite" className={styles.poster}>
          <div className={styles.posterSheet}>
            <div className={styles.posterBrand}>
              <h2 className={styles.posterHeading}>{t("scorecard.title")}</h2>
              <p className={styles.posterMark}>Trainingload.ai</p>
            </div>
            <div className={styles.posterMain}>
              <div>
                <p className={styles.posterEyebrow}>
                  {model === "FRIEL"
                    ? t("scorecard.anchorLthr")
                    : t("scorecard.anchorMax")}
                </p>
                <p
                  className={styles.posterWatts}
                  data-wide={anchorText.length >= 4}
                >
                  <span className={styles.posterNumber}>{anchorText}</span>
                  {anchorText === "—" ? null : (
                    <span className={styles.posterUnit}>
                      {t("scorecard.unit")}
                    </span>
                  )}
                </p>
                <p className={styles.posterProtocol}>
                  {t(`scorecard.models.${slug}`)}
                </p>
              </div>
              <div className={styles.pride}>
                <p className={styles.posterEyebrow}>
                  {model === "KARVONEN"
                    ? t("scorecard.prideRest")
                    : t("scorecard.prideZones")}
                </p>
                <p className={styles.prideFigure}>
                  <span
                    className={styles.prideValue}
                    data-wide={prideText.length >= 4}
                  >
                    {prideText}
                  </span>
                  {model === "KARVONEN" && prideText !== "—" ? (
                    <span className={styles.prideUnit}>
                      {t("scorecard.unit")}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            {zones ? (
              <div className={styles.posterZones}>
                <ol className={styles.zoneStrip} data-count={zones.length}>
                  {zones.map((zone) => (
                    <li
                      key={zone.code}
                      className={styles.zoneCell}
                      data-zone={`z${zone.order}`}
                    >
                      <span className={styles.zoneSwatch}>{zone.code}</span>
                      <span className={styles.zoneName}>
                        {t(`zoneNames.${slug}.z${zone.order}`)}
                      </span>
                      <span className={styles.zoneFigure}>
                        {formatZoneBpm(zone.bpmMin, zone.bpmMax)}
                      </span>
                      <span className={styles.zonePercent}>
                        {zone.percentLabel}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className={styles.formulaEcho}>{t("scorecard.empty")}</p>
            )}
          </div>
        </section>

        <div className={styles.posterActions}>
          <Select value={model} onValueChange={chooseModel}>
            <SelectTrigger
              id="hr-zone-model-card"
              aria-label={t("scorecard.switch")}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {t("scorecard.switch")}
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="KARVONEN">
                {t("inputs.model.options.karvonen")}
              </SelectItem>
              <SelectItem value="FRIEL">
                {t("inputs.model.options.friel")}
              </SelectItem>
              <SelectItem value="MHR">
                {t("inputs.model.options.mhr")}
              </SelectItem>
            </SelectContent>
          </Select>
          <TrackedLink
            href={zone2Href}
            className={cn(buttonVariants({ size: "lg" }), styles.primaryAction)}
            eventName="related_tool_clicked"
            eventProperties={{
              href: zone2Href,
              location: "heart_rate_zones_scorecard",
            }}
          >
            {t("scorecard.view")}
          </TrackedLink>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onPrint}
            disabled={!zones}
          >
            <Printer className="size-3.5" aria-hidden />
            {t("scorecard.print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onShare}
            disabled={!zones}
          >
            <Share2 className="size-3.5" aria-hidden />
            {shareCopied ? t("scorecard.shareCopied") : t("scorecard.share")}
          </Button>
        </div>
        {shareError ? (
          <p role="alert" className={styles.alert}>
            {shareError}
          </p>
        ) : null}
      </div>

      {methods}

      <section id="explained" className={styles.explained}>
        <h2 className={styles.boardLabel}>{t("explained.title")}</h2>
        <div className={styles.explainedGrid}>
          {(zoneCount === 5 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7]).map(
            (order) => (
              <article key={order} className={styles.explainedCard}>
                <h3>{t(`zoneNames.${slug}.z${order}`)}</h3>
                <p className={styles.hint}>
                  {t(
                    `${zoneCount === 5 ? "explained.five" : "explained.seven"}.items.z${order}.summary`,
                  )}
                </p>
              </article>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
