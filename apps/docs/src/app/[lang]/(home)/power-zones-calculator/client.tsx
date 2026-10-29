"use client";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localePrefix } from "@/lib/locale-url";
import {
  calculatePowerZones,
  POWER_ZONE_MODELS,
  POWER_ZONE_MODEL_NAMES,
  type PowerZoneModel,
} from "@/lib/power-zones";
import { trackToolEvent } from "@/lib/tool-analytics";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import { type PowerZonesPrefill } from "@/lib/zone-tool-links";
import styles from "./power-zones-calculator.module.css";

type BaseKey = "FTP" | "CP";

function parsePositiveNumber(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 2000) return null;
  return n;
}

export function PowerZonesCalculatorClient({
  hero,
  initial,
  methods,
}: {
  hero: ReactNode;
  initial: PowerZonesPrefill;
  methods?: ReactNode;
}) {
  const t = useTranslations("powerZonesCalculator.client");
  const locale = useLocale();
  const prefix = localePrefix(locale);
  const [model, setModel] = useState<PowerZoneModel>(initial.model ?? "COGGAN");
  const [baseKey, setBaseKey] = useState<BaseKey>(initial.baseType ?? "FTP");
  const [baseValue, setBaseValue] = useState(initial.base ?? "");
  const [example, setExample] = useState(initial.example);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareError, setShareError] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    if (initial.base && window.location.hash === "#result") {
      resultRef.current?.scrollIntoView({ block: "start" });
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [initial.base]);

  const base = useMemo(() => parsePositiveNumber(baseValue), [baseValue]);
  const zones = useMemo(() => {
    if (!base) return null;
    return calculatePowerZones(model, base);
  }, [base, model]);
  const roundedBase = base == null ? null : Math.round(base);
  const zoneCount = model === "STRYD" ? 5 : 7;
  const referenceLabel = t(`inputs.baseType.options.${baseKey.toLowerCase()}`);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (roundedBase == null) {
      url.search = "";
    } else {
      const nextParams = new URLSearchParams();
      nextParams.set("model", model.toLowerCase());
      nextParams.set("baseType", baseKey.toLowerCase());
      nextParams.set("base", String(roundedBase));
      if (example) nextParams.set("example", "1");
      url.search = nextParams.toString();
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [model, baseKey, roundedBase, example]);

  const warnings = useMemo(() => {
    if (!base || (base >= 50 && base <= 700)) return [];
    return [t("warnings.baseValue")];
  }, [base, t]);

  useInstantToolAnalytics(
    "power_zones_calculator",
    "calculate_power_zones",
    Boolean(zones),
  );

  const zoneName = useCallback(
    (order: number) => {
      const key = model === "COGGAN" ? "FRIEL" : model;
      return t(`zoneNames.${key}.z${order}`);
    },
    [model, t],
  );

  const loadExample = () => {
    setModel("COGGAN");
    setBaseKey("FTP");
    setBaseValue("250");
    setExample(true);
    setShareError(false);
    setCopiedLink(false);
  };

  const onShare = async () => {
    if (roundedBase == null) return;
    setShareError(false);
    const url = new URL(window.location.href);
    url.searchParams.set("model", model.toLowerCase());
    url.searchParams.set("baseType", baseKey.toLowerCase());
    url.searchParams.set("base", String(roundedBase));
    if (example) url.searchParams.set("example", "1");
    else url.searchParams.delete("example");
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
          title: t("scorecard.summaryTitle"),
          url: href,
        });
        trackToolEvent("tool_result_copied", "power_zones_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(href);
      trackToolEvent("tool_result_copied", "power_zones_calculator", {
        action: "copy_share_link",
      });
      setCopiedLink(true);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setCopiedLink(false), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "power_zones_calculator", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      setCopiedLink(false);
      setShareError(true);
    }
  };

  const onPrint = useCallback(() => {
    trackToolEvent("tool_result_copied", "power_zones_calculator", {
      action: "print_result_card",
    });
    window.print();
  }, []);

  const guideHref = `${prefix}/docs/metrics/power/zones${
    roundedBase == null ? "" : `?model=${model.toLowerCase()}`
  }`;

  return (
    <>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
          <h2 className={styles.boardLabel}>{t("panel.title")}</h2>
          <p className={styles.boardLead}>{t("panel.subtitle")}</p>
          <ol className={styles.panelSteps}>
            {(["reference", "model", "apply"] as const).map((key, index) => (
              <li key={key}>
                <span className={styles.stepIndex}>{index + 1}</span>
                <span>{t(`panel.steps.${key}`)}</span>
              </li>
            ))}
          </ol>
          <div className={styles.formStack}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="pz-model">
                {t("inputs.model.label")}
              </label>
              <Select
                value={model}
                onValueChange={(value) => {
                  setModel(value as PowerZoneModel);
                  setExample(false);
                }}
              >
                <SelectTrigger id="pz-model" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      ["cycling", ["COGGAN", "FRIEL"]],
                      ["running", ["VANCE", "STRYD"]],
                    ] as const
                  ).map(([sport, models]) => (
                    <SelectGroup key={sport}>
                      <SelectLabel>{t(`sports.${sport}`)}</SelectLabel>
                      {models.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`inputs.model.options.${key.toLowerCase()}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className={styles.hint}>
                {t(`inputs.model.notes.${model.toLowerCase()}`)}
              </p>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="pz-reference">
                  {t("inputs.baseType.label")}
                </label>
                <Select
                  value={baseKey}
                  onValueChange={(value) => {
                    setBaseKey(value as BaseKey);
                    setExample(false);
                  }}
                >
                  <SelectTrigger id="pz-reference" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FTP">
                      {t("inputs.baseType.options.ftp")}
                    </SelectItem>
                    <SelectItem value="CP">
                      {t("inputs.baseType.options.cp")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="pz-watts">
                  {t("inputs.baseValue.label")}
                </label>
                <div className={styles.inputWithUnit}>
                  <Input
                    id="pz-watts"
                    aria-describedby={
                      baseValue.trim() !== "" && !base
                        ? "pz-input-error"
                        : undefined
                    }
                    inputMode="numeric"
                    placeholder={t("inputs.baseValue.placeholder")}
                    value={baseValue}
                    onChange={(event) => {
                      setBaseValue(event.target.value);
                      setExample(false);
                    }}
                    aria-invalid={baseValue.trim() !== "" && !base}
                  />
                  <span aria-hidden>W</span>
                </div>
              </div>
            </div>
            {baseValue.trim() !== "" && !base ? (
              <p id="pz-input-error" role="alert" className={styles.inputError}>
                {t("warnings.invalid")}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className={styles.exampleButton}
              onClick={loadExample}
            >
              {t("scorecard.exampleAction")}
            </Button>
            <div className={styles.referenceHelp}>
              <p>{t("panel.needReference")}</p>
              <a href={`${prefix}/ftp-calculator`}>
                {t("scorecard.ftpLink")} <span aria-hidden>→</span>
              </a>
              <a href={`${prefix}/critical-power-calculator`}>
                {t("scorecard.cpLink")} <span aria-hidden>→</span>
              </a>
            </div>
            {warnings.length > 0 ? (
              <div role="status" className={styles.alert}>
                {warnings[0]}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className={styles.posterWrap}>
        <section
          id="result"
          ref={resultRef}
          tabIndex={-1}
          aria-live="polite"
          aria-labelledby="pz-score-title"
          className={styles.poster}
        >
          <div className={styles.posterSheet}>
            <div className={styles.posterBrand}>
              <h2 id="pz-score-title" className={styles.posterHeading}>
                {t("scorecard.summaryTitle")}
              </h2>
              <p className={styles.posterMark}>Trainingload.ai</p>
            </div>
            <div className={styles.posterMain}>
              <div>
                <p className={styles.posterEyebrow}>{referenceLabel}</p>
                <p
                  className={styles.posterWatts}
                  data-wide={roundedBase != null && roundedBase >= 1000}
                >
                  <span className={styles.posterNumber}>
                    {roundedBase ?? "—"}
                  </span>
                  {roundedBase == null ? null : (
                    <span className={styles.posterUnit}>W</span>
                  )}
                </p>
                <p className={styles.posterProtocol}>
                  {roundedBase == null
                    ? t("scorecard.empty")
                    : t("scorecard.context", {
                        reference: referenceLabel,
                        model: POWER_ZONE_MODEL_NAMES[model],
                        count: zoneCount,
                      })}
                </p>
                {example && zones ? (
                  <p className={styles.exampleBadge}>
                    {t("scorecard.exampleBadge")}
                  </p>
                ) : null}
              </div>
              <div className={styles.pride}>
                <p className={styles.posterEyebrow}>
                  {t("scorecard.modelLabel")}
                </p>
                <p className={styles.prideValue}>
                  {POWER_ZONE_MODEL_NAMES[model]}
                </p>
                <p className={styles.modelContext}>
                  {t(
                    `sports.${model === "COGGAN" || model === "FRIEL" ? "cycling" : "running"}`,
                  )}{" "}
                  · {t("scorecard.zoneCount", { count: zoneCount })}
                </p>
              </div>
            </div>
            <div className={styles.posterZones}>
              <table className={styles.zoneTable}>
                <caption className="sr-only">
                  {t("scorecard.tableCaption")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t("table.zone")}</th>
                    <th scope="col">{t("table.name")}</th>
                    <th scope="col">{t("table.power")}</th>
                    <th scope="col">{t("table.percent")}</th>
                  </tr>
                </thead>
                <tbody>
                  {zones ? (
                    zones.map((zone) => (
                      <tr key={zone.order} data-zone={`z${zone.order}`}>
                        <th scope="row">
                          <span className={styles.zoneCode}>
                            Z{zone.order}
                          </span>
                        </th>
                        <td>{zoneName(zone.order)}</td>
                        <td className={styles.zoneFigure}>{zone.wattLabel}</td>
                        <td className={styles.zonePercent}>
                          {zone.percentLabel}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={styles.zoneEmpty} colSpan={4}>
                        {t("table.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className={styles.zoneCaption}>
                {t(`scorecard.caption.${model.toLowerCase()}`)}
              </p>
            </div>
          </div>
        </section>
        <div className={`${styles.posterActions} pz-share-actions`}>
          <Select
            value={model}
            onValueChange={(value) => {
              setModel(value as PowerZoneModel);
              setExample(false);
            }}
          >
            <SelectTrigger
              aria-label={t("scorecard.switchModel")}
              className={styles.modelAction}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POWER_ZONE_MODELS.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`inputs.model.options.${key.toLowerCase()}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <a href={guideHref} className={styles.secondaryAction}>
            {t("scorecard.guide")}
          </a>
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
            {copiedLink ? t("scorecard.copied") : t("scorecard.copyLink")}
          </Button>
        </div>
        {shareError ? (
          <p role="alert" className={styles.inputError}>
            {t("scorecard.shareError")}
          </p>
        ) : null}
      </div>
      {methods}
    </>
  );
}
