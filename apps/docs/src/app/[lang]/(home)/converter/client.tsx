"use client";

import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildConverterDirections,
  type ConverterDirectionCopy,
} from "@/lib/converter-directions";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import { ToolProductPreview } from "@/components/calculators/tool-product-preview";
import layout from "@/components/calculators/tool-page.module.css";
import { normalizeFaqItems } from "@/lib/seo-schema";
import { Button } from "@/components/ui/button";
import {
  ToolHero,
  ToolFaqSection,
  ToolHowToSection,
  ToolJumpNav,
  ToolPageMain,
} from "@/components/ToolPageLayout";
import { ConverterRelatedTools } from "@/components/ConverterRelatedTools";
import {
  ToolFileDropzone,
  toolPrimaryActionButtonClass,
} from "@/components/ToolClientControls";
import {
  fileAnalyticsProperties,
  getErrorDebugInfo,
  trackMarketingEvent,
} from "@/lib/analytics";
import {
  appendErrorReference,
  buildToolRequestError,
  createClientTraceId,
  getToolRequestErrorMeta,
  isFileInputToolRequestError,
  ToolRequestError,
} from "@/lib/tool-request-error";
import { captureToolFailure } from "@/lib/tool-sentry";
import { elapsedMilliseconds, trackToolEvent } from "@/lib/tool-analytics";
import {
  TrainingPlanAfterConvertDialog,
  type TrainingPlanAfterConvertDialogCopy,
} from "@/components/TrainingPlanAfterConvertDialog";
import { TrackFileInspectionStatus } from "@/components/TrackFileInspectionStatus";
import { useTrackFileInspection } from "@/hooks/use-track-file-inspection";
import { DOCS_BROWSER_API_BASE_URL } from "@/lib/docs-api-base-url";
import {
  ConversionInputNotice,
  ConversionReviewNotice,
} from "@/components/ConversionQualityNotice";
import { useConversionDownload } from "@/hooks/use-conversion-download";
import { conversionHasNoGps } from "@/lib/conversion-download";
type TargetFormat = "gpx" | "fit" | "tcx";

function parseFilenameFromContentDisposition(
  value: string | null,
): string | null {
  if (!value) return null;

  const utf8Match = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, "").trim());
    } catch {
      return utf8Match[1].replace(/["']/g, "").trim();
    }
  }

  const asciiMatch = value.match(/filename\s*=\s*("?)([^";]+)\1/i);
  if (asciiMatch?.[2]) {
    return asciiMatch[2].trim();
  }

  return null;
}

