"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Printer, Share2, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import {
  calculateZone2FromAge,
  calculateZone2FromHrr,
  calculateZone2FromLthr,
  calculateZone2FromMaxHr,
  formatAnchorBpm,
  parsePositiveNumber,
  type AgeFormulaKey,
  type Zone2Method,
  type Zone2Range,
} from "@/lib/zone-2-heart-rate";
import { heartRateZonesHref } from "@/lib/zone-tool-links";
import {
  buildZone2ShareSearch,
  ZONE2_EXAMPLE,
  type Zone2Inputs,
} from "./share-inputs";
import styles from "./zone-2-heart-rate-calculator.module.css";

const METHODS: Zone2Method[] = ["maxHr", "hrr", "lthr", "age"];
const AGE_FORMULAS: AgeFormulaKey[] = ["tanaka", "fox"];
const accentButtonClass =
  "bg-brand text-brand-foreground hover:bg-brand/85";

function isZone2Method(value: string): value is Zone2Method {
  return METHODS.some((method) => method === value);
}

function isAgeFormula(value: string): value is AgeFormulaKey {
  return AGE_FORMULAS.some((formula) => formula === value);
}

export function Zone2HeartRateCalculatorClient({
  hero,
  initial,
  methods,
}: {
  hero: ReactNode;
  initial: Zone2Inputs;
  methods?: ReactNode;
}) {
  const t = useTranslations("zone2HeartRateCalculator.client");
  const locale = useLocale();
  const prefix = localePrefix(locale);
  const [method, setMethod] = useState<Zone2Method>(initial.method);
  const [maxHrText, setMaxHrText] = useState(initial.maxHr);
  const [restHrText, setRestHrText] = useState(initial.restHr);
  const [lthrText, setLthrText] = useState(initial.lthr);
  const [ageText, setAgeText] = useState(initial.age);
  const [ageFormula, setAgeFormula] = useState<AgeFormulaKey>(initial.formula);
  const [example, setExample] = useState(initial.example);

  const state: Zone2Inputs = {
    method,
    maxHr: maxHrText,
    restHr: restHrText,
    lthr: lthrText,
    age: ageText,
    formula: ageFormula,
    example,
  };

  const maxHr = useMemo(() => parsePositiveNumber(maxHrText), [maxHrText]);
  const restHr = useMemo(() => parsePositiveNumber(restHrText), [restHrText]);
  const lthr = useMemo(() => parsePositiveNumber(lthrText), [lthrText]);
  const age = useMemo(() => parsePositiveNumber(ageText), [ageText]);

  const result = useMemo(() => {
    if (method === "maxHr") {
      return maxHr == null ? null : calculateZone2FromMaxHr(maxHr);
    }
    if (method === "hrr") {
      return maxHr == null || restHr == null
        ? null
        : calculateZone2FromHrr(maxHr, restHr);
    }
    if (method === "lthr") {
      return lthr == null ? null : calculateZone2FromLthr(lthr);
    }
    return age == null ? null : calculateZone2FromAge(age, ageFormula);
  }, [age, ageFormula, lthr, maxHr, method, restHr]);

  useEffect(() => {
    const nextSearch = buildZone2ShareSearch(window.location.search, {
      method,
      maxHr: maxHrText,
      restHr: restHrText,
      lthr: lthrText,
      age: ageText,
      formula: ageFormula,
      example,
    });
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [ageFormula, ageText, example, lthrText, maxHrText, method, restHrText]);

  useInstantToolAnalytics(
    "zone_2_heart_rate_calculator",
    "calculate_zone_2",
    Boolean(result),
  );

  const activeFields =
    method === "hrr"
      ? [
          { text: maxHrText, value: maxHr },
          { text: restHrText, value: restHr },
        ]
      : [
          method === "maxHr"
            ? { text: maxHrText, value: maxHr }
            : method === "lthr"
              ? { text: lthrText, value: lthr }
              : { text: ageText, value: age },
        ];
  const invalid = activeFields.some(
    ({ text: valueText, value }) => valueText.trim() !== "" && value == null,
  );

  const warnings = useMemo(() => {
    const items: string[] = [];
    if (
      (method === "maxHr" || method === "hrr") &&
      maxHr != null &&
      (maxHr < 120 || maxHr > 220)
    ) {
      items.push(t("warnings.maxHr"));
    }
    if (method === "hrr" && restHr != null && (restHr < 30 || restHr > 120)) {
      items.push(t("warnings.restHr"));
    }
    if (
      method === "hrr" &&
      maxHr != null &&
      restHr != null &&
      restHr >= maxHr
    ) {
      items.push(t("warnings.reserve"));
    }
    if (method === "lthr" && lthr != null && (lthr < 100 || lthr > 200)) {
      items.push(t("warnings.lthr"));
    }
    if (method === "age" && age != null && (age < 15 || age > 90)) {
      items.push(t("warnings.age"));
    }
    return items;
  }, [age, lthr, maxHr, method, restHr, t]);

  const onMethod = (value: string) => {
    if (!isZone2Method(value)) return;
    setMethod(value);
    setExample(false);
  };

  const loadExample = () => {
    setMethod(ZONE2_EXAMPLE.method);
    setMaxHrText(ZONE2_EXAMPLE.maxHr);
    setRestHrText("");
    setLthrText("");
    setAgeText("");
    setAgeFormula(ZONE2_EXAMPLE.formula);
    setExample(true);
  };

  const zonesHref = result
    ? result.method === "lthr"
      ? heartRateZonesHref(prefix, { model: "FRIEL", lthr: result.anchorBpm })
      : result.method === "hrr"
        ? heartRateZonesHref(prefix, {
            model: "KARVONEN",
            maxHr: result.anchorBpm,
            restHr: result.restingBpm,
          })
        : heartRateZonesHref(prefix, {
            model: "MHR",
            maxHr: result.anchorBpm,
          })
    : `${prefix}/heart-rate-zones-calculator`;
  const maxHrHref =
    method === "age" && age != null
      ? `${prefix}/max-heart-rate-calculator?age=${encodeURIComponent(ageText.trim())}`
      : `${prefix}/max-heart-rate-calculator`;

  return (
    <>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <h2 className={styles.boardLabel}>{t("panel.title")}</h2>
          <p className={styles.boardLead}>{t("panel.subtitle")}</p>
          <div className={styles.formStack}>
            <div className={styles.field}>
              <Label htmlFor="zone2-method">{t("inputs.method.label")}</Label>
              <Select value={method} onValueChange={onMethod}>
                <SelectTrigger id="zone2-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {METHODS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`inputs.method.options.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {method === "maxHr" ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("inputs.maxHr.label")}
                </span>
                <Input
                  inputMode="decimal"
                  aria-invalid={invalid}
                  placeholder={t("inputs.maxHr.placeholder")}
                  value={maxHrText}
                  onChange={(event) => {
                    setMaxHrText(event.target.value);
                    setExample(false);
                  }}
                />
                <span className={styles.hint}>{t("inputs.maxHr.hint")}</span>
              </label>
            ) : null}

            {method === "hrr" ? (
              <div className={styles.inputGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {t("inputs.maxHr.label")}
                  </span>
                  <Input
                    inputMode="decimal"
                    aria-invalid={maxHrText.trim() !== "" && maxHr == null}
                    placeholder={t("inputs.maxHr.placeholder")}
                    value={maxHrText}
                    onChange={(event) => {
                      setMaxHrText(event.target.value);
                      setExample(false);
                    }}
                  />
                  <span className={styles.hint}>{t("inputs.maxHr.hint")}</span>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {t("inputs.restHr.label")}
                  </span>
                  <Input
                    inputMode="decimal"
                    aria-invalid={restHrText.trim() !== "" && restHr == null}
                    placeholder={t("inputs.restHr.placeholder")}
                    value={restHrText}
                    onChange={(event) => {
                      setRestHrText(event.target.value);
                      setExample(false);
                    }}
                  />
                  <span className={styles.hint}>{t("inputs.restHr.hint")}</span>
                </label>
              </div>
            ) : null}

            {method === "lthr" ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("inputs.lthr.label")}
                </span>
                <Input
                  inputMode="decimal"
                  aria-invalid={invalid}
                  placeholder={t("inputs.lthr.placeholder")}
                  value={lthrText}
                  onChange={(event) => {
                    setLthrText(event.target.value);
                    setExample(false);
                  }}
                />
                <span className={styles.hint}>{t("inputs.lthr.hint")}</span>
              </label>
            ) : null}

            {method === "age" ? (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {t("inputs.age.label")}
                  </span>
                  <Input
                    inputMode="decimal"
                    aria-invalid={invalid}
                    placeholder={t("inputs.age.placeholder")}
                    value={ageText}
                    onChange={(event) => {
                      setAgeText(event.target.value);
                      setExample(false);
                    }}
                  />
                  <span className={styles.hint}>{t("inputs.age.hint")}</span>
                </label>
                <div className={styles.field}>
                  <Label htmlFor="zone2-formula">
                    {t("inputs.ageFormula.label")}
                  </Label>
                  <Select
                    value={ageFormula}
                    onValueChange={(value) => {
                      if (!isAgeFormula(value)) return;
                      setAgeFormula(value);
                      setExample(false);
                    }}
                  >
                    <SelectTrigger id="zone2-formula" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {AGE_FORMULAS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`inputs.ageFormula.options.${key}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className={styles.hint}>
                    {t("inputs.ageFormula.hint")}
                  </span>
                </div>
              </>
            ) : null}

            <p className={styles.fileLinks}>
              {t("file.lead")}{" "}
              <TrackedLink
                href={maxHrHref}
                eventName="related_tool_clicked"
                eventProperties={{
                  href: maxHrHref,
                  location: "zone2_file_handoff",
                }}
                className={styles.inlineLink}
              >
                {t("file.maxHr")}
              </TrackedLink>
              {" · "}
              <TrackedLink
                href={zonesHref}
                eventName="related_tool_clicked"
                eventProperties={{
                  href: zonesHref,
                  location: "zone2_file_handoff",
                }}
                className={styles.inlineLink}
              >
                {t("file.zones")}
              </TrackedLink>
            </p>
            <div className={styles.formFoot}>
              <button
                type="button"
                className={styles.exampleButton}
                onClick={loadExample}
              >
                {t("example")}
              </button>
            </div>

            {invalid ? (
              <p role="alert" className={styles.alert}>
                {t("inputs.invalid")}
              </p>
            ) : null}
            {warnings.length > 0 ? (
              <div role="status" className={styles.notice}>
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <Scorecard
        result={result}
        state={state}
        method={method}
        onMethod={onMethod}
        example={example && Boolean(result)}
        formulaLabel={t(`inputs.ageFormula.short.${ageFormula}`)}
        zonesHref={zonesHref}
      />
      {methods}
    </>
  );
}

function Scorecard({
  result,
  state,
  method,
  onMethod,
  example,
  formulaLabel,
  zonesHref,
}: {
  result: Zone2Range | null;
  state: Zone2Inputs;
  method: Zone2Method;
  onMethod: (value: string) => void;
  example: boolean;
  formulaLabel: string;
  zonesHref: string;
}) {
  const t = useTranslations("zone2HeartRateCalculator.page.scorecard");
  const tClient = useTranslations("zone2HeartRateCalculator.client");
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const methodLabel = tClient(`inputs.method.options.${method}`);
  const benchmark = result
    ? result.method === "lthr"
      ? t("benchmarkLthr", { bpm: formatAnchorBpm(result.anchorBpm) })
      : result.method === "hrr"
        ? t("benchmarkHrr", {
            max: formatAnchorBpm(result.anchorBpm),
            rest: formatAnchorBpm(result.restingBpm ?? 0),
          })
        : result.method === "age"
          ? t("benchmarkAge", {
              formula: formulaLabel,
              bpm: formatAnchorBpm(result.anchorBpm),
            })
          : t("benchmarkMaxHr", { bpm: formatAnchorBpm(result.anchorBpm) })
    : "";
  const wide =
    result != null &&
    String(result.bpmMin).length + String(result.bpmMax).length >= 6;

  const onShare = async () => {
    const url = new URL(window.location.href);
    const search = buildZone2ShareSearch(url.search, state);
    url.search = search.startsWith("?") ? search.slice(1) : search;
    url.hash = "result";
    window.history.replaceState(window.history.state, "", url);
    setShareError(false);
    try {
      if (navigator.share) {
        await navigator.share({
          title: t("summaryTitle"),
          url: url.toString(),
        });
        trackToolEvent("tool_result_copied", "zone_2_heart_rate_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      trackToolEvent("tool_result_copied", "zone_2_heart_rate_calculator", {
        action: "copy_share_link",
      });
      setCopied(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "zone_2_heart_rate_calculator", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      setCopied(false);
      setShareError(true);
      return;
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const onPrint = () => {
    const url = new URL(window.location.href);
    const search = buildZone2ShareSearch(url.search, state);
    url.search = search.startsWith("?") ? search.slice(1) : search;
    url.hash = "result";
    window.history.replaceState(window.history.state, "", url);
    trackToolEvent("tool_result_copied", "zone_2_heart_rate_calculator", {
      action: "print_result_card",
    });
    window.print();
  };

  return (
    <div className={styles.posterWrap}>
      <section id="result" aria-live="polite" className={styles.poster}>
        <div className={styles.posterSheet}>
          <div className={styles.posterBrand}>
            <h2 className={styles.posterHeading}>{t("summaryTitle")}</h2>
            <p className={styles.posterMark}>{t("brand")}</p>
          </div>
          <div className={styles.posterMain}>
            <div>
              <p className={styles.posterEyebrow}>{t("rangeLabel")}</p>
              <p
                className={styles.posterWatts}
                data-wide={wide ? "true" : "false"}
              >
                <span className={styles.posterNumber}>
                  {result ? `${result.bpmMin}–${result.bpmMax}` : "—"}
                </span>
                {result ? <span className={styles.posterUnit}>bpm</span> : null}
              </p>
              <p className={styles.posterProtocol}>
                {result
                  ? t("methodLine", {
                      method: methodLabel,
                      lowPct: result.percentMin,
                      highPct: result.percentMax,
                    })
                  : t("empty")}
              </p>
              {example ? (
                <p className={styles.posterHint}>{t("example")}</p>
              ) : null}
            </div>
            <div className={styles.pride}>
              <p className={styles.posterEyebrow}>{t("benchmarkLabel")}</p>
              <p className={styles.prideFigure}>
                <span className={styles.prideValue}>
                  {result ? formatAnchorBpm(result.anchorBpm) : "—"}
                </span>
                {result ? <span className={styles.prideUnit}>bpm</span> : null}
              </p>
              {result ? (
                <p className={styles.bandCaption}>{benchmark}</p>
              ) : null}
            </div>
          </div>
          <div className={styles.posterZones}>
            <div className={styles.zoneHeading}>
              <h3>{t("zonesTitle")}</h3>
              <span>bpm</span>
            </div>
            <ol className={styles.zoneStrip} data-count="1">
              <li className={styles.zoneCell} data-zone="z2">
                <span className={styles.zoneSwatch}>Z2</span>
                <span className={styles.zoneName}>{t("zoneName")}</span>
                <span className={styles.zoneFigure}>
                  {result ? `${result.bpmMin}–${result.bpmMax}` : "—"}
                </span>
                <span className={styles.zonePercent}>
                  {result ? `${result.percentMin}–${result.percentMax}%` : "—"}
                </span>
              </li>
            </ol>
          </div>
          <p className={styles.talkTest}>{t("talkTest")}</p>
        </div>
      </section>
      <div className={`${styles.posterActions} z2-share-actions`}>
        <Select value={method} onValueChange={onMethod}>
          <SelectTrigger
            aria-label={t("switchModel")}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            {methodLabel}
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {METHODS.map((key) => (
              <SelectItem key={key} value={key}>
                {tClient(`inputs.method.options.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <a
          href={zonesHref}
          className={cn(buttonVariants({ size: "lg" }), accentButtonClass)}
        >
          {t("viewZones")}
        </a>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onPrint}
          disabled={!result}
        >
          <Printer className="size-3.5" aria-hidden />
          {t("print")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => void onShare()}
          disabled={!result}
        >
          <Share2 className="size-3.5" aria-hidden />
          {copied ? t("copiedLink") : t("share")}
        </Button>
      </div>
      {shareError ? (
        <p role="alert" className={styles.shareError}>
          {t("shareError")}
        </p>
      ) : null}
    </div>
  );
}
