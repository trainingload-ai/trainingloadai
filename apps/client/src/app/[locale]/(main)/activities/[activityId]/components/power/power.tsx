"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { useActivityId } from "@/hooks/useActivityId";
import CardLoader from "@/components/ui/CardLoader";
import { useFormatterBySettings } from "@/hooks/useFormatterBySettings";
import PowerStat from "./components/power-stat";
import { useActivityPowerBase, useActivityPowerZones } from "@/api/use-power";
import { round } from "lodash";
import { getPowerZoneColorByZone } from "@/utils/util";
import PowerPointChartWrapper from "./components/power-point-chart-wrapper";
import PowerDurationCurve from "./components/power-duration-curve";
import { PowerInfo } from "./components/PowerInfo";
import { NormalizedPowerInfo } from "./components/info/NormalizedPowerInfo";
import { XPowerInfo } from "./components/info/XPowerInfo";
import { TSSInfo } from "./components/info/TSSInfo";
import { BikeScoreInfo } from "./components/info/BikeScoreInfo";
import { IntensityFactorInfo } from "./components/info/IntensityFactorInfo";
import { RelativeIntensityInfo } from "./components/info/RelativeIntensityInfo";
import { VariabilityIndexInfo } from "./components/info/VariabilityIndexInfo";
import { PowerWeightRatioInfo } from "./components/info/PowerWeightRatioInfo";
import { EfficiencyFactorInfo } from "./components/info/EfficiencyFactorInfo";
import { PowerHeartRateRatioInfo } from "./components/info/PowerHeartRateRatioInfo";
import { useActivityConfig } from "@/hooks/useActivityConfig";
import { ActivityMetricGrid } from "../activity-metric-grid";
import { ActivityZoneTable } from "../activity-zone-table";
// import AerobicEfficiencyChartWrapper from "./aerobic-efficiency-chart-wrapper";
// import RunEffectivenessChartWrapper from "./run-effectiveness-chart-wrapper";
// import EfficiencyIndexChartWrapper from "./efficiency-index-chart-wrapper";

