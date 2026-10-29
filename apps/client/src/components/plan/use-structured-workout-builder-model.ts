"use client";

import React from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { SportType } from "@/api/activities";
import type { PlanSportType } from "@/api/plans";
import { useHeartRateZones } from "@/api/use-heart-rate";
import { usePowerZones } from "@/api/use-power";
import { useResolvedPaceZones } from "@/api/use-pace";
import { getExpressionSpeedUnitForSport } from "@/components/plan/workout-expression-codec";
import {
  createRepeatModule,
  createStepModule,
  type WorkoutStructureModule,
} from "@/components/plan/plan-workout-builder-model";

export type ZoneOption = {
  value: string;
  label: string;
  low: number;
  high: number;
  unit: string;
  zoneSystem: string;
  zoneSource: string;
};

type Args = {
  sportType: SportType | PlanSportType;
  value: WorkoutStructureModule[];
  onChange: (next: WorkoutStructureModule[]) => void;
};

type ResolvedZoneValue = {
  name?: string;
  order?: number;
  min?: number;
  max?: number;
};

const isSupportedSportType = (
  sportType: SportType | PlanSportType,
): sportType is SportType.RUN | SportType.CYCLING | SportType.SWIM =>
  String(sportType) === SportType.RUN ||
  String(sportType) === SportType.CYCLING ||
  String(sportType) === SportType.SWIM;

const formatNumericZoneValue = (value: number, unit: string) =>
  `${Math.round(value)}${unit}`;

const formatPaceZoneValue = (seconds: number, unit: string) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return `${minutes}:${secs}${unit === "sec/100m" ? "/100m" : "/km"}`;
};

const mapResolvedZonesToOptions = (
  zones: ResolvedZoneValue[] | undefined,
  args: {
    unit: string;
    zoneSystem: string;
    scale?: number;
    formatValue?: (value: number, unit: string) => string;
  },
): ZoneOption[] => {
  if (!zones?.length) return [];

  return zones.flatMap<ZoneOption>((zone, index) => {
    const rawLow = Number(zone.min);
    const rawHigh = Number(zone.max);
    if (!Number.isFinite(rawLow) || !Number.isFinite(rawHigh)) return [];

    const scale = args.scale ?? 1;
    const low = rawLow * scale;
    const high = rawHigh * scale;
    const formatValue = args.formatValue ?? formatNumericZoneValue;
    const name = zone.name || `Z${zone.order ?? index + 1}`;

    return [
      {
        value: String(zone.order ?? index + 1),
        label: `${name} (${formatValue(low, args.unit)} - ${formatValue(
          high,
          args.unit,
        )})`,
        low,
        high,
        unit: args.unit,
        zoneSystem: args.zoneSystem,
        zoneSource: "TRAININGLOAD",
      },
    ];
  });
};

export function useStructuredWorkoutBuilderModel({
  sportType,
  value,
  onChange,
}: Args) {
  const resolvedSportType = isSupportedSportType(sportType)
    ? (String(sportType) as SportType.RUN | SportType.CYCLING | SportType.SWIM)
    : undefined;
  const { data: heartRateZoneData } = useHeartRateZones(
    null,
    resolvedSportType,
  );
  const { data: powerZoneData } = usePowerZones(null, resolvedSportType);
  const { data: paceZoneData } = useResolvedPaceZones(null, resolvedSportType);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const heartRateZones = React.useMemo(
    () =>
      mapResolvedZonesToOptions(heartRateZoneData?.zones, {
        unit: "bpm",
        zoneSystem: String(heartRateZoneData?.benchmark ?? "HEART_RATE"),
      }),
    [heartRateZoneData?.benchmark, heartRateZoneData?.zones],
  );

  const powerZones = React.useMemo(
    () =>
      mapResolvedZonesToOptions(powerZoneData?.zones, {
        unit: "W",
        zoneSystem: String(powerZoneData?.benchmark ?? "POWER"),
      }),
    [powerZoneData?.benchmark, powerZoneData?.zones],
  );

  const paceZones = React.useMemo<ZoneOption[]>(() => {
    const speedUnit = getExpressionSpeedUnitForSport(sportType);
    return mapResolvedZonesToOptions(paceZoneData?.zones, {
      unit: speedUnit,
      zoneSystem: String(paceZoneData?.benchmark ?? "PACE"),
      scale: speedUnit === "sec/100m" ? 100 : 1000,
      formatValue: formatPaceZoneValue,
    });
  }, [paceZoneData?.benchmark, paceZoneData?.zones, sportType]);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = value.findIndex((module) => module.id === active.id);
      const nextIndex = value.findIndex((module) => module.id === over.id);
      if (oldIndex < 0 || nextIndex < 0) return;
      onChange(arrayMove(value, oldIndex, nextIndex));
    },
    [onChange, value],
  );

  const addStep = React.useCallback(() => {
    onChange([...value, createStepModule("WORK")]);
  }, [onChange, value]);

  const addRepeat = React.useCallback(() => {
    onChange([...value, createRepeatModule()]);
  }, [onChange, value]);

  const updateModule = React.useCallback(
    (moduleId: string, next: WorkoutStructureModule) => {
      onChange(value.map((item) => (item.id === moduleId ? next : item)));
    },
    [onChange, value],
  );

  const removeModule = React.useCallback(
    (moduleId: string) => {
      onChange(value.filter((item) => item.id !== moduleId));
    },
    [onChange, value],
  );

  return {
    sensors,
    heartRateZones,
    powerZones,
    paceZones,
    handleDragEnd,
    addStep,
    addRepeat,
    updateModule,
    removeModule,
  };
}
