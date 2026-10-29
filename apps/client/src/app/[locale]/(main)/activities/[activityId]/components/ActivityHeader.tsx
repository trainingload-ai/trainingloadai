"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity as ActivityIcon,
  Bike,
  CalendarClock,
  CircleHelp,
  Database,
  Dumbbell,
  Footprints,
  Loader2,
  Mountain,
  Orbit,
  Pencil,
  PersonStanding,
  ShipWheel,
  StretchHorizontal,
  Waves,
} from "lucide-react";
import { Activity, SportType, setActivitiesSportType } from "@/api/activities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
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
import { ActivitySessionRpeControl } from "./ActivitySessionRpeControl";
import { useUserProfile } from "@/hooks/useUserProfile";
import { resolveActivityDisplayTimezone } from "@/lib/user-timezone";
import { getThirdPartyProviderName } from "@deployment/provider-presentation";
import { clockIntlOptions } from "@/lib/time-format";
import { useLocale } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
  getLocalizedSportDefinitionName,
  getSportDisplayName,
  useSportCatalog,
  type SportDefinition,
} from "@/api/sports";
import { getActivityDetailPolicy } from "@/lib/activity-detail-policy";
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import { getActivitySportVisual } from "@shared/activity-visual";
import { cn } from "@/lib/utils";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

interface ActivityHeaderProps {
  activity: Activity;
}

const SPORT_TYPE_CHIP_CLASS =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-muted px-2.5 text-mobile-caption font-medium text-foreground shadow-none pc:text-xs";

function ActivitySportTypeIcon({
  sportType,
  sportDefinitionCode,
  className,
}: {
  sportType: SportType | string;
  sportDefinitionCode?: string | null;
  className?: string;
}) {
  const visual = getActivitySportVisual(sportType, sportDefinitionCode);
  const iconClassName = cn("h-3.5 w-3.5 text-muted-foreground", className);

  switch (visual) {
    case "cycling":
      return <Bike aria-hidden className={iconClassName} />;
    case "swim":
      return <Waves aria-hidden className={iconClassName} />;
    case "hiking":
      return <Mountain aria-hidden className={iconClassName} />;
    case "strength":
      return <Dumbbell aria-hidden className={iconClassName} />;
    case "stretching":
      return <StretchHorizontal aria-hidden className={iconClassName} />;
    case "hiit":
      return <ActivityIcon aria-hidden className={iconClassName} />;
    case "yoga":
      return <PersonStanding aria-hidden className={iconClassName} />;
    case "rowing":
      return <ShipWheel aria-hidden className={iconClassName} />;
    case "elliptical":
      return <Orbit aria-hidden className={iconClassName} />;
    case "unknown":
      return <CircleHelp aria-hidden className={iconClassName} />;
    default:
      return <Footprints aria-hidden className={iconClassName} />;
  }
}

function formatThirdPartyProvider(provider: string, uploadLabel: string) {
  const normalized = provider
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  if (normalized === "upload" || normalized === "manual") {
    return uploadLabel;
  }
  return getThirdPartyProviderName(normalized) ?? provider;
}

