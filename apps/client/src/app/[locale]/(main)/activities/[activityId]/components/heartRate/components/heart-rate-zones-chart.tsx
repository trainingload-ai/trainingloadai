"use client";

import { useHeartRateZones } from "@/api/use-heart-rate";
import { HeartRateZoneModel } from "@/api/settings";
import { HeartRateZoneHelpDialog } from "@/components/HeartRateZoneHelpDialog";
import { useActivityId } from "@/hooks/useActivityId";
import { useTranslations } from "next-intl";
import { getHeartRateZoneColorByZone } from "@/utils/util";
import { ActivityZoneTable } from "../../activity-zone-table";

export const HeartRateZonesChart = () => {
  const activityId = useActivityId();
  const { data, isLoading } = useHeartRateZones(activityId);
  const t = useTranslations("HeartRatePage");
  const tActivity = useTranslations("ActivityDetail");

  const currentModel = data?.benchmark as HeartRateZoneModel | string;

  const rows = (data?.zones || []).map((zone, index) => {
    const min = typeof zone.min === "number" ? Math.round(zone.min) : "–";
    const max = typeof zone.max === "number" ? Math.round(zone.max) : "–";

    return {
      id: `${zone.name || "zone"}-${index}`,
      label: zone.name?.toUpperCase() || `Z${index + 1}`,
      range: `${min}–${max} bpm`,
      percent: Number(zone.percent ?? 0),
      duration: Number(zone.duration ?? 0),
      color: getHeartRateZoneColorByZone(index),
      average:
        typeof zone.avg === "number" ? `${Math.round(zone.avg)} bpm` : "–",
    };
  });

  return (
    <ActivityZoneTable
      rows={rows}
      isLoading={isLoading}
      zoneLabel={tActivity("zoneTable.zone")}
      rangeLabel={tActivity("zoneTable.range")}
      distributionLabel={tActivity("zoneTable.distribution")}
      durationLabel={tActivity("zoneTable.duration")}
      averageLabel={t("tooltip.avgHeartRate")}
      emptyLabel={t("noData")}
      action={
        <HeartRateZoneHelpDialog
          currentModel={currentModel || HeartRateZoneModel.MHR}
        />
      }
    />
  );
};
