"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  ExternalLink,
  FileSearch,
  Github,
  Loader2,
  Map as MapIcon,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { FitResultWorkbench } from "./components/fit-result-workbench";
import type { FitFileViewerPageMessages } from "./fit-view-copy";
import {
  ToolFaqSection,
  ToolHero,
  ToolRelatedLinks,
  ToolSection,
} from "@/components/ToolPageLayout";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import { ToolProductPreview } from "@/components/calculators/tool-product-preview";
import layout from "@/components/calculators/tool-page.module.css";
import { ToolFileDropzone } from "@/components/ToolClientControls";
import { cn } from "@/lib/cn";
import { fileAnalyticsProperties } from "@/lib/analytics";
import { elapsedMilliseconds, trackToolEvent } from "@/lib/tool-analytics";
import { withLocalePath } from "@/lib/locale-url";
import {
  MAX_FIT_FILE_BYTES,
  type FitViewModel,
  type FitWorkerRequest,
  type FitWorkerRequestPayload,
  type FitWorkerResponse,
} from "./fit-view-model";

type PendingWorkerRequest = {
  resolve: (response: FitWorkerResponse) => void;
  reject: (error: Error) => void;
};

function downloadText(content: string, mimeType: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function UploadWorkspace({
  file,
  error,
  isParsing,
  copy,
  onFileChange,
  onInspect,
  onReset,
}: {
  file: File | null;
  error: string | null;
  isParsing: boolean;
  copy: FitFileViewerPageMessages;
  onFileChange: (file: File | null) => void;
  onInspect: () => void;
  onReset: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-compact border border-neutral-200 bg-white shadow-sm dark:border-border dark:bg-card">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="p-5 sm:p-6">
          <div className="mb-4">
            <h2
              id="fit-upload-title"
              className="text-lg font-black text-neutral-950 dark:text-white"
            >
              {copy.upload.label}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {copy.upload.supported}
            </p>
          </div>

          <ToolFileDropzone
            pickStrong={copy.upload.pickStrong}
            pickRest={copy.upload.pickRest}
            supported={copy.upload.supported}
            file={file}
            accept=".fit,application/octet-stream"
            dropzoneAria={copy.upload.aria}
            removeFileAria={copy.upload.remove}
            supportedId="fit-file-viewer-supported"
            trackingTool="fit_file_viewer"
            selectedLayout="inside"
            onFileChange={onFileChange}
          />

          {error ? (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-4 flex items-start gap-2 rounded-compact border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {error}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
            {file ? (
              <button
                type="button"
                onClick={onReset}
                disabled={isParsing}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-compact px-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-accent dark:hover:text-neutral-100 sm:h-8 sm:text-xs"
              >
                <RotateCcw aria-hidden="true" className="size-3.5" />
                {copy.buttons.reset}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!file || isParsing}
              aria-busy={isParsing}
              onClick={onInspect}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-compact bg-emerald-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400 sm:h-8 sm:px-3 sm:text-xs"
            >
              {isParsing ? (
                <Loader2
                  aria-hidden="true"
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <FileSearch aria-hidden="true" className="size-3.5" />
              )}
              {isParsing ? copy.buttons.inspecting : copy.buttons.inspect}
            </button>
          </div>
        </div>

        <aside className="border-t border-neutral-200 bg-neutral-50/70 p-5 dark:border-border dark:bg-white/[0.025] sm:p-6 lg:border-t-0 lg:border-l">
          <div className="flex gap-3">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300"
            />
            <div>
              <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                {copy.privacy.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                {copy.privacy.body}
              </p>
            </div>
          </div>

          <div className="mt-5 border-t border-neutral-200 pt-5 dark:border-border">
            <div className="flex gap-3">
              <MapIcon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-neutral-500 dark:text-neutral-400"
              />
              <div>
                <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                  {copy.limitations.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {copy.limitations.body}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {isParsing ? (
        <div
          aria-live="polite"
          className="border-t border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-border dark:bg-white/[0.02]"
        >
          <span className="sr-only">{copy.buttons.inspecting}</span>
          <div className="h-1.5 overflow-hidden rounded-xs bg-neutral-200 dark:bg-white/[0.08]">
            <div className="h-full w-1/3 animate-pulse rounded-xs bg-emerald-500 motion-reduce:animate-none dark:bg-emerald-400" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FitFileViewerClient({ lang }: { lang: string }) {
  const t = useTranslations("fitFileViewer");
  const copy = t.raw("page") as FitFileViewerPageMessages;
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState<FitViewModel | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const nextRequestId = useRef(1);
  const requestVersion = useRef(0);
  const pending = useRef(new Map<number, PendingWorkerRequest>());

  const rejectPending = useCallback((message: string) => {
    for (const request of pending.current.values()) {
      request.reject(new Error(message));
    }
    pending.current.clear();
  }, []);

  const stopWorker = useCallback(
    (message: string) => {
      workerRef.current?.terminate();
      workerRef.current = null;
      rejectPending(message);
    },
    [rejectPending],
  );

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const nextWorker = new Worker(
      new URL("./fit-view-worker.ts", import.meta.url),
      {
        type: "module",
        name: "fit-file-viewer",
      },
    );
    nextWorker.onmessage = (event: MessageEvent<FitWorkerResponse>) => {
      const request = pending.current.get(event.data.id);
      if (!request) return;
      pending.current.delete(event.data.id);
      if (event.data.type === "error") {
        request.reject(new Error(event.data.message));
      } else {
        request.resolve(event.data);
      }
    };
    nextWorker.onerror = () => {
      if (workerRef.current !== nextWorker) return;
      requestVersion.current += 1;
      rejectPending(copy.errors.worker);
      nextWorker.terminate();
      workerRef.current = null;
      setModel(null);
      setError(copy.errors.worker);
      setIsParsing(false);
      setIsExporting(false);
    };
    workerRef.current = nextWorker;
    return nextWorker;
  }, [copy.errors.worker, rejectPending]);

  useEffect(() => {
    const requests = pending.current;
    return () => {
      requestVersion.current += 1;
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const request of requests.values()) {
        request.reject(new Error("WORKER_TERMINATED"));
      }
      requests.clear();
    };
  }, []);

  const requestWorker = useCallback(
    <T extends FitWorkerResponse>(
      request: FitWorkerRequestPayload,
      transfer: Transferable[] = [],
    ) => {
      const id = nextRequestId.current++;
      return new Promise<T>((resolve, reject) => {
        pending.current.set(id, {
          resolve: (response) => resolve(response as T),
          reject,
        });
        try {
          ensureWorker().postMessage(
            { ...request, id } as FitWorkerRequest,
            transfer,
          );
        } catch (cause) {
          pending.current.delete(id);
          reject(
            cause instanceof Error ? cause : new Error("WORKER_POST_FAILED"),
          );
        }
      });
    },
    [ensureWorker],
  );

  const reset = useCallback(() => {
    requestVersion.current += 1;
    setFile(null);
    setModel(null);
    setError(null);
    setIsParsing(false);
    setIsExporting(false);
    stopWorker("RESET");
  }, [stopWorker]);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      requestVersion.current += 1;
      setModel(null);
      setError(null);
      setIsParsing(false);
      setIsExporting(false);
      stopWorker("FILE_CHANGED");
      if (!nextFile) {
        setFile(null);
        return;
      }
      if (!nextFile.name.toLocaleLowerCase().endsWith(".fit")) {
        setFile(null);
        setError(copy.errors.extension);
        trackToolEvent("tool_failed", "fit_file_viewer", {
          action: "select_file",
          error_code: "file_type_unsupported",
          ...fileAnalyticsProperties(nextFile),
        });
        return;
      }
      if (nextFile.size > MAX_FIT_FILE_BYTES) {
        setFile(null);
        setError(copy.errors.tooLarge);
        trackToolEvent("tool_failed", "fit_file_viewer", {
          action: "select_file",
          error_code: "file_too_large",
          ...fileAnalyticsProperties(nextFile),
        });
        return;
      }
      setFile(nextFile);
    },
    [copy.errors.extension, copy.errors.tooLarge, stopWorker],
  );

  const inspectFile = useCallback(async () => {
    const startedAt = performance.now();
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    trackToolEvent("tool_started", "fit_file_viewer", {
      action: "inspect_file",
      ...fileAnalyticsProperties(file),
    });
    if (!file) {
      setError(copy.errors.noFile);
      trackToolEvent("tool_failed", "fit_file_viewer", {
        action: "inspect_file",
        error_code: "file_missing",
      });
      return;
    }
    setError(null);
    setIsParsing(true);
    setModel(null);
    try {
      const buffer = await file.arrayBuffer();
      if (requestVersion.current !== version) return;
      const response = await requestWorker<
        Extract<FitWorkerResponse, { type: "parsed" }>
      >(
        {
          type: "parse",
          fileName: file.name,
          fileSize: file.size,
          buffer,
        },
        [buffer],
      );
      if (requestVersion.current !== version) return;
      setModel(response.model);
      trackToolEvent("tool_completed", "fit_file_viewer", {
        action: "inspect_file",
        duration_ms: elapsedMilliseconds(startedAt),
        ...fileAnalyticsProperties(file),
      });
    } catch (cause) {
      if (requestVersion.current !== version) return;
      const message = cause instanceof Error ? cause.message : "";
      const errorCode =
        message === "INVALID_FIT" ? "invalid_file" : "parse_failed";
      setError(
        message === "INVALID_FIT" ? copy.errors.invalid : copy.errors.parse,
      );
      trackToolEvent("tool_failed", "fit_file_viewer", {
        action: "inspect_file",
        duration_ms: elapsedMilliseconds(startedAt),
        error_code: errorCode,
        ...fileAnalyticsProperties(file),
      });
    } finally {
      if (requestVersion.current === version) setIsParsing(false);
    }
  }, [copy.errors, file, requestWorker]);

  const loadMessageRows = useCallback(
    async (
      group: string,
      query: string,
      page: number,
      pageSize: number,
      includeUnknownData: boolean,
    ) => {
      const response = await requestWorker<
        Extract<FitWorkerResponse, { type: "page" }>
      >({
        type: "page",
        group,
        query,
        page,
        pageSize,
        includeUnknownData,
      });
      return response.result;
    },
    [requestWorker],
  );

  const exportFile = useCallback(
    async (format: "csv" | "json", group?: string) => {
      const startedAt = performance.now();
      const version = requestVersion.current;
      trackToolEvent("tool_started", "fit_file_viewer", {
        action: "export_result",
        export_format: format,
      });
      setIsExporting(true);
      setError(null);
      try {
        const response = await requestWorker<
          Extract<FitWorkerResponse, { type: "export" }>
        >({
          type: "export",
          format,
          group: format === "csv" ? group : undefined,
        });
        if (requestVersion.current !== version) return;
        downloadText(response.content, response.mimeType, response.fileName);
        trackToolEvent("tool_exported", "fit_file_viewer", {
          action: "export_result",
          duration_ms: elapsedMilliseconds(startedAt),
          export_format: format,
        });
      } catch {
        if (requestVersion.current !== version) return;
        setError(copy.errors.parse);
        trackToolEvent("tool_failed", "fit_file_viewer", {
          action: "export_result",
          duration_ms: elapsedMilliseconds(startedAt),
          error_code: "export_failed",
          export_format: format,
        });
      } finally {
        if (requestVersion.current === version) setIsExporting(false);
      }
    },
    [copy.errors.parse, requestWorker],
  );

  return (
    <div className={layout.page}>
      <div className={layout.shell}>
        <ToolHero
          badge={copy.badge}
          title={copy.title}
          subtitle={copy.subtitle}
          primary={{ href: "#viewer", label: copy.primary }}
          secondary={{ href: "#about", label: copy.secondary }}
          visual={<ToolProductPreview lang={lang} kind="files" />}
        />
      </div>

      <div className="mx-auto w-full max-w-[1132px] space-y-16 pt-12 md:pt-16">
        <section
          id="viewer"
          aria-label={copy.jump.viewer}
          className="scroll-mt-24"
        >
          {model ? (
            <FitResultWorkbench
              key={`${model.fileName}-${model.fileSize}`}
              model={model}
              lang={lang}
              copy={copy}
              isExporting={isExporting}
              loadRows={loadMessageRows}
              exportFile={exportFile}
              onReset={reset}
              error={error}
            />
          ) : (
            <UploadWorkspace
              file={file}
              error={error}
              isParsing={isParsing}
              copy={copy}
              onFileChange={onFileChange}
              onInspect={inspectFile}
              onReset={reset}
            />
          )}
        </section>

        <ToolSection
          id="about"
          title={copy.about.title}
          description={copy.about.description}
        >
          <div className="grid border-y border-neutral-200 dark:border-border md:grid-cols-3">
            {copy.about.cards.map((card, index) => (
              <article
                key={card.title}
                className={cn(
                  "py-5 md:px-5",
                  index > 0 &&
                    "border-t border-neutral-200 dark:border-border md:border-t-0 md:border-l",
                  index === 0 && "md:pl-0",
                  index === copy.about.cards.length - 1 && "md:pr-0",
                )}
              >
                <div className="font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  0{index + 1}
                </div>
                <h3 className="mt-3 text-base font-bold text-neutral-950 dark:text-white">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </ToolSection>

        <ToolSection id="how-to" title={copy.howTo.title}>
          <ol className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-border dark:border-border">
            {copy.howTo.steps.map((step, index) => (
              <li
                key={step.title}
                className="grid gap-3 py-5 sm:grid-cols-[3rem_14rem_minmax(0,1fr)] sm:items-baseline sm:gap-5"
              >
                <span className="font-mono text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  0{index + 1}
                </span>
                <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </ToolSection>

        <ToolFaqSection title={copy.faqTitle} items={[...copy.faq]} />

        <ToolSection title={copy.source.title}>
          <div className="border-y border-neutral-200 py-5 dark:border-border">
            <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {copy.source.body}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <a
                  href="https://github.com/garmin/fit-javascript-sdk"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center gap-2 font-semibold text-neutral-800 underline decoration-neutral-300 underline-offset-4 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-neutral-100 dark:decoration-neutral-600 dark:hover:text-emerald-300"
                >
                  <Github aria-hidden="true" className="size-4" />
                  {copy.source.githubLink}
                  <ExternalLink
                    aria-hidden="true"
                    className="size-3.5 opacity-60"
                  />
                </a>
                <a
                  href="https://developer.garmin.com/fit/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center gap-2 font-semibold text-neutral-800 underline decoration-neutral-300 underline-offset-4 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-neutral-100 dark:decoration-neutral-600 dark:hover:text-emerald-300"
                >
                  {copy.source.link}
                  <ExternalLink
                    aria-hidden="true"
                    className="size-3.5 opacity-60"
                  />
                </a>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {copy.source.updated}
              </span>
            </div>
          </div>
        </ToolSection>

        <ToolRelatedLinks
          title={copy.related.title}
          links={[
            {
              href: withLocalePath(lang, "/converter"),
              label: copy.related.converter,
            },
            {
              href: withLocalePath(lang, "/fit-to-gpx"),
              label: copy.related.fitToGpx,
            },
            {
              href: withLocalePath(lang, "/gpx-to-fit"),
              label: copy.related.gpxToFit,
            },
            {
              href: withLocalePath(lang, "/fit-to-tcx"),
              label: copy.related.fitToTcx,
            },
            {
              href: withLocalePath(lang, "/tcx-to-fit"),
              label: copy.related.tcxToFit,
            },
            {
              href: withLocalePath(lang, "/tools"),
              label: copy.related.allTools,
            },
          ]}
        />

        <div className={layout.bleed}>
          <CalculatorPromo
            lang={lang}
            toolId="fit_file_viewer"
            namespace="toolExperience.files.promo"
          />
        </div>
      </div>
    </div>
  );
}