export function ConverterClient({ lang }: { lang: string }) {
  const t = useTranslations("converter.page");
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<TargetFormat>("gpx");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [trainingPlanPromptOpen, setTrainingPlanPromptOpen] = useState(false);
  const { inspection, isInspecting, inspectionError, inspectFile } =
    useTrackFileInspection();
  const tQuality = useTranslations("conversionQuality");
  const noGps = conversionHasNoGps(inspection, targetFormat);
  const {
    pending,
    report,
    reset: resetDownload,
    acceptResponse,
    downloadPending,
    isCurrent,
  } = useConversionDownload(targetFormat);

  const onSubmit = useCallback(async () => {
    const startedAt = performance.now();
    trackToolEvent("tool_started", "activity_file_converter", {
      action: "convert_file",
      output_format: targetFormat,
      ...fileAnalyticsProperties(file),
    });

    if (!file) {
      trackToolEvent("tool_failed", "activity_file_converter", {
        action: "convert_file",
        error_code: "file_missing",
        output_format: targetFormat,
      });
      setError(t("errors.noFile"));
      return;
    }
    if (isInspecting) return;
    if (inspectionError) {
      setError(inspectionError);
      return;
    }

    if (noGps) return;
    const conversionRequestId = resetDownload();

    setError(null);
    setDownloadName(null);
    setIsSubmitting(true);

    const url = `${DOCS_BROWSER_API_BASE_URL}/public/convert`;
    const clientTraceId = createClientTraceId("converter");
    const formData = new FormData();
    formData.append("files", file, file.name);
    formData.append("type", targetFormat);

    try {
      const res = await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
          "x-lang": lang,
          "x-client-trace-id": clientTraceId,
        },
      });

      if (!res.ok) {
        throw await buildToolRequestError(
          res,
          res.status >= 500
            ? tQuality("serviceFailed")
            : t("errors.requestFailed", { status: res.status }),
          clientTraceId,
        );
      }

      const headerName = parseFilenameFromContentDisposition(
        res.headers.get("content-disposition"),
      );
      const fallbackName = `${file.name.replace(/\.[^.]+$/, "")}.${targetFormat}`;
      const filename = headerName || fallbackName;

      await acceptResponse(
        res,
        filename,
        conversionRequestId,
        (hasWarnings) => {
          setDownloadName(filename);
          const successProperties = {
            action: "convert_file",
            target_format: targetFormat,
            tool: "activity_file_converter",
            ...fileAnalyticsProperties(file),
          };
          trackToolEvent("tool_completed", "activity_file_converter", {
            action: "convert_file",
            duration_ms: elapsedMilliseconds(startedAt),
            output_format: targetFormat,
            ...fileAnalyticsProperties(file),
          });
          trackToolEvent("tool_exported", "activity_file_converter", {
            action: "convert_file",
            export_format: targetFormat,
          });
          if (!hasWarnings) {
            trackMarketingEvent("converter_training_plan_prompt_shown", {
              ...successProperties,
              filename_extension: targetFormat,
            });
            setTrainingPlanPromptOpen(true);
          }
        },
      );
    } catch (e) {
      if (!isCurrent(conversionRequestId)) return;
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
        "[tool_failed] activity_file_converter.convert_file",
        {
          action: "convert_file",
          endpoint: url,
          reason,
          target_format: targetFormat,
          tool: "activity_file_converter",
          ...analyticsProps,
          ...errorInfo,
          ...requestErrorInfo,
        },
      );

      captureToolFailure({
        action: "convert_file",
        endpoint: url,
        error: e,
        properties: {
          target_format: targetFormat,
          ...analyticsProps,
          ...requestErrorInfo,
        },
        reason,
        tool: "activity_file_converter",
      });

      trackToolEvent("tool_failed", "activity_file_converter", {
        action: "convert_file",
        duration_ms: elapsedMilliseconds(startedAt),
        error_code: isFileInputError
          ? "invalid_file"
          : e instanceof TypeError
            ? "request_failed"
            : "response_invalid",
        output_format: targetFormat,
        ...analyticsProps,
      });
      if (e instanceof TypeError) {
        setError(
          appendErrorReference(
            t("errors.network"),
            clientTraceId,
            tQuality("reference"),
          ),
        );
        return;
      }
      const message =
        e instanceof Error ? e.message : t("errors.convertFailed");
      const ref =
        e instanceof ToolRequestError
          ? e.meta.clientTraceId || clientTraceId
          : clientTraceId;
      setError(appendErrorReference(message, ref, tQuality("reference")));
    } finally {
      if (isCurrent(conversionRequestId)) setIsSubmitting(false);
    }
  }, [
    file,
    inspectionError,
    isInspecting,
    lang,
    t,
    targetFormat,
    noGps,
    resetDownload,
    acceptResponse,
    isCurrent,
    tQuality,
  ]);

  const faqRaw = t.raw("faq");
  const faq = Array.isArray(faqRaw) ? (faqRaw as unknown[]) : [];
  const prefix = lang === "en" ? "" : `/${lang}`;
  const tDirections = useTranslations("converterDirections");
  const converterDirectionLinks = buildConverterDirections(
    tDirections.raw("copy") as ConverterDirectionCopy,
  );
  const ui = t.raw("ui") as {
    badge: string;
    primary: string;
    docs: string;
    jump: Record<string, string>;
    related: string;
    visual: Record<string, string>;
  };
  const trainingPlanPromptCopy = t.raw(
    "trainingPlanPrompt",
  ) as TrainingPlanAfterConvertDialogCopy;
  const trainingPlanPromptHref = buildToolAppUrl({
    locale: lang,
    toolId: "activity_file_converter",
    ctaPlacement: "post_conversion_prompt",
    destination: "ai_coach",
    intent: "training-plan",
  });

  return (
    <ToolPageMain>
      <ToolHero
        badge={ui.badge}
        title={t("title")}
        subtitle={t("subtitle")}
        primary={{ href: "#converter", label: ui.primary }}
        secondary={{
          href: `${prefix}/docs`,
          label: ui.docs,
        }}
        visual={
          <section id="converter" className={layout.form}>
            <h2 className={layout.formTitle}>{t("title")}</h2>
            <div className={layout.field}>
              <Label htmlFor="converter-target-format">
                {t("target.label")}
              </Label>
              <Select
                value={targetFormat}
                onValueChange={(value) => {
                  resetDownload();
                  setError(null);
                  setDownloadName(null);
                  setTrainingPlanPromptOpen(false);
                  setIsSubmitting(false);
                  setTargetFormat(value as TargetFormat);
                }}
              >
                <SelectTrigger id="converter-target-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {(["gpx", "fit", "tcx"] as const).map((fmt) => (
                    <SelectItem key={fmt} value={fmt}>
                      {t(`target.options.${fmt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ToolFileDropzone
              label={t("upload.label")}
              pickStrong={t("upload.pickStrong")}
              pickRest={t("upload.pickRest")}
              supported={t("upload.supported")}
              file={file}
              accept=".gpx,.fit,.tcx"
              trackingTool="activity_file_converter"
              onFileChange={(nextFile) => {
                resetDownload();
                setIsSubmitting(false);
                setFile(nextFile);
                void inspectFile(nextFile);
                setError(null);
                setDownloadName(null);
                setTrainingPlanPromptOpen(false);
              }}
              dropzoneAria={t("upload.dropzoneAria")}
              supportedId="converter-upload-supported"
              removeFileAria={
                file
                  ? t("upload.removeFileAria", { filename: file.name })
                  : undefined
              }
            />

            <TrackFileInspectionStatus
              inspection={inspection}
              isInspecting={isInspecting}
              error={inspectionError}
            />

            {!report ? (
              <ConversionInputNotice
                inspection={inspection}
                targetFormat={targetFormat}
              />
            ) : null}
            {report ? (
              <ConversionReviewNotice
                report={report}
                awaitingConfirmation={Boolean(pending)}
                onDownload={downloadPending}
                onCancel={() => {
                  resetDownload();
                }}
              />
            ) : null}

            <div className="space-y-3 pt-2">
              {error ? (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="text-sm text-red-600 dark:text-red-400 animate-in fade-in slide-in-from-left-2"
                >
                  {error}
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={
                    isSubmitting ||
                    isInspecting ||
                    Boolean(inspectionError) ||
                    noGps ||
                    Boolean(pending)
                  }
                  className={toolPrimaryActionButtonClass}
                  onClick={onSubmit}
                  aria-label={t("buttons.convertAria")}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {t("buttons.converting")}
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 size-4" />
                      {t("buttons.convert")}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {downloadName && !report ? (
              <div
                aria-live="polite"
                className="rounded-compact border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-emerald-700 dark:text-emerald-300"
              >
                {t("success.ready", { filename: downloadName })}
              </div>
            ) : null}
          </section>
        }
      >
        <ToolProductPreview lang={lang} kind="files" />
      </ToolHero>

      <ToolJumpNav
        links={[
          { href: "#converter", label: ui.jump.converter },
          { href: "#how-to", label: ui.jump.howTo },
          { href: "#faq", label: ui.jump.faq },
          { href: "#related", label: ui.jump.related },
        ]}
      />

      <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {t("seoIntro")}
      </p>

      <ToolHowToSection
        title={t("howTo.title")}
        steps={[
          {
            title: t("howTo.steps.target.title"),
            body: t("howTo.steps.target.body"),
          },
          {
            title: t("howTo.steps.upload.title"),
            body: t("howTo.steps.upload.body"),
          },
          {
            title: t("howTo.steps.download.title"),
            body: t("howTo.steps.download.body"),
          },
        ]}
      />

      <ToolFaqSection title={t("faqTitle")} items={normalizeFaqItems(faq)} />

      <div id="related" className="scroll-mt-24">
        <ConverterRelatedTools
          directions={converterDirectionLinks}
          lang={lang}
        />
      </div>

      <div className={layout.bleed}>
        <CalculatorPromo
          lang={lang}
          toolId="activity_file_converter"
          namespace="toolExperience.files.promo"
        />
      </div>

      <TrainingPlanAfterConvertDialog
        appHref={trainingPlanPromptHref}
        copy={trainingPlanPromptCopy}
        lang={lang}
        open={trainingPlanPromptOpen}
        onClose={() => setTrainingPlanPromptOpen(false)}
        toolId="activity_file_converter"
        eventProperties={{
          target_format: targetFormat,
          tool: "activity_file_converter",
          ...fileAnalyticsProperties(file),
        }}
      />
    </ToolPageMain>
  );
}
