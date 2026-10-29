"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Archive,
  Download,
  FileJson2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  createUserDataExport,
  deleteUserDataExport,
  listUserDataExports,
  userDataExportDownloadUrl,
} from "@/api/user-data-export";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  UserDataExportJobDto,
  UserDataExportLocationPrivacy,
  UserDataExportMode,
} from "@shared/user-data-export";

const ACTIVE_STATUSES = new Set([
  "QUEUED",
  "SNAPSHOTTING",
  "PACKAGING",
  "UPLOADING",
  "RETRY_WAIT",
]);

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return value;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

export function AccountDataExportSection({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  const t = useTranslations("AccountInner.dataExport");
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<UserDataExportMode>("AI_ANALYSIS");
  const [locationPrivacy, setLocationPrivacy] =
    useState<UserDataExportLocationPrivacy>("REDACT_FREQUENT_LOCATIONS");
  const [includeOriginalFiles, setIncludeOriginalFiles] = useState(false);

  const query = useQuery({
    queryKey: ["user-data-exports"],
    queryFn: listUserDataExports,
    refetchInterval: (state) =>
      state.state.data?.some((job) => ACTIVE_STATUSES.has(job.status))
        ? 3000
        : false,
    refetchOnWindowFocus: true,
  });
  const jobs = query.data ?? [];
  const activeJob = jobs.find((job) => ACTIVE_STATUSES.has(job.status));
  const latestJob = jobs[0];

  const createMutation = useMutation({
    mutationFn: createUserDataExport,
    onSuccess: async () => {
      toast.success(t("requestAccepted"));
      await queryClient.invalidateQueries({ queryKey: ["user-data-exports"] });
    },
    onError: () => toast.error(t("requestFailed")),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteUserDataExport,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-data-exports"] });
    },
    onError: () => toast.error(t("deleteFailed")),
  });

  const progress = useMemo(() => {
    if (!activeJob || activeJob.progress.total <= 0) return null;
    return Math.min(
      100,
      Math.round((activeJob.progress.current / activeJob.progress.total) * 100),
    );
  }, [activeJob]);

  const statusLabel = (job: UserDataExportJobDto) =>
    t(`statuses.${job.status}` as Parameters<typeof t>[0]);

  return (
    <section className="rounded-surface bg-muted/45 p-4">
      {showHeader ? (
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
            <Archive className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("title")}</h2>
            <p className="mt-1 max-w-3xl text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
              {t("description")}
            </p>
          </div>
        </div>
      ) : null}

      <div className={`${showHeader ? "mt-4 " : ""}grid gap-3 sm:grid-cols-2`}>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">{t("modeLabel")}</span>
          <Select
            value={mode}
            onValueChange={(value) => {
              const nextMode = value as UserDataExportMode;
              setMode(nextMode);
              if (nextMode === "AI_ANALYSIS") setIncludeOriginalFiles(false);
            }}
          >
            <SelectTrigger aria-label={t("modeLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AI_ANALYSIS">
                {t("modes.aiAnalysis")}
              </SelectItem>
              <SelectItem value="FULL_BACKUP">
                {t("modes.fullBackup")}
              </SelectItem>
            </SelectContent>
          </Select>
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {mode === "AI_ANALYSIS"
              ? t("modes.aiAnalysisHint")
              : t("modes.fullBackupHint")}
          </span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-medium">{t("privacyLabel")}</span>
          <Select
            value={locationPrivacy}
            onValueChange={(value) => {
              const nextPrivacy = value as UserDataExportLocationPrivacy;
              setLocationPrivacy(nextPrivacy);
              if (nextPrivacy !== "EXACT") setIncludeOriginalFiles(false);
            }}
          >
            <SelectTrigger aria-label={t("privacyLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="REDACT_FREQUENT_LOCATIONS">
                {t("privacy.redact")}
              </SelectItem>
              <SelectItem value="REMOVE_GPS">{t("privacy.remove")}</SelectItem>
              <SelectItem value="EXACT">{t("privacy.exact")}</SelectItem>
            </SelectContent>
          </Select>
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {t("privacyHint")}
          </span>
        </label>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
        <Checkbox
          className="mt-0.5"
          disabled={mode === "AI_ANALYSIS"}
          checked={includeOriginalFiles}
          onCheckedChange={(value) => {
            const checked = value === true;
            setIncludeOriginalFiles(checked);
            if (checked) setLocationPrivacy("EXACT");
          }}
        />
        <span>
          <span className="font-medium">{t("includeOriginals")}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {t("includeOriginalsHint")}
          </span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={Boolean(activeJob) || createMutation.isPending}
          onClick={() =>
            createMutation.mutate({
              mode,
              locationPrivacy,
              includeOriginalFiles,
            })
          }
        >
          {createMutation.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FileJson2 />
          )}
          {activeJob ? t("alreadyRunning") : t("createAction")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
          {t("refresh")}
        </Button>
      </div>

      <div className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3">
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loading")}
          </div>
        ) : !latestJob ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{statusLabel(latestJob)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(latestJob.requestedAt))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {latestJob.status === "READY" && latestJob.artifact ? (
                  <Button asChild size="sm">
                    <a href={userDataExportDownloadUrl(latestJob.id)} download>
                      <Download />
                      {t("download", {
                        size: formatBytes(latestJob.artifact.sizeBytes),
                      })}
                    </a>
                  </Button>
                ) : null}
                {["READY", "FAILED", "EXPIRED"].includes(latestJob.status) ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("deleteAction")}
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(latestJob.id)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </div>
            {activeJob ? (
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${progress ?? 8}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {progress == null
                    ? t("preparing")
                    : t("progress", {
                        progress,
                        stage: statusLabel(activeJob),
                      })}
                </p>
              </div>
            ) : null}
            {latestJob.artifact ? (
              <p className="text-xs text-muted-foreground">
                {t("expiresAt", {
                  date: new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(latestJob.artifact.expiresAt)),
                })}
              </p>
            ) : null}
            {latestJob.lastError ? (
              <p className="text-xs text-destructive">{t("failedHint")}</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t("boundary")}</span>
      </div>
    </section>
  );
}
