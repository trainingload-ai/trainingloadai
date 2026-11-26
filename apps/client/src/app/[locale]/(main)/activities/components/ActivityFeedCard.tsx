"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { removeActivityAnalysisCaches } from "@/lib/activity-analysis-cache";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Eye, MoreHorizontal, Trash2 } from "lucide-react";
import type { V2ActivityListItem } from "@/api/v2-activities";
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
import { ActivityCardFooter } from "@/components/activities/activity-card-footer";
import { Link } from "@/i18n/navigation";
import { getSportDisplayName, type SportDefinition } from "@/api/sports";
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import { activitySupportsDistance } from "@/lib/activity-presentation";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { ManagedActivityExportMenuItems } from "@deployment/managed-ui";

type ActivityCardTranslateFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

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

export function ActivityFeedCard({
  activity,
  t,
  onDeleted,
  onPlanLinkChange,
  sportCatalog,
  previewOnly = false,
}: {
  activity: V2ActivityListItem;
  t: ActivityCardTranslateFn;
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
  const queryClient = useQueryClient();
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
  const supportsDistance = activitySupportsDistance(sportCatalog, activity);
  const href = !previewOnly && activity.hashId
    ? `/activities/${encodeURIComponent(activity.hashId)}`
    : undefined;

  const handleDelete = async () => {
    if (!activity.hashId || deleting) return;
    try {
      setDeleting(true);
      const deleted = await deleteActivity(activity.hashId);
      if (deleted) {
        await removeActivityAnalysisCaches(queryClient, activity.hashId);
        onDeleted?.(activity.hashId);
      }
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
        distanceMeters={supportsDistance ? activity.distance : null}
        durationSeconds={activity.duration ?? null}
        load={activity.load == null ? null : Math.round(activity.load)}
        loadLabel={t("common.load")}
        note={activity.note}
        mapThumbnailDarkUrl={
          supportsDistance ? activity.mapThumbnailDarkUrl : null
        }
        mapThumbnailUrl={supportsDistance ? activity.mapThumbnailUrl : null}
        href={href}
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
                {href ? (
                  <DropdownMenuItem asChild>
                    <Link href={href} prefetch={false}>
                      <Eye className="mr-2 h-4 w-4" />
                      {t("actions.view")}
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>
                    <Eye className="mr-2 h-4 w-4" />
                    {t("actions.view")}
                  </DropdownMenuItem>
                )}
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
          <ActivityCardFooter
            activity={activity}
            onLinkedPlanWorkoutChange={(linked) =>
              onPlanLinkChange?.(activity.hashId, linked)
            }
          />
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
