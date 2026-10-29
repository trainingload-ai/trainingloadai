"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AlertCircle, ArrowRight, Download, Loader2 } from "lucide-react";
import { TrackedLink } from "@/components/TrackedLink";
import {
  groupRelatedConverterDirections,
  type ConverterDirection,
} from "@/lib/converter-directions";
import { withLocalePath } from "@/lib/locale-url";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import { ToolProductPreview } from "@/components/calculators/tool-product-preview";
import { Button } from "@/components/ui/button";
import layout from "@/components/calculators/tool-page.module.css";
import {
  ToolCard,
  ToolFaqSection,
  ToolHero,
  ToolPageMain,
  ToolSection,
} from "@/components/ToolPageLayout";
import {
  ToolFileDropzone,
  toolPrimaryActionButtonClass,
} from "@/components/ToolClientControls";
import { TrainingPlanAfterConvertDialog } from "@/components/TrainingPlanAfterConvertDialog";
import { TrackFileInspectionStatus } from "@/components/TrackFileInspectionStatus";
import { useTrackFileInspection } from "@/hooks/use-track-file-inspection";
import {
  fileAnalyticsProperties,
  getErrorDebugInfo,
  trackMarketingEvent,
} from "@/lib/analytics";
import { buildToolAppUrl } from "@shared/product-analytics";
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
  if (asciiMatch?.[2]) return asciiMatch[2].trim();
  return null;
}

