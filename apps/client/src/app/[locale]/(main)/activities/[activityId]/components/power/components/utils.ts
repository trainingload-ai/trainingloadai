import { PowerZoneValue } from "@/api/use-power";
import { getPowerZoneColorByZone } from "@/utils/util";
import type { ChartValue } from "@/api/useActivityMetric";
import dayjs from "dayjs";

// 图表数据点类型
export type PowerChartDataPoint = {
  time: string;
  duration: number; // 秒
  power: number;
  zoneColor: string;
  zoneName: string;
  zoneDescription: string;
};
/**
 * 处理功率图表数据
 */
export const processPowerChartData = (
  data: { rows: ChartValue[] } | undefined,
  zones: PowerZoneValue[],
  t: (key: string) => string,
): PowerChartDataPoint[] => {
  if (!data?.rows || zones?.length === 0) return [];

  return data.rows
    ?.filter(
      (dataPoint) =>
        dataPoint.power !== undefined && dataPoint.time !== undefined,
    )
    .map((dataPoint: ChartValue) => {
      const power = dataPoint.power as number;
      const zone = zones?.find(
        (z) =>
          power >= (z.min ?? Number.NEGATIVE_INFINITY) &&
          power <= (z.max ?? Number.POSITIVE_INFINITY),
      );

      const zoneKey =
        zone && typeof zone.name === "string"
          ? zone.name.toLowerCase()
          : undefined;
      const normalizedZoneKey =
        zoneKey && /^z[1-7]$/.test(zoneKey)
          ? (zoneKey as "z1" | "z2" | "z3" | "z4" | "z5" | "z6" | "z7")
          : undefined;
      const zoneLabel = zone
        ? normalizedZoneKey
          ? normalizedZoneKey.toUpperCase()
          : zone.name.toUpperCase()
        : undefined;
      const zoneColor = normalizedZoneKey
        ? getPowerZoneColorByZone(normalizedZoneKey)
        : undefined;

      return {
        time: dataPoint.time || "",
        duration: dayjs(dataPoint.time).diff(
          dayjs(data.rows?.[0].time),
          "second",
        ),
        power: power,
        zoneColor: zoneColor ?? "#94a3b8",
        zoneName: zoneLabel ?? t("chart.unknownZone"),
        zoneDescription: zoneLabel ? t(`zones.${zoneLabel}`) : "",
      };
    });
};
