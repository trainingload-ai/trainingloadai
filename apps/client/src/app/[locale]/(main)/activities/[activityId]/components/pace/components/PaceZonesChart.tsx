import type { PaceZoneValue } from "@/api/use-pace";
import { useTranslations } from "next-intl";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { getPowerZoneColorByZone } from "@/utils/util";
import { ActivityZoneTable } from "../../activity-zone-table";

interface PaceZonesChartProps {
  zones: PaceZoneValue[];
  isLoading?: boolean;
  paceDistanceMeters: number;
  paceUnit: string;
}

export const PaceZonesChart = ({
  zones,
  isLoading = false,
  paceDistanceMeters,
  paceUnit,
}: PaceZonesChartProps) => {
  const t = useTranslations("PacePage");
  const tActivity = useTranslations("ActivityDetail");
  const rows = (zones || []).map((zone, index) => {
    const min =
      typeof zone.min === "number"
        ? formatSecondsToTime(zone.min * paceDistanceMeters)
        : "–";
    const max =
      typeof zone.max === "number"
        ? formatSecondsToTime(zone.max * paceDistanceMeters)
        : "–";
    const average =
      typeof zone.avg === "number"
        ? `${formatSecondsToTime(zone.avg * paceDistanceMeters)} ${paceUnit}`
        : "–";

    return {
      id: `${zone.name || "zone"}-${index}`,
      label: zone.name?.toUpperCase() || `Z${index + 1}`,
      range: `${min}–${max} ${paceUnit}`,
      percent: Number(zone.percent ?? 0),
      duration: Number(zone.duration ?? 0),
      color: getPowerZoneColorByZone(zone.color, index + 1),
      average,
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
      averageLabel={t("stats.avgPace")}
      emptyLabel={tActivity("zoneTable.noData")}
    />
  );
};