export function ConverterDirectionClient({
  direction,
  relatedDirections,
  lang,
}: {
  direction: ConverterDirection;
  relatedDirections: ConverterDirection[];
  lang: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [trainingPlanPromptOpen, setTrainingPlanPromptOpen] = useState(false);
  const { inspection, isInspecting, inspectionError, inspectFile } =
    useTrackFileInspection();

  const sourceInfo = direction.sourceInfo;
  const targetInfo = direction.targetInfo;
  const ui = direction.ui;
  const toolId = `activity_file_converter_${direction.slug}` as const;
  const trainingPlanPromptHref = buildToolAppUrl({
    locale: lang,
    toolId,
    ctaPlacement: "post_conversion_prompt",
    destination: "ai_coach",
    intent: "training-plan",
  });

  const onSubmit = useCallback(async () => {
    const startedAt = performance.now();
    trackToolEvent("tool_started", toolId, {
      action: "convert_file",
      source_format: direction.source,
      output_format: direction.target,
      ...fileAnalyticsProperties(file),
    });

    if (!file) {
      setError(ui.noFile);
      trackToolEvent("tool_failed", toolId, {
        action: "convert_file",
        error_code: "file_missing",
        source_format: direction.source,
        output_format: direction.target,
      });
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

    const url = `${DOCS_BROWSER_API_BASE_URL}/public/convert`;
    const clientTraceId = createClientTraceId("converterdir");
    const formData = new FormData();
    formData.append("files", file, file.name);
    formData.append("type", direction.target);
    formData.append("sourceType", direction.source);

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
          ui.requestFailed.replace("{status}", String(res.status)),
          clientTraceId,
        );
      }

      const blob = await res.blob();
      const headerName = parseFilenameFromContentDisposition(
        res.headers.get("content-disposition"),
      );
      const fallbackName = `${file.name.replace(/\.[^.]+$/, "")}.${direction.target}`;
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
        action: "convert_file",
        conversion: direction.slug,
        source_format: direction.source,
        target_format: direction.target,
        tool: "activity_file_direction_converter",
        ...fileAnalyticsProperties(file),
      };
      trackToolEvent("tool_completed", toolId, {
        action: "convert_file",
        duration_ms: elapsedMilliseconds(startedAt),
        source_format: direction.source,
        output_format: direction.target,
        ...fileAnalyticsProperties(file),
      });
      trackToolEvent("tool_exported", toolId, {
        action: "convert_file",
        export_format: direction.target,
      });
      trackMarketingEvent("converter_training_plan_prompt_shown", {
        ...successProperties,
        filename_extension: direction.target,
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

      console[isFileInputError ? "warn" : "error"](
        "[tool_failed] activity_file_direction_converter.convert_file",
        {
          action: "convert_file",
          conversion: direction.slug,
          endpoint: url,
          reason,
          source_format: direction.source,
          target_format: direction.target,
          tool: "activity_file_direction_converter",
          ...fileAnalyticsProperties(file),
          ...errorInfo,
          ...requestErrorInfo,
        },
      );

      captureToolFailure({
        action: "convert_file",
        endpoint: url,
        error: e,
        properties: {
          conversion: direction.slug,
          source_format: direction.source,
          target_format: direction.target,
          ...fileAnalyticsProperties(file),
          ...requestErrorInfo,
        },
        reason,
        tool: "activity_file_direction_converter",
      });

      trackToolEvent("tool_failed", toolId, {
        action: "convert_file",
        duration_ms: elapsedMilliseconds(startedAt),
        error_code: isFileInputError
          ? "invalid_file"
          : e instanceof TypeError
            ? "request_failed"
            : "response_invalid",
        source_format: direction.source,
        output_format: direction.target,
        ...fileAnalyticsProperties(file),
      });
      const message =
        e instanceof TypeError
          ? ui.network
          : e instanceof Error
            ? e.message
            : ui.convertFailed;
      const ref =
        e instanceof ToolRequestError
          ? e.meta.clientTraceId || clientTraceId
          : clientTraceId;
      setError(appendErrorReference(message, ref));
    } finally {
      setIsSubmitting(false);
    }
  }, [direction, file, inspectionError, isInspecting, lang, toolId, ui]);

  return (
    <ToolPageMain>
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-600 dark:text-neutral-300"
      >
        <Link
          href={withLocalePath(lang, "/tools")}
          className="hover:text-emerald-700 dark:hover:text-emerald-200"
        >
          {ui.tools}
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={withLocalePath(lang, "/converter")}
          className="hover:text-emerald-700 dark:hover:text-emerald-200"
        >
          {ui.gpxConverter}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-neutral-950 dark:text-white">
          {direction.label}
        </span>
      </nav>

      <ToolHero
        badge={ui.badge}
        title={direction.title}
        subtitle={direction.subtitle}
        primary={{ href: "#converter", label: ui.primary }}
        secondary={{
          href: "#other-tools",
          label: ui.secondary,
        }}
        visual={
          <section id="converter" className={layout.form}>
            <div className="flex flex-col gap-2">
              <div>
                <h2 className={layout.formTitle}>{direction.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {ui.converterDescription}
                </p>
              </div>
              <div className={layout.conversionDirection}>
                <span>{sourceInfo.label}</span>
                <ArrowRight className="size-4" aria-hidden />
                <span>{targetInfo.label}</span>
              </div>
            </div>

            <div className="space-y-6">
              <ToolFileDropzone
                pickStrong={ui.pickStrong}
                pickRest={ui.pickRest}
                supported={ui.supported}
                file={file}
                accept={sourceInfo.accept}
                trackingTool={`activity_file_converter_${direction.slug}`}
                dropzoneAria={ui.uploadAria}
                supportedId={`${direction.slug}-upload-supported`}
                removeFileAria={
                  file
                    ? ui.removeFileAria.replace("{filename}", file.name)
                    : undefined
                }
                onFileChange={(nextFile) => {
                  setFile(nextFile);
                  setError(null);
                  setDownloadName(null);
                  setTrainingPlanPromptOpen(false);
                  void inspectFile(nextFile);
                }}
              />
              {ui.uploadNote ? (
                <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {ui.uploadNote}
                </p>
              ) : null}

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
                    className="flex items-start gap-2 rounded-compact border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
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
                    aria-label={ui.convertAria}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        {ui.converting}
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 size-4" />
                        {ui.convertTo}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {downloadName ? (
                <div
                  aria-live="polite"
                  className="rounded-compact border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                >
                  {ui.success.replace("{filename}", downloadName)}
                </div>
              ) : null}
            </div>
          </section>
        }
      >
        <ToolProductPreview lang={lang} kind="files" />
      </ToolHero>

      <ToolCard className="flex flex-wrap items-center justify-between gap-3 py-4">
        <h2 className="text-base font-bold text-neutral-950 dark:text-white">
          {ui.feedbackTitle}
        </h2>
        <Link
          href="mailto:support@trainingload.ai"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-compact border border-emerald-600/30 bg-white px-3 text-sm font-bold text-emerald-800 hover:bg-emerald-50 dark:bg-card dark:text-emerald-200 dark:hover:bg-accent"
        >
          {ui.feedbackEmail}
        </Link>
      </ToolCard>

      <ToolSection id="how-to" title={ui.howToTitle}>
        <div className="grid gap-3 md:grid-cols-3">
          {direction.howTo.map((step, index) => (
            <ToolCard key={step}>
              <div className="mb-3 grid size-8 place-items-center rounded-compact bg-neutral-950 font-mono text-sm font-black text-white dark:bg-white dark:text-neutral-950">
                {index + 1}
              </div>
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {step}
              </p>
            </ToolCard>
          ))}
        </div>
      </ToolSection>

      {direction.preserved ? (
        <ToolSection
          id="preserved-data"
          title={direction.preserved.title}
          description={direction.preserved.intro || undefined}
        >
          <div className="overflow-x-auto rounded-compact border border-neutral-200 dark:border-border">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100 dark:border-border dark:bg-muted">
                  <th className="px-4 py-2.5 font-semibold text-neutral-900 dark:text-white">
                    {direction.preserved.fieldLabel}
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-900 dark:text-white">
                    {direction.preserved.statusLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {direction.preserved.rows.map((row) => (
                  <tr
                    key={row.field}
                    className="border-b border-neutral-200 last:border-0 dark:border-border"
                  >
                    <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                      {row.field}
                    </th>
                    <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                      {row.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {direction.preserved.footnote ? (
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {direction.preserved.footnote}
            </p>
          ) : null}
        </ToolSection>
      ) : null}

      {direction.scenarios ? (
        <ToolSection id="use-cases" title={direction.scenarios.title}>
          <div className="grid gap-3 md:grid-cols-2">
            {direction.scenarios.items.map((item) => (
              <ToolCard key={item.title} className="space-y-2">
                <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {item.body}
                </p>
              </ToolCard>
            ))}
          </div>
        </ToolSection>
      ) : null}

      {direction.comparison ? (
        <ToolSection id="format-compare" title={direction.comparison.title}>
          <ToolCard className="space-y-3">
            <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {direction.comparison.body}
            </p>
            {direction.comparison.courseNote ? (
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {direction.comparison.courseNote}{" "}
                <Link
                  href={withLocalePath(lang, "/fit-course-converter")}
                  className="font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-200"
                >
                  {ui.relatedFitCourseConverter}
                </Link>
              </p>
            ) : null}
          </ToolCard>
        </ToolSection>
      ) : null}

      <ConverterRelatedGroups
        direction={direction}
        relatedDirections={relatedDirections}
        lang={lang}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <ToolSection id="source-file" title={ui.sourceTitle}>
          <ToolCard>
            <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {sourceInfo.description}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {direction.sourceDescription}
            </p>
          </ToolCard>
        </ToolSection>

        <ToolSection id="target-file" title={ui.targetTitle}>
          <ToolCard>
            <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {targetInfo.description}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {direction.targetDescription}
            </p>
          </ToolCard>
        </ToolSection>
      </div>

      <ToolFaqSection id="faq" title={ui.faqTitle} items={direction.faq} />

      <div className={layout.bleed}>
        <CalculatorPromo
          lang={lang}
          toolId={toolId}
          namespace="toolExperience.files.promo"
        />
      </div>

      <TrainingPlanAfterConvertDialog
        appHref={trainingPlanPromptHref}
        copy={ui.trainingPlanPrompt}
        lang={lang}
        open={trainingPlanPromptOpen}
        onClose={() => setTrainingPlanPromptOpen(false)}
        toolId={toolId}
        eventProperties={{
          conversion: direction.slug,
          source_format: direction.source,
          target_format: direction.target,
          tool: "activity_file_direction_converter",
          ...fileAnalyticsProperties(file),
        }}
      />
    </ToolPageMain>
  );
}

function ConverterRelatedLinkList({
  links,
}: {
  links: Array<{ href: string; label: string }>;
}) {
  if (links.length === 0) return null;
  return (
    <div className="grid gap-3">
      {links.map((link) => (
        <TrackedLink
          key={link.href}
          href={link.href}
          eventName="related_tool_clicked"
          eventProperties={{
            href: link.href,
            label: link.label,
            location: "tool_related_links",
          }}
          className={layout.relatedLink}
        >
          <span>{link.label}</span>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </TrackedLink>
      ))}
    </div>
  );
}

function ConverterRelatedGroups({
  direction,
  relatedDirections,
  lang,
}: {
  direction: ConverterDirection;
  relatedDirections: ConverterDirection[];
  lang: string;
}) {
  const ui = direction.ui;
  const { sameFrom, sameTo } = groupRelatedConverterDirections(
    direction,
    relatedDirections,
  );

  return (
    <ToolSection id="other-tools" title={ui.otherToolsTitle}>
      <div className={layout.related}>
        {sameFrom.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {ui.relatedSameFromTitle}
            </h3>
            <ConverterRelatedLinkList
              links={sameFrom.map((item) => ({
                href: withLocalePath(lang, `/${item.slug}`),
                label: item.ui.linkLabel,
              }))}
            />
          </div>
        ) : null}
        {sameTo.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {ui.relatedSameToTitle}
            </h3>
            <ConverterRelatedLinkList
              links={sameTo.map((item) => ({
                href: withLocalePath(lang, `/${item.slug}`),
                label: item.ui.linkLabel,
              }))}
            />
          </div>
        ) : null}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {ui.relatedHubTitle}
          </h3>
          <ConverterRelatedLinkList
            links={[
              {
                href: withLocalePath(lang, "/converter"),
                label: ui.relatedHub,
              },
            ]}
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {ui.relatedOtherTitle}
          </h3>
          <ConverterRelatedLinkList
            links={[
              {
                href: withLocalePath(lang, "/fit-file-viewer"),
                label: ui.relatedFitViewer,
              },
              {
                href: withLocalePath(lang, "/fit-course-converter"),
                label: ui.relatedFitCourse,
              },
            ]}
          />
        </div>
      </div>
    </ToolSection>
  );
}
