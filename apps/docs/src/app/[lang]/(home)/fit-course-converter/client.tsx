"use client";

import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import { ToolProductPreview } from "@/components/calculators/tool-product-preview";
import layout from "@/components/calculators/tool-page.module.css";
import { normalizeFaqItems } from "@/lib/seo-schema";
import { Button } from "@/components/ui/button";
import {
  TrainingPlanAfterConvertDialog,
  type TrainingPlanAfterConvertDialogCopy,
} from "@/components/TrainingPlanAfterConvertDialog";
import {
  ToolHero,
  ToolFaqSection,
  ToolHowToSection,
  ToolJumpNav,
  ToolPageMain,
  ToolRelatedLinks,
} from "@/components/ToolPageLayout";
import {
  ToolFileDropzone,
  toolPrimaryActionButtonClass,
} from "@/components/ToolClientControls";
import { TrackFileInspectionStatus } from "@/components/TrackFileInspectionStatus";
import { useTrackFileInspection } from "@/hooks/use-track-file-inspection";
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
import { DOCS_BROWSER_API_BASE_URL } from "@/lib/docs-api-base-url";

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

export function FitCourseConverterClient({ lang }: { lang: string }) {
  const t = useTranslations("fitCourseConverter.page");
  const tConverter = useTranslations("converter.page");
  const tCommon = useTranslations("commonLinks");

  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [trainingPlanPromptOpen, setTrainingPlanPromptOpen] = useState(false);
  const { inspection, isInspecting, inspectionError, inspectFile } =
    useTrackFileInspection();

  const onSubmit = useCallback(async () => {
    const startedAt = performance.now();
    trackToolEvent("tool_started", "fit_course_converter", {
      action: "create_fit_course",
      ...fileAnalyticsProperties(file),
    });

    if (!file) {
      trackToolEvent("tool_failed", "fit_course_converter", {
        action: "create_fit_course",
        error_code: "file_missing",
      });
      setError(t("errors.noFile"));
      return;
    }

    if (isInspecting) return;
    if (inspectionError) {
      setError(inspectionError);
      return;
    }

    setError(null);
    setDownloadName(null);
    setIsSubmitting(true);

    const url = `${DOCS_BROWSER_API_BASE_URL}/public/encode-course`;
    const clientTraceId = createClientTraceId("fitcourse");
    const formData = new FormData();
    formData.append("file", file, file.name);

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
          `${t("errors.convertFailed")} (${res.status})`,
          clientTraceId,
        );
      }

      const blob = await res.blob();
      const headerName = parseFilenameFromContentDisposition(
        res.headers.get("content-disposition"),
      );
      const fallbackName = `course_${file.name.replace(/\.[^.]+$/, "")}.fit`;
      const filename = headerName || fallbackName;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setDownloadName(filename);
      const successProperties = {
        action: "create_fit_course",
        tool: "fit_course_converter",
        ...fileAnalyticsProperties(file),
      };
      trackToolEvent("tool_completed", "fit_course_converter", {
        action: "create_fit_course",
        duration_ms: elapsedMilliseconds(startedAt),
        ...fileAnalyticsProperties(file),
      });
      trackToolEvent("tool_exported", "fit_course_converter", {
        action: "create_fit_course",
        export_format: "fit",
      });
      trackMarketingEvent("converter_training_plan_prompt_shown", {
        ...successProperties,
        filename_extension: "fit",
      });
      setTrainingPlanPromptOpen(true);
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
        "[tool_failed] fit_course_converter.create_fit_course",
        {
          action: "create_fit_course",
          endpoint: url,
          reason,
          tool: "fit_course_converter",
          ...analyticsProps,
          ...errorInfo,
          ...requestErrorInfo,
        },
      );

      captureToolFailure({
        action: "create_fit_course",
        endpoint: url,
        error: e,
        properties: {
          ...analyticsProps,
          ...requestErrorInfo,
        },
        reason,
        tool: "fit_course_converter",
      });

      trackToolEvent("tool_failed", "fit_course_converter", {
        action: "create_fit_course",
        duration_ms: elapsedMilliseconds(startedAt),
        error_code: isFileInputError
          ? "invalid_file"
          : e instanceof TypeError
            ? "request_failed"
            : "response_invalid",
        ...analyticsProps,
      });
      const message =
        e instanceof TypeError
          ? t("errors.convertFailed")
          : e instanceof Error
            ? e.message
            : t("errors.convertFailed");
      const ref =
        e instanceof ToolRequestError
          ? e.meta.clientTraceId || clientTraceId
          : clientTraceId;
      setError(appendErrorReference(message, ref));
    } finally {
      setIsSubmitting(false);
    }
  }, [file, inspectionError, isInspecting, lang, t]);

  const faqRaw = t.raw("faq");
  const faq = Array.isArray(faqRaw) ? (faqRaw as unknown[]) : [];
  const prefix = lang === "en" ? "" : `/${lang}`;
  const trainingPlanPromptCopy = tConverter.raw(
    "trainingPlanPrompt",
  ) as TrainingPlanAfterConvertDialogCopy;
  const trainingPlanPromptHref = buildToolAppUrl({
    locale: lang,
    toolId: "fit_course_converter",
    ctaPlacement: "post_conversion_prompt",
    destination: "ai_coach",
    intent: "training-plan",
  });
  const ui = t.raw("ui") as {
    badge: string;
    primary: string;
    docs: string;
    jump: Record<string, string>;
    related: string;
    visual: Record<string, string>;
  };

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
            <ToolFileDropzone
              label={t("upload.label")}
              pickStrong={t("upload.pickStrong")}
              pickRest={t("upload.pickRest")}
              supported={t("upload.supported")}
              file={file}
              accept=".gpx,.tcx,.fit"
              trackingTool="fit_course_converter"
              onFileChange={(nextFile) => {
                setFile(nextFile);
                setError(null);
                setDownloadName(null);
                setTrainingPlanPromptOpen(false);
                void inspectFile(nextFile);
              }}
            />

            <TrackFileInspectionStatus
              inspection={inspection}
              isInspecting={isInspecting}
              error={inspectionError}
            />

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
                    isSubmitting || isInspecting || Boolean(inspectionError)
                  }
                  className={toolPrimaryActionButtonClass}
                  onClick={onSubmit}
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

            {downloadName ? (
              <div className="rounded-compact border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-emerald-700 dark:text-emerald-300">
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

      <ToolHowToSection
        title={t("howTo.title")}
        steps={[
          {
            title: t("howTo.steps.upload.title"),
            body: t("howTo.steps.upload.body"),
          },
          {
            title: t("howTo.steps.convert.title"),
            body: t("howTo.steps.convert.body"),
          },
          {
            title: t("howTo.steps.import.title"),
            body: t("howTo.steps.import.body"),
          },
        ]}
      />

      <ToolFaqSection title={t("faqTitle")} items={normalizeFaqItems(faq)} />

      <div id="related" className="scroll-mt-24">
        <ToolRelatedLinks
          title={ui.related}
          links={[
            {
              href: `${prefix}/converter`,
              label: tCommon("gpxFitTcxConverterAction"),
            },
            {
              href: `${prefix}/ftp-calculator`,
              label: tCommon("ftpCalculatorAction"),
            },
            {
              href: `${prefix}/tools`,
              label: tCommon("allToolsAction"),
            },
          ]}
        />
      </div>

      <div className={layout.bleed}>
        <CalculatorPromo
          lang={lang}
          toolId="fit_course_converter"
          namespace="toolExperience.files.promo"
        />
      </div>

      <TrainingPlanAfterConvertDialog
        appHref={trainingPlanPromptHref}
        copy={trainingPlanPromptCopy}
        lang={lang}
        open={trainingPlanPromptOpen}
        onClose={() => setTrainingPlanPromptOpen(false)}
        toolId="fit_course_converter"
        eventProperties={{
          tool: "fit_course_converter",
          ...fileAnalyticsProperties(file),
        }}
      />
    </ToolPageMain>
  );
}
