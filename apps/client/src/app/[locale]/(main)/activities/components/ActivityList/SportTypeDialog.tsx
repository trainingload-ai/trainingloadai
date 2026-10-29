"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ActivitySportTypeItem, SportType } from "@/api/activities";
import { useSportCatalog } from "@/api/sports";

interface SportTypeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activities: ActivitySportTypeItem[];
  onConfirm: (activities: ActivitySportTypeItem[]) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

export function SportTypeDialog({
  isOpen,
  onClose,
  activities,
  onConfirm,
  onSkip,
  isLoading = false,
}: SportTypeDialogProps) {
  const t = useTranslations("sportType");
  const [editedActivities, setEditedActivities] =
    useState<ActivitySportTypeItem[]>(activities);
  const { data: sportCatalog = [] } = useSportCatalog();

  useEffect(() => {
    setEditedActivities(activities);
    return () => {
      setEditedActivities(activities);
    };
  }, [activities]);

  const updateActivitySportType = (
    index: number,
    sportDefinitionCode: string,
  ) => {
    const definition = sportCatalog.find(
      (sport) => sport.code === sportDefinitionCode,
    );
    if (!definition) return;
    setEditedActivities((prev) =>
      prev.map((activity, i) =>
        i === index
          ? {
              ...activity,
              sportType: definition.family as SportType,
              subSportType: definition.code,
            }
          : activity,
      ),
    );
  };

  const handleConfirm = () => {
    onConfirm(editedActivities);
  };

  const definitionFor = (activity: ActivitySportTypeItem) =>
    sportCatalog.find(
      (sport) =>
        sport.code === (activity.subSportType ?? activity.sportDefinitionCode),
    ) ??
    sportCatalog.find(
      (sport) =>
        sport.family === activity.sportType && sport.isDefaultForFamily,
    );

  return (
    <AdaptiveDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AdaptiveDialogContent
        className="max-h-[80vh] overflow-y-auto"
        desktopClassName="sm:max-w-[600px]"
      >
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{t("confirmTitle")}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            {t("confirmDescription")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {editedActivities.map((activity, index) => (
            <div
              key={activity.hashId}
              className="flex items-center justify-between rounded-surface border p-3"
            >
              <div className="flex items-center space-x-3">
                <div className="text-mobile-caption pc:text-xs font-mono text-muted-foreground truncate max-w-[220px]">
                  {activity.fileName || activity.hashId}
                </div>
                <Badge variant="outline">
                  {definitionFor(activity)?.displayName ?? activity.sportType}
                </Badge>
              </div>

              <Select
                value={definitionFor(activity)?.code}
                onValueChange={(value) => updateActivitySportType(index, value)}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sportCatalog.map((sport) => (
                    <SelectItem key={sport.code} value={sport.code}>
                      {sport.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <AdaptiveDialogFooter className={adaptiveDialogFooterActionsClassName}>
          <Button
            type="button"
            variant="outline"
            size="dialog-action"
            className={adaptiveDialogFooterActionButtonClassName}
            onClick={onSkip}
            disabled={isLoading}
          >
            {t("skip")}
          </Button>
          <Button
            type="button"
            size="dialog-action"
            className={adaptiveDialogFooterActionButtonClassName}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? t("setting") : t("confirm")}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
