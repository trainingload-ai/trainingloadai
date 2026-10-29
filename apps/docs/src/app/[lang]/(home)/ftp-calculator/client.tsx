"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Loader2, Printer, Share2, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ToolFileDropzone } from "@/components/ToolClientControls";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import styles from "./ftp-calculator.module.css";
import { fileAnalyticsProperties, getErrorDebugInfo } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import {
  bodyMassLimits,
  bodyMassToKilograms,
  buildFtpFieldSearch,
  cogganZones,
  estimateFieldFtp,
  formatCanonicalMass,
  formatDisplayMass,
  FTP_FIELD_PROTOCOLS,
  FTP_TEST_POWER_MAX_W,
  ftpWattsPerKg,
  ftpWkgBand,
  kilogramsToPounds,
  parseFtpFieldQuery,
  type CogganZoneWatts,
  type FtpFieldProtocol,
  type FtpUnitSystem,
} from "@/lib/ftp-field";
import { localePrefix } from "@/lib/locale-url";
import { captureToolFailure } from "@/lib/tool-sentry";
import { elapsedMilliseconds, trackToolEvent } from "@/lib/tool-analytics";
import { DOCS_BROWSER_API_BASE_URL } from "@/lib/docs-api-base-url";
import {
  appendErrorReference,
  buildToolRequestError,
  createClientTraceId,
  getToolRequestErrorMeta,
  isFileInputToolRequestError,
  ToolRequestError,
} from "@/lib/tool-request-error";
import { useInstantToolAnalytics } from "@/lib/use-instant-tool-analytics";
import { parsePowerZonesPrefill, powerZonesHref } from "@/lib/zone-tool-links";
import {
  calculatePowerZones,
  POWER_ZONE_MODELS,
  POWER_ZONE_MODEL_NAMES,
  type PowerZoneModel,
} from "@/lib/power-zones";

function UnitInput({
  suffix,
  className,
  ...props
}: { suffix: string } & ComponentProps<typeof Input>) {
  return (
    <div className={styles.inputShell}>
      <Input className={cn("pr-11", className)} {...props} />
      <span className={styles.inputSuffix} aria-hidden="true">
        {suffix}
      </span>
    </div>
  );
}

const accentButtonClass =
  "bg-brand text-brand-foreground hover:bg-brand/85";

type EstimateCpTestType = "three_nine" | "thirty_min";

const FTP_FILE_SPORT = "CYCLING" as const;

type EstimateCpResult = {
  fileName: string;
  testType: EstimateCpTestType;
  cp: number;
  ftp: number;
  wPrimeJ: number;
  cpWKg: number | null;
  durationSec: number;
  derived: {
    p3m: number;
    pLong: number;
    longDurationSec: number;
  };
};

