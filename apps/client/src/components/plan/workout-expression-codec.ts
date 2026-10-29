"use client";

import { SportType } from "@/api/activities";
import type { PlanSportType } from "@/api/plans";

export type WorkoutExpressionSportType =
  | SportType
  | PlanSportType
  | null
  | undefined;

export type WorkoutExpressionSpeedUnit = "sec/km" | "sec/100m" | "km/h";

const roundTo = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const isSwimExpressionSport = (sportType: WorkoutExpressionSportType) =>
  String(sportType) === SportType.SWIM;

export const isRunExpressionSport = (sportType: WorkoutExpressionSportType) =>
  String(sportType) === SportType.RUN;

export const getExpressionSpeedUnitForSport = (
  sportType: WorkoutExpressionSportType,
): Extract<WorkoutExpressionSpeedUnit, "sec/km" | "sec/100m"> =>
  // blocks 内部保存“每公里/每百米秒数”，骑行展示为 km/h 时也会先转回表达式单位。
  isSwimExpressionSport(sportType) ? "sec/100m" : "sec/km";

export const getDisplaySpeedUnitForSport = (
  sportType: WorkoutExpressionSportType,
): WorkoutExpressionSpeedUnit => {
  if (isSwimExpressionSport(sportType)) return "sec/100m";
  if (isRunExpressionSport(sportType)) return "sec/km";
  return "km/h";
};

export const normalizeExpressionSpeedUnit = (
  unit: string | undefined | null,
  sportType: WorkoutExpressionSportType,
): Extract<WorkoutExpressionSpeedUnit, "sec/km" | "sec/100m"> => {
  if (unit === "sec/100m" || unit === "s/100m") return "sec/100m";
  if (unit === "sec/km" || unit === "s/km") return "sec/km";
  return getExpressionSpeedUnitForSport(sportType);
};

export const expressionSpeedUnitToToken = (
  unit: WorkoutExpressionSpeedUnit | undefined | null,
) => {
  if (unit === "sec/100m") return "s/100m";
  if (unit === "sec/km") return "s/km";
  return "km/h";
};

export const convertExpressionSpeedToKmh = (
  value: number,
  unit: WorkoutExpressionSpeedUnit,
) => {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (unit === "km/h") return value;
  return unit === "sec/100m" ? 360 / value : 3600 / value;
};

export const convertKmhToExpressionSpeed = (
  value: number,
  unit: Extract<WorkoutExpressionSpeedUnit, "sec/km" | "sec/100m">,
) => {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return unit === "sec/100m" ? 360 / value : 3600 / value;
};

export const convertDisplaySpeedToExpression = (
  value: number,
  sportType: WorkoutExpressionSportType,
  displayUnit?: WorkoutExpressionSpeedUnit,
) => {
  // 用户看到的 km/h 需要转换成内部 pace 秒数；跑步/游泳配速则可直接保存。
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const expressionUnit = getExpressionSpeedUnitForSport(sportType);
  const sourceUnit = displayUnit ?? getDisplaySpeedUnitForSport(sportType);
  if (sourceUnit === "km/h") {
    return convertKmhToExpressionSpeed(value, expressionUnit);
  }
  return value;
};

export const convertExpressionSpeedToDisplay = (
  value: number,
  sportType: WorkoutExpressionSportType,
  displayUnit?: WorkoutExpressionSpeedUnit,
) => {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const expressionUnit = getExpressionSpeedUnitForSport(sportType);
  const targetUnit = displayUnit ?? getDisplaySpeedUnitForSport(sportType);
  if (targetUnit === "km/h") {
    const kmh = convertExpressionSpeedToKmh(value, expressionUnit);
    return typeof kmh === "number" ? roundTo(kmh) : undefined;
  }
  return Math.round(value);
};

export const averageExpressionSpeedAsKmh = (
  low: number | undefined,
  high: number | undefined,
  unit: WorkoutExpressionSpeedUnit,
) => {
  // 一些旧字段只存 paceKmh，所以区间目标需要折算为平均 km/h 作为兼容代表值。
  const values = [low, high]
    .filter((value): value is number => Number.isFinite(value as number))
    .map((value) => convertExpressionSpeedToKmh(value, unit))
    .filter((value): value is number => Number.isFinite(value as number));

  if (!values.length) return undefined;
  return roundTo(
    values.reduce((sum, item) => sum + item, 0) / values.length,
    3,
  );
};

/** Tooltip / 摘要：按运动类型把内部 paceKmh 格式化为配速或 km/h */
export const formatPaceKmhForSportDisplay = (
  paceKmh: number,
  sportType: WorkoutExpressionSportType,
): string => {
  if (!Number.isFinite(paceKmh) || paceKmh <= 0) return "—";
  const displayUnit = getDisplaySpeedUnitForSport(sportType);
  if (displayUnit === "km/h") {
    return `${roundTo(paceKmh, 1)} km/h`;
  }
  const exprUnit = getExpressionSpeedUnitForSport(sportType);
  const sec = convertKmhToExpressionSpeed(paceKmh, exprUnit);
  if (sec == null || !Number.isFinite(sec)) {
    return `${roundTo(paceKmh, 1)} km/h`;
  }
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const clock = `${m}:${String(s).padStart(2, "0")}`;
  const suffix = exprUnit === "sec/100m" ? "/100m" : "/km";
  return `${clock}${suffix}`;
};