export function ActivityHeader({ activity }: ActivityHeaderProps) {
  const t = useTranslations();
  const tDetail = useTranslations("ActivityDetail");
  const tActivityTitle = useTranslations("ActivityTitle");
  const tSports = useTranslations("SportCatalog");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const locale = useLocale();
  const { data: profile } = useUserProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSport, setPendingSport] = useState<SportDefinition | null>(
    null,
  );
  const [selectedSportCode, setSelectedSportCode] = useState(
    activity.subSportType ?? activity.sportDefinitionCode ?? "OTHER",
  );
  const queryClient = useQueryClient();
  const { timeFormat } = useStore();
  const { data: sportCatalog = [] } = useSportCatalog();
  const currentSportType = (activity.sportType as SportType) || "UNKNOWN";
  const detailPolicy = getActivityDetailPolicy(activity);
  const currentSportDefinition =
    sportCatalog.find(
      (sport) =>
        sport.code === (activity.subSportType ?? activity.sportDefinitionCode),
    ) ??
    sportCatalog.find(
      (sport) => sport.family === currentSportType && sport.isDefaultForFamily,
    );
  const currentSportLabel = getSportDisplayName(
    sportCatalog,
    activity,
    tSports,
  );

  // 设置运动类型的 mutation
  const setSportTypeMutation = useMutation({
    mutationFn: (sport: SportDefinition) =>
      setActivitiesSportType({
        activities: [
          {
            hashId: activity.hashId!,
            sportType: sport.family as SportType,
            subSportType: sport.code,
          },
        ],
        enableSmartInfer: false,
      }),
    onSuccess: () => {
      toast.success(t("sportType.confirmed"));
      queryClient.invalidateQueries({
        queryKey: queryKeys.activity.detail(activity.hashId ?? ""),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.root.activities,
      });
      setPendingSport(null);
      setConfirmOpen(false);
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast.error(t("sportType.confirmationFailed") + ": " + error.message);
      setPendingSport(null);
      setConfirmOpen(false);
      setSelectedSportCode(currentSportDefinition?.code ?? "OTHER");
    },
  });

  useEffect(() => {
    setSelectedSportCode(currentSportDefinition?.code ?? "OTHER");
  }, [
    activity.subSportType,
    activity.sportDefinitionCode,
    currentSportDefinition?.code,
  ]);

  const handleSportTypeChange = (nextSportCode: string) => {
    if (publicDemo.active || setSportTypeMutation.isPending) return;
    if (nextSportCode === currentSportDefinition?.code) return;
    const definition = sportCatalog.find(
      (sport) => sport.code === nextSportCode,
    );
    if (!definition) return;
    setSelectedSportCode(nextSportCode);
    setPendingSport(definition);
    setConfirmOpen(true);
  };

  const handleConfirmSportTypeChange = () => {
    if (publicDemo.active || !pendingSport) return;
    setSportTypeMutation.mutate(pendingSport);
  };

  const handleCancelSportTypeChange = () => {
    setConfirmOpen(false);
    setPendingSport(null);
    setSelectedSportCode(currentSportDefinition?.code ?? "OTHER");
  };

  const handleEditClick = () => {
    if (publicDemo.active) return;
    setIsEditing(true);
  };

  const displayTz = resolveActivityDisplayTimezone(
    { timezone: activity.timezone },
    profile ?? undefined,
  );
  const startDate = activity.startTime
    ? new Date(activity.startTime).toLocaleString(locale, {
        timeZone: displayTz,
        dateStyle: "medium",
        timeStyle: "short",
        ...clockIntlOptions(timeFormat),
      })
    : "-";
  const source = activity.thirdPartyProvider
    ? formatThirdPartyProvider(
        activity.thirdPartyProvider,
        tDetail("sourceUpload"),
      )
    : "Trainingload.ai";
  const displayTitle = getLocalizedActivityTitle(
    activity,
    tActivityTitle,
    tDetail("untitledActivity"),
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {displayTitle}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {isEditing ? (
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={selectedSportCode}
                onValueChange={handleSportTypeChange}
                disabled={setSportTypeMutation.isPending}
              >
                <SelectTrigger
                  aria-label={t("activityDetails.editSportType")}
                  className={cn(
                    SPORT_TYPE_CHIP_CLASS,
                    "w-auto min-w-32 max-w-56 justify-between hover:bg-muted focus-visible:ring-1 [&_svg]:size-3.5",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sportCatalog.map((sport) => (
                    <SelectItem key={sport.code} value={sport.code}>
                      <div className="flex min-w-0 items-center gap-1.5 text-mobile-caption pc:text-xs">
                        <ActivitySportTypeIcon
                          sportType={sport.family as SportType}
                          sportDefinitionCode={sport.code}
                          className="h-3 w-3"
                        />
                        <span className="truncate">
                          {getLocalizedSportDefinitionName(sport, tSports)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {setSportTypeMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
          ) : detailPolicy.canEditSportType ? (
            <button
              type="button"
              aria-label={`${t("activityDetails.editSportType")}: ${currentSportLabel}`}
              className={cn(
                SPORT_TYPE_CHIP_CLASS,
                "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              )}
              onClick={handleEditClick}
              disabled={publicDemo.active}
              title={publicDemo.active ? demoText("readOnlyAction") : undefined}
            >
              <ActivitySportTypeIcon
                sportType={currentSportType}
                sportDefinitionCode={
                  activity.subSportType ?? activity.sportDefinitionCode
                }
              />
              <span className="max-w-[10rem] truncate">
                {currentSportLabel}
              </span>
              <Pencil aria-hidden className="h-3 w-3 text-muted-foreground" />
            </button>
          ) : (
            <span className={SPORT_TYPE_CHIP_CLASS}>
              <ActivitySportTypeIcon
                sportType={currentSportType}
                sportDefinitionCode={
                  activity.subSportType ?? activity.sportDefinitionCode
                }
              />
              <span className="max-w-[10rem] truncate">
                {currentSportLabel}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-mobile-caption text-muted-foreground pc:text-xs">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Database className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="sr-only">{tDetail("source")}：</span>
            <span className="truncate">{source}</span>
          </span>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 tabular-nums">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="sr-only">{t("activities.startTime")}：</span>
            <span className="truncate">{startDate}</span>
          </span>
        </div>
        <ActivitySessionRpeControl activity={activity} />
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (setSportTypeMutation.isPending) return;
          if (!open) {
            handleCancelSportTypeChange();
            return;
          }
          setConfirmOpen(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tDetail("sportTypeRecalculateConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tDetail("sportTypeRecalculateConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={setSportTypeMutation.isPending}
              onClick={handleCancelSportTypeChange}
            >
              {tDetail("sportTypeRecalculateConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSportTypeChange}
              disabled={setSportTypeMutation.isPending}
            >
              {setSportTypeMutation.isPending ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("sportType.setting")}
                </span>
              ) : (
                tDetail("sportTypeRecalculateConfirmContinue")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