function formatNumber(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function formatSeconds(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function extractMessage(maybe: unknown) {
  if (typeof maybe === "string" && maybe.trim()) return maybe;
  if (Array.isArray(maybe)) {
    const picked = maybe
      .map((x) => (typeof x === "string" ? x : ""))
      .filter(Boolean);
    if (picked.length) return picked.join("；");
  }
  return null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parsePositiveNumber(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatZoneWatts(
  zone: CogganZoneWatts,
  labels: {
    under: (watts: number) => string;
    over: (watts: number) => string;
    range: (min: number, max: number) => string;
  },
) {
  if (zone.maxWatts == null && zone.minWatts != null) {
    return labels.over(zone.minWatts);
  }
  if (zone.minWatts == null && zone.maxWatts != null) {
    return labels.under(zone.maxWatts);
  }
  if (zone.minWatts != null && zone.maxWatts != null) {
    return labels.range(zone.minWatts, zone.maxWatts);
  }
  return "—";
}

function CogganZoneList({ ftp }: { ftp: number }) {
  const t = useTranslations("estimateCp.page.fieldResult");
  const zones = cogganZones(ftp);
  if (!zones) return null;

  return (
    <div className="mt-3">
      <h3 className="text-xs font-medium text-foreground">{t("zonesTitle")}</h3>
      <ul className="mt-1.5 grid gap-x-4 sm:grid-cols-2">
        {zones.map((zone) => {
          const isThreshold = zone.id === "z4";
          return (
            <li
              key={zone.id}
              className="flex items-baseline justify-between gap-3 border-t border-border/70 py-1.5 text-xs"
            >
              <span
                className={
                  isThreshold
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {t(`zones.${zone.id}`)}
                <span className="ml-1.5 tabular-nums">{zone.percentLabel}%</span>
              </span>
              <span className="font-mono tabular-nums text-foreground">
                {formatZoneWatts(zone, {
                  under: (watts) => t("zoneUnder", { watts }),
                  over: (watts) => t("zoneOver", { watts }),
                  range: (min, max) => t("zoneRange", { min, max }),
                })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {t("zonesNote")}
      </p>
    </div>
  );
}

function FtpHandoff({ ftp }: { ftp: number }) {
  const t = useTranslations("estimateCp.page");
  const prefix = localePrefix(useLocale());

  return (
    <div className={`${styles.posterActions} ftp-share-actions`}>
      <a href={powerZonesHref(prefix, ftp)} className={styles.primaryAction}>
        {t("fieldResult.handoff")}
      </a>
      <a
        href={`${prefix}/critical-power-calculator`}
        className={styles.secondaryAction}
      >
        {t("links.criticalPower")}
      </a>
      <a
        href={`${prefix}/lactate-threshold-calculator`}
        className={styles.secondaryAction}
      >
        {t("links.lactate")}
      </a>
    </div>
  );
}

function CyclingWkgLine({
  ftp,
  weightKg,
  hintWhenEmpty,
}: {
  ftp: number;
  weightKg: number | null;
  hintWhenEmpty: boolean;
}) {
  const t = useTranslations("estimateCp.page.fieldResult");
  const wkg = weightKg == null ? null : ftpWattsPerKg(ftp, weightKg);
  const band = wkg == null ? null : ftpWkgBand(wkg);

  if (wkg == null || band == null) {
    if (!hintWhenEmpty) return null;
    return (
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {t("wkgMissing")}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-foreground">
        <span className="font-mono font-semibold tabular-nums">
          {formatNumber(wkg, 2)} W/kg
        </span>
        <span className="text-muted-foreground"> · {t(`categories.${band}`)}</span>
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {t("categoryNote")}
      </p>
    </div>
  );
}

function FtpShareCard({
  ftp,
  protocolLabel,
  weightKg,
  showWeightHint,
  zoneModel,
  onZoneModelChange,
}: {
  ftp: number | null;
  protocolLabel: string;
  weightKg: number | null;
  showWeightHint: boolean;
  zoneModel: PowerZoneModel;
  onZoneModelChange: (model: PowerZoneModel) => void;
}) {
  const t = useTranslations("estimateCp.page");
  const tZones = useTranslations("powerZonesCalculator.client");
  const locale = useLocale();
  const prefix = localePrefix(locale);
  const [copied, setCopied] = useState(false);
  const zones = ftp == null ? null : calculatePowerZones(zoneModel, ftp);
  const modelName = POWER_ZONE_MODEL_NAMES[zoneModel];
  const zoneName = (order: number) =>
    tZones(
      `zoneNames.${zoneModel === "COGGAN" ? "FRIEL" : zoneModel}.z${order}`,
    );
  const wkg =
    ftp == null || weightKg == null ? null : ftpWattsPerKg(ftp, weightKg);
  const band = wkg == null ? null : ftpWkgBand(wkg);

  const selectZoneModel = (value: string) => {
    const model = POWER_ZONE_MODELS.find((item) => item === value);
    if (!model) return;
    onZoneModelChange(model);
    setCopied(false);
    const url = new URL(window.location.href);
    url.searchParams.set("model", model.toLowerCase());
    window.history.replaceState(window.history.state, "", url);
  };

  const onShare = async () => {
    const shareUrl = new URL(window.location.href);
    shareUrl.hash = "result";
    const url = shareUrl.toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: t("fieldResult.summaryTitle"), url });
        trackToolEvent("tool_result_copied", "ftp_calculator", {
          action: "share_result_card",
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      trackToolEvent("tool_result_copied", "ftp_calculator", {
        action: "copy_share_link",
      });
      setCopied(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackToolEvent("tool_failed", "ftp_calculator", {
        action: "copy_share_link",
        error_code: "clipboard_failed",
      });
      setCopied(false);
      return;
    }
    window.setTimeout(() => setCopied(false), 1600);
  };

  const onPrint = useCallback(() => {
    trackToolEvent("tool_result_copied", "ftp_calculator", {
      action: "print_result_card",
    });
    window.print();
  }, []);

  return (
    <div className={styles.posterWrap}>
      <section id="result" aria-live="polite" className={styles.poster}>
        <div className={styles.posterSheet}>
          <div className={styles.posterBrand}>
            <h2 className={styles.posterHeading}>
              {t("fieldResult.summaryTitle")}
            </h2>
            <p className={styles.posterMark}>Trainingload.ai</p>
          </div>
          <div className={styles.posterMain}>
            <div className={styles.posterPower}>
              <p className={styles.posterEyebrow}>
                {t("fieldResult.ftpLabel")}
              </p>
              <p
                className={styles.posterWatts}
                data-wide={ftp != null && ftp >= 1000}
              >
                <span className={styles.posterNumber}>
                  {ftp == null ? "—" : ftp}
                </span>
                {ftp == null ? null : (
                  <span className={styles.posterUnit}>W</span>
                )}
              </p>
              <p className={styles.posterProtocol}>{protocolLabel}</p>
            </div>
            <div className={styles.pride}>
              <p className={styles.posterEyebrow}>
                {t("fieldResult.wkgLabel")}
              </p>
              <p className={styles.prideFigure}>
                <span className={styles.prideValue}>
                  {wkg == null ? "—" : formatNumber(wkg, 2)}
                </span>
                <span className={styles.prideUnit}>W/kg</span>
              </p>
              {band != null ? (
                <div className={styles.prideClassification}>
                  <p className={styles.prideBand}>
                    {t(`fieldResult.categories.${band}`)}
                  </p>
                  <p className={styles.bandCaption}>
                    {t("fieldResult.bandLabel")}
                  </p>
                </div>
              ) : showWeightHint ? (
                <p className={styles.posterHint}>
                  {t("fieldResult.wkgMissing")}
                </p>
              ) : null}
            </div>
          </div>
          {ftp == null ? (
            <p className={styles.formulaEcho}>{t("fieldResult.empty")}</p>
          ) : null}
          {zones ? (
            <div className={styles.posterZones}>
              <div className={styles.zoneHeading}>
                <h3>
                  {t("fieldResult.modelZonesTitle", { model: modelName })}
                </h3>
                <span>{t("fieldResult.wattsCol")} · W</span>
              </div>
              <ol className={styles.zoneStrip} data-count={zones.length}>
                {zones.map((zone) => {
                  return (
                    <li
                      key={zone.order}
                      className={styles.zoneCell}
                      data-zone={`z${zone.order}`}
                      aria-label={`Z${zone.order} ${zoneName(zone.order)} ${zone.wattLabel}, ${zone.percentLabel} FTP`}
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
                  );
                })}
              </ol>
              <p className={styles.zoneCaption}>
                {t("fieldResult.intensityCaption")}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <div className={`${styles.posterActions} ftp-share-actions`}>
        <Select value={zoneModel} onValueChange={selectZoneModel}>
          <SelectTrigger
            aria-label={t("fieldResult.switchZones")}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            {t("fieldResult.switchZones")}
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {POWER_ZONE_MODELS.map((model) => (
              <SelectItem key={model} value={model}>
                {tZones(`inputs.model.options.${model.toLowerCase()}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ftp != null ? (
          <a
            href={powerZonesHref(prefix, ftp, zoneModel)}
            className={cn(buttonVariants({ size: "lg" }), accentButtonClass)}
          >
            {t("fieldResult.handoff")}
          </a>
        ) : null}
        <Button type="button" variant="outline" size="lg" onClick={onPrint}>
          <Printer className="size-3.5" aria-hidden />
          {t("fieldResult.print")}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onShare}>
          <Share2 className="size-3.5" aria-hidden />
          {copied ? t("fieldResult.copied") : t("fieldResult.copyLink")}
        </Button>
      </div>
    </div>
  );
}

export function FtpCalculatorClient({ hero }: { hero: ReactNode }) {
  const [zoneModel, setZoneModel] = useState<PowerZoneModel>("COGGAN");
  const t = useTranslations("estimateCp.page");
  const locale = useLocale();

  const [protocol, setProtocol] = useState<FtpFieldProtocol>("20MIN");
  const [powerText, setPowerText] = useState("");
  const [weightText, setWeightText] = useState("");
  const [weightKgText, setWeightKgText] = useState("");
  const [units, setUnits] = useState<FtpUnitSystem>("metric");
  const [fieldReady, setFieldReady] = useState(false);

  // Browser Back from power zones remounts this page. The typed values live in
  // the current history entry so they return with the URL. Read them after SSR
  // so the server HTML does not depend on window.location.
  useLayoutEffect(() => {
    const query = parseFtpFieldQuery(window.location.search);
    const model = parsePowerZonesPrefill(window.location.search).model;
    /* eslint-disable react-hooks/set-state-in-effect -- restore the shared URL after SSR */
    if (model) setZoneModel(model);
    if (query.protocol) setProtocol(query.protocol);
    if (query.power) setPowerText(query.power);
    if (query.units) setUnits(query.units);
    if (query.weight) {
      const kg = Number(query.weight);
      setWeightKgText(query.weight);
      setWeightText(
        query.units === "imperial" ? formatDisplayMass(kilogramsToPounds(kg)) : query.weight,
      );
    }
    setFieldReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!fieldReady) return;
    const nextSearch = buildFtpFieldSearch(window.location.search, {
      protocol,
      power: powerText,
      weight: weightKgText,
      units,
    });
    const nextUrl = `${window.location.pathname}${nextSearch}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
    window.dispatchEvent(new Event("ftp-field-updated"));
  }, [fieldReady, powerText, protocol, units, weightKgText]);

  const [testType, setTestType] = useState<EstimateCpTestType>("thirty_min");
  const [fileWeightText, setFileWeightText] = useState("");
  const [fileWeightKgText, setFileWeightKgText] = useState("");
  const [inputTab, setInputTab] = useState<"field" | "file">("field");

  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<EstimateCpResult[] | null>(null);

  const testPower = useMemo(() => parsePositiveNumber(powerText), [powerText]);
  const powerInvalid =
    powerText.trim() !== "" &&
    (testPower == null || testPower > FTP_TEST_POWER_MAX_W);
  const weightRaw = useMemo(
    () => parsePositiveNumber(weightText),
    [weightText],
  );
  const weightLimits = bodyMassLimits(units);
  const canonicalKg = useMemo(
    () => parsePositiveNumber(weightKgText),
    [weightKgText],
  );
  const weightInvalid =
    weightText.trim() !== "" &&
    (weightRaw == null ||
      weightRaw < weightLimits.min ||
      weightRaw > weightLimits.max);
  const bodyWeightKg = weightInvalid ? null : canonicalKg;

  function onWeightInput(value: string) {
    setWeightText(value);
    const parsed = parsePositiveNumber(value);
    setWeightKgText(
      parsed == null
        ? ""
        : formatCanonicalMass(bodyMassToKilograms(parsed, units)),
    );
  }

  function onFileWeightInput(value: string) {
    setFileWeightText(value);
    const parsed = parsePositiveNumber(value);
    setFileWeightKgText(
      parsed == null
        ? ""
        : formatCanonicalMass(bodyMassToKilograms(parsed, units)),
    );
  }

  function displayMassFromKg(kgText: string, next: FtpUnitSystem) {
    const kg = Number(kgText);
    if (!kgText.trim() || !Number.isFinite(kg) || kg <= 0) return null;
    return formatDisplayMass(next === "imperial" ? kilogramsToPounds(kg) : kg);
  }

  function selectUnits(next: FtpUnitSystem) {
    if (next === units) return;
    const fieldDisplay = displayMassFromKg(weightKgText, next);
    if (fieldDisplay != null) setWeightText(fieldDisplay);
    const fileDisplay = displayMassFromKg(fileWeightKgText, next);
    if (fileDisplay != null) setFileWeightText(fileDisplay);
    setUnits(next);
  }

  function onUnitKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? "imperial" : "metric";
    selectUnits(next);
    document.getElementById(next === "metric" ? "ftp-units-metric" : "ftp-units-imperial")?.focus();
  }

  const ftp = useMemo(() => {
    if (testPower == null || testPower > FTP_TEST_POWER_MAX_W) return null;
    return estimateFieldFtp(testPower, protocol);
  }, [protocol, testPower]);

  useInstantToolAnalytics("ftp_calculator", "estimate_field_ftp", ftp != null);

  const fileWeightKg = useMemo(() => {
    const n = Number(fileWeightKgText);
    return Number.isFinite(n) && n >= 1 ? n : undefined;
  }, [fileWeightKgText]);

  const onSubmit = useCallback(async () => {
    const startedAt = performance.now();
    trackToolEvent("tool_started", "ftp_calculator", {
      action: "estimate_ftp",
      ...fileAnalyticsProperties(file),
    });

    setError(null);
    setResults(null);

    if (!file) {
      trackToolEvent("tool_failed", "ftp_calculator", {
        action: "estimate_ftp",
        error_code: "file_missing",
      });
      setError(t("errors.noFile"));
      setInputTab("file");
      return;
    }

    if (fileWeightText.trim()) {
      const kg = Number(fileWeightKgText);
      if (!fileWeightKgText.trim() || !Number.isFinite(kg) || kg < 1) {
        trackToolEvent("tool_failed", "ftp_calculator", {
          action: "estimate_ftp",
          error_code: "invalid_input",
          ...fileAnalyticsProperties(file),
        });
        setError(t("errors.invalidWeight"));
        setInputTab("file");
        return;
      }
    }

    const url = `${DOCS_BROWSER_API_BASE_URL}/public/estimate-cp`;
    const clientTraceId = createClientTraceId("ftp");

    const formData = new FormData();
    formData.append("files", file, file.name);
    formData.append("testType", testType);
    formData.append("sportType", FTP_FILE_SPORT);
    if (fileWeightKg) formData.append("weightKg", String(fileWeightKg));

    setIsSubmitting(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
          "x-lang": locale,
          "x-client-trace-id": clientTraceId,
        },
      });

      if (!res.ok) {
        throw await buildToolRequestError(
          res,
          t("errors.requestFailed", { status: res.status }),
          clientTraceId,
        );
      }

      const text = await res.text();
      const json = text ? safeJsonParse(text) : null;
      const maybeWrapped =
        json && typeof json === "object"
          ? (json as {
              code?: number;
              message?: unknown;
              data?: unknown;
            })
          : null;
      const wrappedCode = maybeWrapped?.code;
      const wrappedMessage =
        extractMessage(maybeWrapped?.message) ||
        extractMessage(
          (maybeWrapped?.data as { message?: unknown } | undefined)?.message,
        );

      if (typeof wrappedCode === "number" && wrappedCode !== 200) {
        throw new Error(wrappedMessage || t("errors.businessFailed"));
      }

      const data = Array.isArray(maybeWrapped?.data)
        ? maybeWrapped.data
        : Array.isArray(json)
          ? json
          : null;
      if (!data) {
        if (!json && text) {
          throw new Error(t("errors.parseFailed"));
        }
        throw new Error(wrappedMessage || t("errors.badData"));
      }

      setResults(data as EstimateCpResult[]);
      trackToolEvent("tool_completed", "ftp_calculator", {
        action: "estimate_ftp",
        duration_ms: elapsedMilliseconds(startedAt),
        ...fileAnalyticsProperties(file),
      });
    } catch (e) {
      const errorInfo = getErrorDebugInfo(e);
      const requestErrorInfo = getToolRequestErrorMeta(e);
      const isFileInputError = isFileInputToolRequestError(e);
      const reason =
        e instanceof TypeError
          ? "network"
          : isFileInputError
            ? "file_input"
            : "server_or_parse";
      const analyticsProps = fileAnalyticsProperties(file);

      console[isFileInputError ? "warn" : "error"](
        "[tool_failed] ftp_calculator.estimate_ftp",
        {
          action: "estimate_ftp",
          endpoint: url,
          reason,
          sport_type: FTP_FILE_SPORT,
          test_type: testType,
          tool: "ftp_calculator",
          ...analyticsProps,
          ...errorInfo,
          ...requestErrorInfo,
        },
      );

      captureToolFailure({
        action: "estimate_ftp",
        endpoint: url,
        error: e,
        properties: {
          sport_type: FTP_FILE_SPORT,
          test_type: testType,
          ...analyticsProps,
          ...requestErrorInfo,
        },
        reason,
        tool: "ftp_calculator",
      });

      trackToolEvent("tool_failed", "ftp_calculator", {
        action: "estimate_ftp",
        duration_ms: elapsedMilliseconds(startedAt),
        error_code: isFileInputError
          ? "invalid_file"
          : e instanceof TypeError
            ? "request_failed"
            : "response_invalid",
        ...analyticsProps,
      });
      if (e instanceof TypeError) {
        setError(appendErrorReference(t("errors.network"), clientTraceId));
        setInputTab("file");
        return;
      }
      const message = e instanceof Error ? e.message : t("errors.unknown");
      const ref =
        e instanceof ToolRequestError
          ? e.meta.clientTraceId || clientTraceId
          : clientTraceId;
      setError(appendErrorReference(message, ref));
      setInputTab("file");
    } finally {
      setIsSubmitting(false);
    }
  }, [file, fileWeightKg, fileWeightKgText, fileWeightText, locale, t, testType]);

  return (
    <>
      <div className={styles.hero}>
        {hero}
        <section id="calculator" className={styles.board}>
        <div className={styles.boardHead}>
          <h2 className={styles.boardLabel}>{t("title")}</h2>
          <div
            role="radiogroup"
            aria-label={t("manual.unitsLabel")}
            className={styles.unitSwitch}
          >
            <Button
              id="ftp-units-metric"
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
              id="ftp-units-imperial"
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
        <Tabs
          value={inputTab}
          onValueChange={(value) => {
            if (value === "field" || value === "file") setInputTab(value);
          }}
        >
        <TabsList
          aria-label={t("manual.tablist")}
          className={cn(styles.tabs, "grid h-auto w-full grid-cols-2 rounded-none bg-transparent p-0")}
        >
          <TabsTrigger
            value="field"
            className={cn(
              styles.tab,
              "h-auto flex-1 rounded-none shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none",
            )}
          >
            {t("manual.title")}
          </TabsTrigger>
          <TabsTrigger
            value="file"
            className={cn(
              styles.tab,
              "h-auto flex-1 rounded-none shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none",
            )}
          >
            {t("fileOption.tab")}
          </TabsTrigger>
        </TabsList>
        <p className={styles.boardLead}>
          {inputTab === "field" ? t("manual.lead") : t("fileOption.lead")}
        </p>
        <TabsContent value="field" className={styles.formStack}>
        <ol className={styles.stepList}>
          {(
            [
              ["test", t("howTo.steps.test.title"), t("howTo.steps.test.body")],
              ["card", t("howTo.steps.card.title"), t("howTo.steps.card.body")],
              ["zones", t("howTo.steps.zones.title"), t("howTo.steps.zones.body")],
            ] as const
          ).map(([key, title, body], index) => (
            <li key={key} className={styles.stepItem}>
              <span className={styles.stepIndex}>{index + 1}</span>
              <p>
                <strong>{title}</strong> {body}
              </p>
            </li>
          ))}
        </ol>

          <FtpSelect
            id="ftp-protocol"
            label={t("manual.protocol")}
            value={protocol}
            onValueChange={(value) => setProtocol(value as FtpFieldProtocol)}
            options={FTP_FIELD_PROTOCOLS.map((key) => ({
              value: key,
              label: t(`manual.protocols.${key}`),
            }))}
          />

          <div className={styles.numberGrid}>
            <div className={styles.field}>
              <Label htmlFor="ftp-power">{t("manual.powerLabel")}</Label>
              <UnitInput
                id="ftp-power"
                suffix="W"
                inputMode="decimal"
                value={powerText}
                placeholder={t("manual.powerPlaceholder")}
                onChange={(event) => setPowerText(event.target.value)}
                aria-invalid={powerInvalid}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="ftp-weight">
                {units === "imperial" ? t("manual.weightLabelLb") : t("manual.weightLabel")}{" "}
                <span className={styles.fieldOptional}>{t("manual.weightOptional")}</span>
              </Label>
              <UnitInput
                id="ftp-weight"
                suffix={units === "imperial" ? "lb" : "kg"}
                inputMode="decimal"
                value={weightText}
                placeholder={
                  units === "imperial"
                    ? t("manual.weightPlaceholderLb")
                    : t("manual.weightPlaceholder")
                }
                onChange={(event) => onWeightInput(event.target.value)}
                aria-invalid={weightInvalid}
              />
            </div>
          </div>
          {powerInvalid ? (
            <p role="alert" className={styles.alert}>
              {t("manual.invalidPower")}
            </p>
          ) : null}
          {weightInvalid ? (
            <p role="alert" className={styles.alert}>
              {units === "imperial" ? t("manual.invalidWeightLb") : t("manual.invalidWeight")}
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="file" className={styles.filePanel}>
        <div className={styles.fileGrid}>
          <FtpSelect
            id="ftp-file-protocol"
            label={t("fields.testType")}
            value={testType}
            onValueChange={(value) => setTestType(value as EstimateCpTestType)}
            options={[
              { value: "thirty_min", label: t("testTypes.thirty_min") },
              { value: "three_nine", label: t("testTypes.three_nine") },
            ]}
          />
          <div className={styles.field}>
            <Label htmlFor="ftp-file-weight">
              {units === "imperial" ? t("fields.weightLb") : t("fields.weightKg")}{" "}
              <span className={styles.fieldOptional}>{t("fields.optional")}</span>
            </Label>
            <UnitInput
              id="ftp-file-weight"
              suffix={units === "imperial" ? "lb" : "kg"}
              inputMode="decimal"
              value={fileWeightText}
              onChange={(event) => onFileWeightInput(event.target.value)}
              placeholder={
                units === "imperial"
                  ? t("fields.weightPlaceholderLb")
                  : t("fields.weightPlaceholder")
              }
            />
          </div>
        </div>

        <div className={styles.dropzone}>
          <ToolFileDropzone
            label={t("upload.label")}
            pickStrong={t("upload.pickStrong")}
            pickRest={t("upload.pickRest")}
            supported={t("upload.supported")}
            file={file}
            accept=".gpx,.tcx,.fit"
            trackingTool="ftp_calculator"
            onFileChange={(nextFile) => {
              setFile(nextFile);
              setError(null);
              setResults(null);
            }}
            dropzoneAria={t("upload.dropzoneAria")}
            supportedId="estimate-cp-upload-supported"
            removeFileAria={
              file
                ? t("upload.removeFileAria", { filename: file.name })
                : undefined
            }
          />
        </div>

        {error ? (
          <div role="alert" aria-live="assertive" className={styles.alert}>
            {error}
          </div>
        ) : null}
        <Button
          type="button"
          size="lg"
          disabled={isSubmitting}
          onClick={onSubmit}
          aria-label={t("buttons.analyzeAria")}
          className={cn("h-10 w-full", accentButtonClass)}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("buttons.analyzing")}
            </>
          ) : (
            t("buttons.analyze")
          )}
        </Button>


      {results?.length ? (
        <section className={styles.fileResults} aria-live="polite">
          <h2 className={styles.boardTitle}>{t("fileOption.resultsTitle")}</h2>
          {results.map((result, idx) => {
            return (
              <div key={`${result.fileName}-${idx}`} className={styles.fileCard}>
                <div className={styles.posterTop}>
                  <div className={styles.fileCardTitle}>{result.fileName}</div>
                  <div className={styles.hint}>
                    {t("sportTypes.CYCLING")}
                    {" · "}
                    {(result.testType === "three_nine" ||
                    result.testType === "thirty_min"
                      ? t(`testTypes.${result.testType}`)
                      : result.testType) || "-"}
                  </div>
                </div>

                <div className={styles.zoneBlock}>
                  <div className={styles.posterLabel}>{t("fieldResult.ftpLabel")}</div>
                  <div className={styles.boardTitle}>{result.ftp} W</div>
                  <CyclingWkgLine
                    ftp={result.ftp}
                    weightKg={fileWeightKg ?? null}
                    hintWhenEmpty={!fileWeightText.trim()}
                  />
                </div>

                <div className={styles.statGrid}>
                  <FileStat
                    label={t("results.labels.cp")}
                    value={`${result.cp} W`}
                  />
                  <FileStat
                    label={t("results.labels.wPrime")}
                    value={`${result.wPrimeJ} J`}
                  />
                  <FileStat
                    label={t("results.labels.cpWKg")}
                    value={
                      result.cpWKg != null
                        ? `${formatNumber(result.cpWKg, 2)} W/kg`
                        : "—"
                    }
                  />
                  <FileStat
                    label={t("results.labels.duration")}
                    value={formatSeconds(result.durationSec)}
                  />
                  <FileStat
                    label={t("results.labels.mmp3")}
                    value={`${result.derived.p3m} W`}
                  />
                  <FileStat
                    label={t("results.labels.mmpLong", {
                      duration: formatSeconds(result.derived.longDurationSec),
                    })}
                    value={`${result.derived.pLong} W`}
                  />
                </div>

                {result.ftp > 0 ? (
                  <>
                    <CogganZoneList ftp={result.ftp} />
                    <FtpHandoff ftp={result.ftp} />
                  </>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}
        </TabsContent>
        </Tabs>
        </section>
      </div>

      <FtpShareCard
        zoneModel={zoneModel}
        onZoneModelChange={setZoneModel}
        ftp={ftp}
        protocolLabel={t(`manual.protocols.${protocol}`)}
        weightKg={bodyWeightKg}
        showWeightHint={ftp != null && !weightText.trim()}
      />
    </>
  );
}

function FtpSelect({
  id,
  label,
  value,
  onValueChange,
  options,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className={styles.field}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
