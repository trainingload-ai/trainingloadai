"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import { cn } from "@/lib/utils";
import { DuplicateActivitiesModal } from "@/components/DuplicateActivitiesModal";
import { DuplicateCheckResult } from "@/api/activities";
import { useCheckDuplicateActivities } from "@/hooks/useCheckDuplicateActivities";
import { useUploadActivities } from "@/hooks/useUploadActivities";
import { useInspectActivityFiles } from "@/hooks/useInspectActivityFiles";
import type { TrackFileInspection } from "@shared/track-file-contract";
import {
  ImportBatchProgressDialog,
  rememberRecentImportBatchId,
} from "./ImportBatchProgressDialog";
import { rememberImportBatchSource } from "@deployment/managed-ui";

interface FileUploadDialogProps {
  maxFiles?: number;
  acceptedFileTypes?: string[];
  trigger?: React.ReactNode;
  onUploaded?: () => void;
  skipProgressAfterUpload?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type FileInspectionState = {
  pending?: boolean;
  inspection?: TrackFileInspection;
  error?: string;
};

function fileIdentity(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function FileUploadDialog({
  maxFiles = 100,
  acceptedFileTypes = [".gpx", ".tcx", ".fit"],
  trigger,
  onUploaded,
  skipProgressAfterUpload = false,
  open,
  onOpenChange,
}: FileUploadDialogProps) {
  // 文件上传流程：选择文件 -> 查重 -> 创建导入批次；默认继续展示批次进度。
  const { locale } = useParams<{ locale?: "zh" | "en" }>();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setIsOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const t = useTranslations("activities");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileInspections, setFileInspections] = useState<
    Record<string, FileInspectionState>
  >({});
  const [isDragActive, setIsDragActive] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<
    DuplicateCheckResult[]
  >([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const { mutate: inspectFiles } = useInspectActivityFiles();

  // 使用重复检查 hook
  const checkDuplicateMutation = useCheckDuplicateActivities({
    onSuccess: (data) => {
      // 查重只拦截有重复候选的批次；无重复则直接进入上传。
      const hasDuplicates = data.results.some(
        (result: DuplicateCheckResult) =>
          result.duplicateActivities && result.duplicateActivities.length > 0,
      );
      if (hasDuplicates) {
        setDuplicateResults(data.results);
        setShowDuplicateModal(true);
      } else {
        // 没有重复，直接上传
        uploadMutation.mutate(selectedFiles);
      }
    },
    onError: (error) => {
      toast.error(`${t("checkDuplicatesFailed")}: ${error.message}`);
    },
  });

  // 使用上传 hook，并在成功后打开 batch 进度对话框
  const uploadMutation = useUploadActivities({
    onSuccess: (data) => {
      // 默认创建批次后打开进度弹窗；活动列表等 Query 在 ImportBatchProgressDialog 观察到「整体完成」时再 invalidate（避免 202 后立即 GET /activities）。
      rememberImportBatchSource(data.id, selectedFiles);
      setSelectedFiles([]);
      setFileInspections({});
      rememberRecentImportBatchId(data.id);
      setIsOpen(false);
      toast.success(
        t("importProgress.batchCreatedToast", { count: data.totalCount }),
      );
      if (skipProgressAfterUpload) {
        onUploaded?.();
        return;
      }
      setCurrentBatchId(data.id);
      setIsProgressOpen(true);
    },
    onError: (error) => {
      toast.error(
        `${t("uploadFailed")}: ${error instanceof Error ? error.message : t("unknownError")}`,
      );
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const remainingSlots = Math.max(0, maxFiles - selectedFiles.length);
      const candidates = acceptedFiles.slice(0, remainingSlots);
      if (candidates.length === 0) return;
      setSelectedFiles((previous) =>
        [...previous, ...candidates].slice(0, maxFiles),
      );
      setFileInspections((previous) => {
        const next = { ...previous };
        candidates.forEach((file) => {
          next[fileIdentity(file)] = { pending: true };
        });
        return next;
      });
      setIsDragActive(false);
      // 使用 inspectFiles hook 检查文件，并更新文件检查状态
      inspectFiles(candidates, {
        onSuccess: ({ items }) => {
          setFileInspections((previous) => {
            const next = { ...previous };
            candidates.forEach((file, index) => {
              const item = items[index];
              next[fileIdentity(file)] = item?.valid
                ? { inspection: item.inspection }
                : { error: item?.error ?? t("unknownError") };
            });
            return next;
          });
        },
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : t("unknownError");
          setFileInspections((previous) => {
            const next = { ...previous };
            candidates.forEach((file) => {
              next[fileIdentity(file)] = { error: message };
            });
            return next;
          });
          toast.error(`${t("uploadFailed")}: ${message}`);
        },
      });
    },
    [inspectFiles, maxFiles, selectedFiles.length, t],
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive: dropzoneIsDragActive,
  } = useDropzone({
    onDrop,
    accept: {
      "application/gpx+xml": [".gpx"],
      "application/tcx+xml": [".tcx"],
      "application/vnd.ant.fit": [".fit"],
      "application/octet-stream": [".fit"],
    },
    maxFiles,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    multiple: true,
    /** 必须为 false：点击区域直接走隐藏 input，避免在 Dialog 里用 `open()` 冒泡触发导致系统文件选择器被浏览器拦截 */
    noClick: false,
  });
  const rootProps = getRootProps() as React.HTMLAttributes<HTMLDivElement>;
  const inputProps =
    getInputProps() as React.InputHTMLAttributes<HTMLInputElement>;

  const removeFile = (index: number) => {
    setSelectedFiles((previous) => {
      const removed = previous[index];
      if (removed) {
        setFileInspections((inspections) => {
          const next = { ...inspections };
          delete next[fileIdentity(removed)];
          return next;
        });
      }
      return previous.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      // 上传前先查重，让用户决定是否继续导入疑似重复活动。
      checkDuplicateMutation.mutate(selectedFiles);
    }
  };

  const handleForceUpload = () => {
    // 用户确认仍要导入时跳过重复提示，后端导入管线仍会记录具体 item 状态。
    uploadMutation.mutate(selectedFiles);
    setShowDuplicateModal(false);
  };

  const handleCancelUpload = () => {
    // 取消上传
    setShowDuplicateModal(false);
    // handleCancel();
  };

  const handleCancel = () => {
    setSelectedFiles([]);
    setFileInspections({});
    setIsOpen(false);
  };

  const hasPendingInspection = selectedFiles.some(
    (file) => fileInspections[fileIdentity(file)]?.pending,
  );
  const hasInspectionError = selectedFiles.some(
    (file) => fileInspections[fileIdentity(file)]?.error,
  );

  const formatFileSize = (bytes: number) => {
    // 仅用于前端文件列表展示，不参与上传逻辑。
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <>
      <AdaptiveDialog open={isOpen} onOpenChange={setIsOpen}>
        {trigger !== null ? (
          <AdaptiveDialogTrigger asChild>
            {trigger ?? (
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 lg:mr-2" />
                <span className="hidden lg:block">{t("importFiles")}</span>
              </Button>
            )}
          </AdaptiveDialogTrigger>
        ) : null}
        <AdaptiveDialogContent
          className="flex max-h-[96dvh] flex-col overflow-hidden"
          desktopClassName="sm:max-w-[600px]"
        >
          <AdaptiveDialogHeader className="shrink-0">
            <AdaptiveDialogTitle>
              {t("importActivityFiles")}
            </AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              {t("supportedFormatsDescription", {
                maxFiles,
                formats: "GPX、TCX、FIT",
              })}
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
            {/* 拖拽上传区域 */}
            <div
              {...rootProps}
              className={cn(
                "cursor-pointer rounded-md border-2 border-dashed p-8 text-center transition-colors",
                isDragActive || dropzoneIsDragActive
                  ? "border-ring bg-muted/45"
                  : "border-border hover:border-muted-foreground",
              )}
            >
              <input {...inputProps} />
              <Upload className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
              <p className="mb-2 text-base font-medium text-muted-foreground">
                {isDragActive || dropzoneIsDragActive
                  ? t("dropFilesHere")
                  : t("dragOrClickToSelect")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("supportedFormats", {
                  formats: acceptedFileTypes.join(", "),
                })}
              </p>
            </div>

            {/* 已选择的文件列表 */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">
                  {t("selectedFiles", { count: selectedFiles.length })}
                </h4>
                <div className="space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded-xs border"
                    >
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p
                            className="max-w-full truncate text-sm font-medium text-foreground"
                            title={file.name}
                          >
                            {file.name}
                          </p>
                          <p className="text-mobile-caption text-muted-foreground pc:text-xs">
                            {formatFileSize(file.size)}
                          </p>
                          {(() => {
                            const state = fileInspections[fileIdentity(file)];
                            if (state?.pending) {
                              return (
                                <span className="mt-1 inline-flex items-center gap-1 text-mobile-caption text-muted-foreground pc:text-xs">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  TrackSwap
                                </span>
                              );
                            }
                            if (state?.error) {
                              return (
                                <span className="mt-1 block text-mobile-caption pc:text-xs text-red-500">
                                  {state.error}
                                </span>
                              );
                            }
                            const inspection = state?.inspection;
                            if (!inspection) return null;
                            const detected = inspection.format.toUpperCase();
                            const extension =
                              inspection.extensionFormat?.toUpperCase();
                            return (
                              <span
                                className={cn(
                                  "mt-1 inline-flex rounded-xs border px-1.5 py-0.5 text-mobile-unit pc:text-[10px] font-semibold",
                                  inspection.extensionMismatch
                                    ? "border-amber-300 text-amber-600"
                                    : "border-emerald-300 text-emerald-600",
                                )}
                              >
                                {inspection.extensionMismatch && extension
                                  ? `${extension} → ${detected}`
                                  : detected}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeFile(index)}
                        className="shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <AdaptiveDialogFooter
            className={cn(adaptiveDialogFooterActionsClassName, "shrink-0")}
          >
            <Button
              type="button"
              variant="outline"
              size="dialog-action"
              className={adaptiveDialogFooterActionButtonClassName}
              onClick={handleCancel}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="dialog-action"
              className={adaptiveDialogFooterActionButtonClassName}
              onClick={handleUpload}
              disabled={
                selectedFiles.length === 0 ||
                hasPendingInspection ||
                hasInspectionError ||
                uploadMutation.isPending ||
                checkDuplicateMutation.isPending
              }
            >
              {uploadMutation.isPending || checkDuplicateMutation.isPending
                ? t("uploading")
                : selectedFiles.length > 0
                  ? t("uploadWithCount", { count: selectedFiles.length })
                  : t("upload")}
            </Button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>

      <ImportBatchProgressDialog
        open={isProgressOpen}
        onOpenChange={setIsProgressOpen}
        batchId={currentBatchId}
        onOverallDone={() => {
          // 列表 / PMC / 首页等缓存已在 ImportBatchProgressDialog 整体完成时统一 invalidate
          onUploaded?.();
          router.refresh();
        }}
      />

      {/* 重复活动提示弹框 */}
      <DuplicateActivitiesModal
        open={showDuplicateModal}
        onOpenChange={setShowDuplicateModal}
        duplicateResults={duplicateResults}
        onCreateNew={handleForceUpload}
        onCancel={handleCancelUpload}
        onViewActivity={(hashId) => {
          // 可以添加查看活动详情的逻辑
          window.open(`${locale}/activities/${hashId}`, "_blank");
        }}
      />
    </>
  );
}
