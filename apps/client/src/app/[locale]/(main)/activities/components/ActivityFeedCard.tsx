"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Eye, MoreHorizontal, Trash2, Upload } from "lucide-react";
import type {
  V2ActivityListItem,
  V2ActivityThirdPartyMapping,
} from "@/api/v2-activities";
import { dayjs } from "@/lib/dayjs-tz";
import { monthDayClockFormat } from "@/lib/time-format";
import { resolveActivityDisplayTimezone } from "@/lib/user-timezone";
import { useStore, type TimeFormat } from "@/lib/store";
import { useUserProfile } from "@/hooks/useUserProfile";
import { deleteActivity, exportActivityByHashId } from "@/api/activity";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActivitySummaryCard } from "@/components/activities/activity-summary-card";
import { ActivityPlanLinkControl } from "@/components/plan/activity-plan-link-control";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getSportDisplayName, type SportDefinition } from "@/api/sports";
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import {
  isThirdPartyProviderBrand,
  ProviderFavicon,
  thirdPartyProviderName,
  type ThirdPartyProviderBrand,
} from "@/components/third-party/provider-favicon";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { ManagedActivityExportMenuItems } from "@deployment/managed-ui";

type ActivityCardTranslateFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

function ProviderBadge({
  provider,
  variant,
  manualLabel,
}: {
  provider: ThirdPartyProviderBrand | "manual";
  variant: "inbound" | "outbound";
  manualLabel: string;
}) {
  const isManual = provider === "manual";
  const label = isManual ? manualLabel : thirdPartyProviderName(provider);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={label}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            variant === "inbound"
              ? "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              : "border border-border bg-background/65 text-muted-foreground",
          )}
        >
          <span className="inline-flex size-4 items-center justify-center overflow-hidden rounded-xs bg-white">
            {isManual ? (
              <Upload className="size-3 text-neutral-600" aria-hidden />
            ) : (
              <ProviderFavicon provider={provider} className="size-4" />
            )}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span translate={isManual ? undefined : "no"}>{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function ThirdPartyMappingBadges({
  mappings,
  side,
  excludeProvider,
  manualLabel,
}: {
  mappings: V2ActivityThirdPartyMapping[];
  side: "inbound" | "outbound";
  excludeProvider?: V2ActivityListItem["primaryProvider"];
  manualLabel: string;
}) {
  const seen = new Set<string>();
  const providers: ThirdPartyProviderBrand[] = [];

  for (const mapping of mappings) {
    const direction = mapping.syncDirection ?? "IMPORT";
    const belongsOnSide =
      side === "inbound"
        ? direction === "IMPORT" || direction === "BIDIRECTIONAL"
        : direction === "EXPORT" || direction === "BIDIRECTIONAL";
    if (
      !belongsOnSide ||
      mapping.provider === excludeProvider ||
      !isThirdPartyProviderBrand(mapping.provider) ||
      seen.has(mapping.provider)
    ) {
      continue;
    }
    seen.add(mapping.provider);
    providers.push(mapping.provider);
  }

  if (providers.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {providers.map((provider) => (
        <ProviderBadge
          key={`${side}:${provider}`}
          provider={provider}
          variant={side}
          manualLabel={manualLabel}
        />
      ))}
    </div>
  );
}

function formatDateTime(
  tr: ActivityCardTranslateFn,
  startTime: string | null,
  displayTz: string,
  timeFormat: TimeFormat,
) {
  if (!startTime) return tr("common.unknownTime");
  const d = dayjs.utc(startTime).tz(displayTz);
  if (!d.isValid()) return tr("common.unknownTime");
  return d.format(monthDayClockFormat(timeFormat));
}

function formatDistance(meters: number | null) {
  if (typeof meters !== "number") return "--";
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number | null) {
  if (typeof seconds !== "number") return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${`${m}`.padStart(2, "0")}:${`${s}`.padStart(2, "0")}`
    : `${m}:${`${s}`.padStart(2, "0")}`;
}

function visibleStatusLabel(
  t: ActivityCardTranslateFn,
  status: V2ActivityListItem["status"],
) {
  if (status === "PROCESSING") return t("status.processing");
  if (status === "PARTIAL_FAILED") return t("status.partialFailed");
  if (status === "FAILED") return t("status.failed");
  return null;
}

export function ActivityFeedCard({
  activity,
  t,
  onOpen,
  onDeleted,
  onPlanLinkChange,
  sportCatalog,
  previewOnly = false,
}: {
  activity: V2ActivityListItem;
  t: ActivityCardTranslateFn;
  onOpen: (hashId: string) => void;
  onDeleted?: (hashId: string) => void;
  onPlanLinkChange?: (
    hashId: string,
    linked: V2ActivityListItem["linkedPlanWorkout"],
  ) => void;
  sportCatalog: SportDefinition[];
  /** 开发期视觉夹具不允许触发真实活动的打开、导出或删除操作。 */
  previewOnly?: boolean;
}) {
  const tSports = useTranslations("SportCatalog");
  const tActivityTitle = useTranslations("ActivityTitle");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const sportLabel = getSportDisplayName(sportCatalog, activity, tSports);
  const displayTitle = getLocalizedActivityTitle(
    activity,
    tActivityTitle,
    t("common.untitledActivity"),
  );
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportType, setExportType] = React.useState<"gpx" | "fit" | "tcx">(
    "gpx",
  );
  const [exporting, setExporting] = React.useState(false);
  const disableExport = activity.sportType === "SWIM";
  const { data: profile } = useUserProfile();
  const { timeFormat } = useStore();
  const displayTz = React.useMemo(
    () =>
      resolveActivityDisplayTimezone(
        { timezone: activity.timezone },
        profile ?? undefined,
      ),
    [activity.timezone, profile],
  );
  const statusText = visibleStatusLabel(t, activity.status);

  const handleDelete = async () => {
    if (!activity.hashId || deleting) return;
    try {
      setDeleting(true);
      const deleted = await deleteActivity(activity.hashId);
      if (deleted) onDeleted?.(activity.hashId);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  const handleExport = async () => {
    if (!activity.hashId || exporting || disableExport) return;
    try {
      setExporting(true);
      const { blob, filename } = await exportActivityByHashId(
        activity.hashId,
        exportType,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (error) {
      console.error("导出失败", error);
      toast.error(t("actions.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <ActivitySummaryCard
        title={displayTitle}
        sportType={activity.sportType}
        subSportType={activity.subSportType}
        sportLabel={sportLabel}
        startLabel={formatDateTime(
          t,
          activity.startTime,
          displayTz,
          timeFormat,
        )}
        distanceLabel={formatDistance(activity.distance)}
        durationLabel={formatDuration(activity.duration)}
        load={activity.load == null ? null : Math.round(activity.load)}
        loadLabel={t("common.load")}
        loadPlacement="meta"
        note={activity.note}
        mapThumbnailDarkUrl={activity.mapThumbnailDarkUrl}
        mapThumbnailUrl={activity.mapThumbnailUrl}
        onOpen={previewOnly ? undefined : () => onOpen(activity.hashId)}
        headerAction={
          previewOnly ? undefined : (
            <DropdownMenu>
              <DropdownMenuTrigger
                variant="ghost"
                size="icon"
                className="cursor-pointer hover:bg-background active:bg-background"
              >
                <MoreHorizontal />
                <span className="sr-only">{t("actions.openMenu")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    if (!activity.hashId) return;
                    onOpen(activity.hashId);
                  }}
                  disabled={!activity.hashId}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {t("actions.view")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    if (disableExport || publicDemo.active) return;
                    setExportOpen(true);
                  }}
                  disabled={disableExport || publicDemo.active}
                  title={
                    publicDemo.active ? demoText("readOnlyAction") : undefined
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t("actions.export")}
                </DropdownMenuItem>
                <ManagedActivityExportMenuItems
                  activity={activity}
                  disabled={publicDemo.active}
                  t={t}
                />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    if (publicDemo.active) return;
                    setConfirmOpen(true);
                  }}
                  disabled={publicDemo.active}
                  title={
                    publicDemo.active ? demoText("readOnlyAction") : undefined
                  }
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {statusText ? (
                <span className="rounded-md bg-muted px-2 py-1 text-mobile-caption pc:text-xs text-muted-foreground">
                  {statusText}
                </span>
              ) : null}
              <ProviderBadge
                provider={
                  isThirdPartyProviderBrand(activity.primaryProvider)
                    ? activity.primaryProvider
                    : "manual"
                }
                variant="inbound"
                manualLabel={t("provider.manual")}
              />
              <ThirdPartyMappingBadges
                mappings={activity.thirdPartyMappings}
                side="inbound"
                excludeProvider={activity.primaryProvider}
                manualLabel={t("provider.manual")}
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ThirdPartyMappingBadges
                mappings={activity.thirdPartyMappings}
                side="outbound"
                manualLabel={t("provider.manual")}
              />
              {activity.planLinkUiVisible ? (
                <ActivityPlanLinkControl
                  activity={activity}
                  onLinkedPlanWorkoutChange={(linked) =>
                    onPlanLinkChange?.(activity.hashId, linked)
                  }
                />
              ) : null}
            </div>
          </div>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("actions.confirmDeleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("actions.confirmDeleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? t("actions.deleting") : t("actions.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={exportOpen} onOpenChange={setExportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("actions.exportDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("actions.exportDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Select
              value={exportType}
              onValueChange={(value) =>
                setExportType(value as "gpx" | "fit" | "tcx")
              }
            >
              <SelectTrigger size="default">
                <SelectValue
                  placeholder={t("actions.selectExportTypePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpx">GPX</SelectItem>
                <SelectItem value="fit">FIT</SelectItem>
                <SelectItem value="tcx">TCX</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exporting}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleExport} disabled={exporting}>
              {exporting ? t("actions.exporting") : t("actions.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
