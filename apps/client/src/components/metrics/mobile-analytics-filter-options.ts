import type { SportType } from "@/lib/store";

/** 与 mobile analytics 的 year / last60 / allTime 三档时间筛选保持一致。 */
export const MOBILE_ANALYTICS_TIME_EXCLUDE = [
  "last7Days",
  "last14Days",
  "last30Days",
  "thisMonth",
  "lastYear",
  "customRange",
] as const;

/** mobile 的配速分析只支持跑步和游泳。 */
export const MOBILE_PACE_SPORT_TYPES: Array<Exclude<SportType, "all">> = [
  "RUN",
  "SWIM",
];
