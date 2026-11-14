"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fileAnalyticsProperties } from "@/lib/analytics";
import { trackToolEvent, type ToolId } from "@/lib/tool-analytics";

export function ToolFileDropzone({
  label,
  pickStrong,
  pickRest,
  supported,
  file,
  accept,
  onFileChange,
  dropzoneAria,
  supportedId,
  removeFileAria,
  trackingTool,
  selectedLayout = "below",
  replaceFileLabel,
}: {
  label?: string;
  pickStrong: string;
  pickRest: string;
  supported: string;
  file: File | null;
  accept: string;
  onFileChange: (file: File | null) => void;
  dropzoneAria?: string;
  supportedId?: string;
  removeFileAria?: string;
  trackingTool?: ToolId;
  selectedLayout?: "below" | "inside";
  replaceFileLabel?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onPickFiles = useCallback(() => {
    if (trackingTool) {
      trackToolEvent("tool_file_picker_opened", trackingTool);
    }
    fileInputRef.current?.click();
  }, [trackingTool]);

  const pickFirstFile = useCallback(
    (files: FileList | File[], method: "drop" | "picker") => {
      const [nextFile] = Array.from(files);
      if (nextFile) {
        if (trackingTool) {
          trackToolEvent("tool_file_selected", trackingTool, {
            input_method: method,
            ...fileAnalyticsProperties(nextFile),
          });
        }
        onFileChange(nextFile);
      }
    },
    [onFileChange, trackingTool],
  );

  return (
    <div className="space-y-3">
      {label ? (
        <div className="text-sm font-medium text-neutral-900 dark:text-white">
          {label}
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            pickFirstFile(event.target.files, "picker");
          }
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={onPickFiles}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          pickFirstFile(event.dataTransfer.files || [], "drop");
        }}
        onDragEnter={() => setIsDragging(true)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        data-slot="file-dropzone"
        data-has-file={file ? "true" : "false"}
        aria-label={dropzoneAria ?? label ?? pickStrong}
        aria-describedby={supportedId}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-compact border border-dashed p-7 text-center transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
          isDragging
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10"
            : "border-neutral-200 hover:border-emerald-500/40 hover:bg-neutral-50 dark:border-border dark:hover:border-emerald-500/40 dark:hover:bg-card/70",
        )}
        data-dragging={isDragging}
      >
        {file && selectedLayout === "inside" ? (
          <span
            data-slot="dropzone-selected"
            id={supportedId}
            className="flex min-w-0 flex-col items-center gap-2"
          >
            <span
              data-slot="dropzone-icon"
              className="grid size-12 place-items-center rounded-compact bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
            >
              <FileText className="size-5" />
            </span>
            <span className="max-w-full break-all text-sm font-bold text-neutral-900 dark:text-white">
              {file.name}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
            <span
              data-slot="dropzone-action"
              className="inline-flex h-9 items-center justify-center rounded-compact border border-emerald-600/25 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100"
            >
              {replaceFileLabel ?? pickStrong}
            </span>
          </span>
        ) : (
          <>
            <span
              data-slot="dropzone-icon"
              className="grid size-12 place-items-center rounded-compact bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
            >
              <Upload className="size-5" />
            </span>
            <span className="flex flex-col items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300 sm:flex-row sm:flex-wrap sm:justify-center">
              <span
                data-slot="dropzone-action"
                className="inline-flex h-9 items-center justify-center rounded-compact border border-emerald-600/25 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100"
              >
                {pickStrong}
              </span>
              <span>{pickRest}</span>
            </span>
            <span
              id={supportedId}
              className="block text-xs text-neutral-500 dark:text-neutral-400"
            >
              {supported}
            </span>
          </>
        )}
      </button>

      {file && selectedLayout === "below" ? (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
          <div className="flex items-center justify-between rounded-compact border border-neutral-200 bg-neutral-50/70 px-4 py-3 dark:border-border dark:bg-card/70">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded border border-neutral-100 bg-white p-2 dark:border-border dark:bg-secondary">
                <FileText className="size-4 text-neutral-500" />
              </div>
              <div className="min-w-0">
                <div className="break-all text-sm font-medium text-neutral-900 dark:text-white">
                  {file.name}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            </div>
            <button
              type="button"
              className={cn(
                buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className:
                    "h-8 w-8 shrink-0 p-0 text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20",
                }),
              )}
              onClick={(event) => {
                event.stopPropagation();
                if (trackingTool) {
                  trackToolEvent("tool_file_removed", trackingTool, {
                    ...fileAnalyticsProperties(file),
                  });
                }
                onFileChange(null);
              }}
              aria-label={removeFileAria ?? file.name}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