const ActivityPowerPage = React.memo(() => {
  const t = useTranslations("ActivityPowerPage");
  const tActivity = useTranslations("ActivityDetail");
  const activityId = useActivityId();
  const { config } = useActivityConfig();
  const { formatValue, getUnit } = useFormatterBySettings();
  // 获取功率分析基本数据
  const { data: powerBasic, isLoading } = useActivityPowerBase(
    activityId || "",
  );
  // 获取功率区域统计
  const { data: powerZoneStats, isLoading: isZonesLoading } =
    useActivityPowerZones(activityId || "");

  const zones = powerZoneStats?.zones || [];
  const powerUnit = getUnit("power");
  const zoneRows = zones.map((zone, index) => {
    const min = typeof zone.min === "number" ? Math.round(zone.min) : "–";
    const max = typeof zone.max === "number" ? Math.round(zone.max) : "–";
    const average =
      typeof zone.avg === "number"
        ? `${formatValue(zone.avg, "power")} ${powerUnit}`
        : "–";

    return {
      id: `${zone.name || "zone"}-${index}`,
      label: zone.name?.toUpperCase() || `Z${index + 1}`,
      range: `${min}–${max} ${powerUnit}`,
      percent: Number(zone.percent ?? 0),
      duration: Number(zone.duration ?? 0),
      color: getPowerZoneColorByZone(zone.color, index + 1),
      average,
    };
  });

  return (
    <div className="space-y-4">
      {/* 基础功率统计 */}
      <Card>
        <CardContent className="p-0 md:p-0 w-full">
          {isLoading && <CardLoader />}
          <ActivityMetricGrid desktopColumns={6}>
            {config.power.avgPower && (
              <PowerStat
                title={t("basicStats.avgPower")}
                value={formatValue(powerBasic?.avg || "--", "power")}
                unit={getUnit("power")}
              />
            )}
            {config.power.maxPower && (
              <PowerStat
                title={t("basicStats.maxPower")}
                value={formatValue(powerBasic?.max || "--", "power")}
                unit={getUnit("power")}
              />
            )}
            {/* NP */}
            {config.power.normalizedPower && (
              <PowerStat
                title={t("basicStats.normalizedPower")}
                value={formatValue(powerBasic?.coggan?.NP ?? "--", "power")}
                unit={getUnit("power")}
                extraRight={<NormalizedPowerInfo />}
                extraRightPlain
              />
            )}
            {/* xPower */}
            {config.power.xPower && (
              <PowerStat
                title="xPower"
                value={formatValue(powerBasic?.skiba?.xPower ?? "--", "power")}
                unit={getUnit("power")}
                extraRight={<XPowerInfo />}
                extraRightPlain
              />
            )}
            {/* TSS */}
            {config.power.trainingStressScore && (
              <PowerStat
                title={t("basicStats.trainingStressScore")}
                value={
                  typeof powerBasic?.coggan?.TSS === "number"
                    ? round(powerBasic.coggan.TSS, 2)
                    : "--"
                }
                unit=""
                extraRight={<TSSInfo />}
                extraRightPlain
              />
            )}
            {/* BikeScore (was ETSS) */}
            {config.power.etss && (
              <PowerStat
                title="BikeScore"
                value={
                  typeof powerBasic?.skiba?.ETSS === "number"
                    ? round(powerBasic.skiba.ETSS, 2)
                    : "--"
                }
                unit=""
                extraRight={<BikeScoreInfo />}
                extraRightPlain
              />
            )}
            {/* IF */}
            {config.power.intensityFactor && (
              <PowerStat
                title={t("basicStats.intensityFactor")}
                value={
                  typeof powerBasic?.coggan?.IF === "number"
                    ? round(powerBasic.coggan.IF, 2)
                    : "--"
                }
                unit=""
                extraRight={<IntensityFactorInfo />}
                extraRightPlain
              />
            )}
            {/* RI */}
            {config.power.relativeIntensity && (
              <PowerStat
                title={t("basicStats.relativeIntensity")}
                value={
                  typeof powerBasic?.skiba?.RI === "number"
                    ? round(powerBasic.skiba.RI, 2)
                    : "--"
                }
                unit=""
                extraRight={<RelativeIntensityInfo />}
                extraRightPlain
              />
            )}
            {/* VI */}
            {config.power.variabilityIndex && (
              <PowerStat
                title={t("basicStats.variabilityIndex")}
                value={
                  typeof powerBasic?.coggan?.VI === "number"
                    ? round(powerBasic.coggan.VI, 2)
                    : "--"
                }
                unit=""
                extraRight={<VariabilityIndexInfo />}
                extraRightPlain
              />
            )}
            {/* VI (Skiba) */}
            {config.power.variabilityIndexSkiba && (
              <PowerStat
                title={`${t("basicStats.variabilityIndex")} (Skiba)`}
                value={
                  typeof powerBasic?.skiba?.VI === "number"
                    ? round(powerBasic.skiba.VI, 2)
                    : "--"
                }
                unit=""
                extraRight={<VariabilityIndexInfo />}
                extraRightPlain
              />
            )}

            {config.power.powerWeightRatio && (
              <PowerStat
                title={t("basicStats.powerWeightRatio")}
                value={powerBasic?.WKG ? round(powerBasic?.WKG, 2) : "--"}
                unit=""
                extraRight={<PowerWeightRatioInfo />}
                extraRightPlain
              />
            )}

            {config.power.ftp && (
              <PowerStat
                title="FTP"
                value={
                  <>
                    {powerBasic?.ftp || "-"}
                    <span className="text-mobile-caption pc:text-xs md:text-sm text-muted-foreground ml-1">
                      {powerBasic?.eftp || "-"}
                    </span>
                  </>
                }
                unit={getUnit("power")}
                extraRight={<PowerInfo />}
                extraRightPlain
              />
            )}
            {config.power.cp && (
              <PowerStat
                title="CP"
                value={
                  <>
                    {powerBasic?.cp || "-"}
                    <span className="text-mobile-caption pc:text-xs md:text-sm text-muted-foreground ml-1">
                      {powerBasic?.ecp || "-"}
                    </span>
                  </>
                }
                unit={getUnit("power")}
                extraRight={<PowerInfo />}
                extraRightPlain
              />
            )}
            {config.power.efficiencyFactor && (
              <PowerStat
                title={t("basicStats.efficiencyFactor")}
                value={
                  powerBasic?.coggan?.EF ? round(powerBasic.coggan.EF, 2) : "--"
                }
                unit=""
                extraRight={<EfficiencyFactorInfo />}
                extraRightPlain
              />
            )}
            {config.power.powerHeartRateRatio && (
              <PowerStat
                title={t("basicStats.powerHeartRateRatio")}
                value={
                  powerBasic?.aePower ? round(powerBasic.aePower, 2) : "--"
                }
                unit=""
                extraRight={<PowerHeartRateRatioInfo />}
                extraRightPlain
              />
            )}
          </ActivityMetricGrid>
        </CardContent>
      </Card>

      <ActivityZoneTable
        rows={zoneRows}
        isLoading={isZonesLoading}
        zoneLabel={tActivity("zoneTable.zone")}
        rangeLabel={tActivity("zoneTable.range")}
        distributionLabel={tActivity("zoneTable.distribution")}
        durationLabel={tActivity("zoneTable.duration")}
        averageLabel={t("tooltip.avgPower")}
        emptyLabel={t("noData")}
      />

      <PowerPointChartWrapper zones={powerZoneStats?.zones || []} />
      <PowerDurationCurve />
      {/* <AerobicEfficiencyChartWrapper />
      <RunEffectivenessChartWrapper />
      <EfficiencyIndexChartWrapper /> */}
    </div>
  );
});

ActivityPowerPage.displayName = "ActivityPowerPage";

export default ActivityPowerPage;
