"use client";

import React, { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { Clock, MapPin, ChevronDown, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DuplicateCheckResult } from "@/api/activities";
import { useStore } from "@/lib/store";
import { formatValue } from "@/hooks/useFormatterBySettings";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

interface DuplicateActivitiesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicateResults: DuplicateCheckResult[];
  onCreateNew: () => void;
  onCancel: () => void;
  onViewActivity?: (hashId: string) => void;
}

// Simple sport type label mapping
const getSportTypeDisplayLabel = (
  sportType: string,
  t: (key: string) => string,
) => {
  return t(`sportTypes.${sportType}`) || t("sportTypes.UNKNOWN");
};
export function DuplicateActivitiesModal({
  open,
  onOpenChange,
  duplicateResults,
  onCreateNew,
  onCancel,
  onViewActivity,
}: DuplicateActivitiesModalProps) {
  const t = useTranslations("activities.duplicateActivities");
  const tActivityTitle = useTranslations("ActivityTitle");
  const locale = useLocale();
  const dateLocale = locale === "zh" ? zhCN : enUS;
  const [openFiles, setOpenFiles] = useState<{ [key: number]: boolean }>({});
  const duplicateFiles = duplicateResults.filter((result) => result.isRepeat);
  const { systemUnit } = useStore();
  if (duplicateFiles.length === 0) {
    return null;
  }

  const handleViewActivity = (hashId: string) => {
    if (onViewActivity) {
      onViewActivity(hashId);
    } else {
      // Default behavior: open activity details in new tab
      window.open(`/activities/${hashId}`, "_blank");
    }
  };

  const toggleFile = (index: number) => {
    setOpenFiles((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80dvh] flex-col overflow-hidden pc:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <div className="mb-4 shrink-0 text-sm text-muted-foreground">
          {t("description", { count: duplicateFiles.length })}
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="max-w-full min-w-0 space-y-2 overflow-x-hidden">
            {duplicateFiles.map((file, fileIndex) => (
              <div
                key={fileIndex}
                className="max-w-full min-w-0 rounded-sm border p-2"
              >
                <div
                  className="mb-3 max-w-full truncate text-sm font-medium text-blue-600"
                  title={file.fileName}
                >
                  {file.fileName}
                </div>

                {file.duplicateActivities &&
                  file.duplicateActivities.length > 0 && (
                    <Collapsible
                      open={openFiles[fileIndex]}
                      onOpenChange={() => toggleFile(fileIndex)}
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="auto"
                          className="w-full justify-between p-2"
                        >
                          <span className="text-mobile-caption pc:text-xs text-muted-foreground">
                            {t("possibleDuplicates")}(
                            {file.duplicateActivities.length})
                          </span>
                          {openFiles[fileIndex] ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="space-y-2 mt-2">
                        {file.duplicateActivities.map(
                          (activity, activityIndex) => (
                            <div
                              key={activityIndex}
                              className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div
                                  className="min-w-0 flex-1 truncate text-mobile-caption font-medium pc:text-xs"
                                  title={
                                    getLocalizedActivityTitle(
                                      activity,
                                      tActivityTitle,
                                      t("unnamedActivity"),
                                    )
                                  }
                                >
                                  {getLocalizedActivityTitle(
                                    activity,
                                    tActivityTitle,
                                    t("unnamedActivity"),
                                  )}
                                </div>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() =>
                                    handleViewActivity(activity.hashId)
                                  }
                                  className="flex shrink-0 items-center gap-1"
                                >
                                  {t("viewActivity")}
                                </Button>
                              </div>

                              <div className="flex flex-wrap gap-2 text-mobile-caption pc:text-xs">
                                {activity.sportType && (
                                  <Badge
                                    variant="secondary"
                                    className="text-mobile-caption pc:text-xs"
                                  >
                                    {getSportTypeDisplayLabel(
                                      activity.sportType,
                                      t,
                                    )}
                                  </Badge>
                                )}

                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {format(
                                    new Date(activity.startTime),
                                    locale === "zh"
                                      ? "yyyy年MM月dd日 HH:mm"
                                      : "MMM dd, yyyy HH:mm",
                                    {
                                      locale: dateLocale,
                                    },
                                  )}
                                </div>

                                {activity.totalDistance && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {formatValue(
                                      activity.totalDistance,
                                      "distance",
                                      systemUnit,
                                    )}
                                  </div>
                                )}

                                {activity.totalElapsedTime && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {formatValue(
                                      activity.totalElapsedTime,
                                      "duration",
                                      systemUnit,
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ),
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex shrink-0 gap-2">
          <Button size={"sm"} variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button size={"sm"} onClick={onCreateNew}>
            {t("createNew")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
