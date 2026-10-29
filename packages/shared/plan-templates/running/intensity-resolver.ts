import type { EndurancePlanBlock } from "../../endurance-workout-ir";
import type { WorkoutDefinitionInput } from "../../workout-structure";
import {
  predictTimeForVdot,
  resolveVdotPaceRange,
  type VdotZoneKey,
} from "../../vdot";
import type { PlanTemplateDefinition, PlanTemplateWorkout } from "../registry";

export type RunningCapabilityState =
  | "AVAILABLE"
  | "MISSING"
  | "STALE"
  | "CONFLICTING";

export type RunningCapabilitySnapshot = {
  state: RunningCapabilityState;
  resolvedAt: string;
  /**
   * Transient pace-model value used by the VDOT formula. It may be derived
   * from canonical VO2_MAX, a race result, TP or CS. It is never a persisted
   * user-fitness metric key; VO2_MAX is the only canonical profile metric.
   */
  vdot?: number | null;
  /** Canonical persisted VO2_MAX/VDOT profile value, when one exists. */
  vo2Max?: number | null;
  thresholdPaceSecPerKm?: number | null;
  criticalSpeedMetersPerSecond?: number | null;
  source?: "PUBLIC_EXAMPLE" | "VO2_MAX" | "RECENT_RACE" | "TP" | "CS" | null;
  sourceId?: string | null;
  sourceRecordedAt?: string | null;
  conflicts?: readonly string[];
  metricRefs?: readonly {
    id: string;
    type: "VO2_MAX" | "TP" | "CS" | "RACE_RESULT";
    value: number;
    source: string;
    recordedAt: string;
  }[];
  durability?: Record<string, number | null>;
};

export type RunningGoalRaceSnapshot = {
  eventId: string;
  distanceMeters: number;
  targetTimeSeconds: number;
  raceDate: string;
  qualified: boolean;
};

export type RunningIntensityResolution = {
  definition: WorkoutDefinitionInput;
  resolved: boolean;
  basis: string;
  source: RunningCapabilitySnapshot["source"] | "GOAL_RACE_PACE" | null;
};

function distanceForBasis(basis: string): number | null {
  if (basis.includes("10K")) return 10_000;
  if (basis.includes("HALF")) return 21_097.5;
  if (basis.includes("MARATHON")) return 42_195;
  return null;
}

function around(value: number, fraction = 0.02) {
  return {
    fastSecPerKm: Math.round(value * (1 - fraction)),
    slowSecPerKm: Math.round(value * (1 + fraction)),
  };
}

function rangeFor(args: {
  basis: string;
  capability: RunningCapabilitySnapshot;
  goalRace?: RunningGoalRaceSnapshot | null;
}) {
  const { basis, capability, goalRace } = args;
  if (basis === "QUALITATIVE_ONLY" || capability.state !== "AVAILABLE")
    return null;
  if (basis.startsWith("GOAL_")) {
    if (
      goalRace?.qualified &&
      goalRace.targetTimeSeconds > 0 &&
      goalRace.distanceMeters > 0
    ) {
      const pace =
        goalRace.targetTimeSeconds / (goalRace.distanceMeters / 1_000);
      return {
        ...around(pace, 0),
        source: "GOAL_RACE_PACE" as const,
        zone: basis,
      };
    }
    const capabilityDistance = distanceForBasis(basis);
    const capabilityVdot = capability.vdot;
    if (!capabilityDistance || !capabilityVdot) return null;
    const predicted = predictTimeForVdot(capabilityDistance, capabilityVdot);
    if (!predicted) return null;
    return {
      ...around(predicted / (capabilityDistance / 1_000)),
      source: capability.source ?? "VO2_MAX",
      zone: basis,
    };
  }
  if (basis === "VDOT_T") {
    if ((capability.thresholdPaceSecPerKm ?? 0) > 0) {
      return {
        ...around(capability.thresholdPaceSecPerKm as number),
        source: "TP" as const,
        zone: "T",
      };
    }
    if ((capability.criticalSpeedMetersPerSecond ?? 0) > 0) {
      return {
        ...around(1_000 / (capability.criticalSpeedMetersPerSecond as number)),
        source: "CS" as const,
        zone: "T",
      };
    }
  }
  const vdot = capability.vdot;
  if (!vdot) return null;
  const zoneMatch = basis.match(/^VDOT_([EMTIR])$/);
  if (zoneMatch) {
    return {
      ...resolveVdotPaceRange(vdot, zoneMatch[1] as VdotZoneKey),
      source: capability.source ?? "VO2_MAX",
      zone: zoneMatch[1],
    };
  }
  const distance = distanceForBasis(basis);
  if (distance) {
    const predicted = predictTimeForVdot(distance, vdot);
    if (!predicted) return null;
    return {
      ...around(predicted / (distance / 1_000)),
      source: capability.source ?? "VO2_MAX",
      zone: basis,
    };
  }
  if (basis === "CURRENT_MARATHON_EQUIVALENT") {
    const predicted = predictTimeForVdot(42_195, vdot);
    if (!predicted) return null;
    return {
      ...around(predicted / 42.195),
      source: capability.source ?? "VO2_MAX",
      zone: basis,
    };
  }
  return null;
}

export function resolveRunningWorkoutIntensity(args: {
  template: PlanTemplateDefinition;
  workout: PlanTemplateWorkout;
  capability: RunningCapabilitySnapshot;
  goalRace?: RunningGoalRaceSnapshot | null;
}): RunningIntensityResolution {
  const slot = args.template.intensitySlots?.find(
    (item) => item.id === args.workout.intensitySlotId,
  );
  if (!slot) {
    return {
      definition: args.workout.definition,
      resolved: false,
      basis: "RPE_TALK_TEST",
      source: null,
    };
  }
  const range = rangeFor({
    basis: slot.basis,
    capability: args.capability,
    goalRace: args.goalRace,
  });
  if (!range) {
    return {
      definition: args.workout.definition,
      resolved: false,
      basis: slot.basis,
      source: null,
    };
  }
  const cloned = JSON.parse(
    JSON.stringify(args.workout.definition),
  ) as WorkoutDefinitionInput;
  if (cloned.source !== "STRUCTURE" || cloned.structure.kind !== "ENDURANCE") {
    return {
      definition: cloned,
      resolved: false,
      basis: slot.basis,
      source: null,
    };
  }
  const apply = (blocks: EndurancePlanBlock[]) => {
    for (const block of blocks) {
      if (block.type === "repeat") {
        apply(block.children);
        continue;
      }
      for (const step of block.steps) {
        if (step.stepKind !== "WORK") continue;
        step.primaryTargetMeta = {
          kind: "SPEED",
          value: range.fastSecPerKm,
          valueHigh: range.slowSecPerKm,
          zoneLabel: range.zone,
          zoneSystem:
            range.source === "TP" || range.source === "CS"
              ? "THRESHOLD"
              : "VDOT",
          zoneSource:
            args.template.resolverVersion ?? "running-intensity-resolver/v1",
          zoneBasis: {
            source: range.source,
            sourceId: args.capability.sourceId ?? null,
            sourceRecordedAt: args.capability.sourceRecordedAt ?? null,
            vdot: args.capability.vdot ?? null,
            vo2Max: args.capability.vo2Max ?? null,
            goalRaceEventId:
              range.source === "GOAL_RACE_PACE" ? args.goalRace?.eventId : null,
          },
          unit: "sec/km",
        };
      }
    }
  };
  apply(cloned.structure.blocks);
  return {
    definition: cloned,
    resolved: true,
    basis: slot.basis,
    source: range.source,
  };
}

export function publicExampleCapability(): RunningCapabilitySnapshot {
  return {
    state: "AVAILABLE",
    resolvedAt: "PUBLIC_EXAMPLE",
    vdot: 40,
    source: "PUBLIC_EXAMPLE",
    sourceId: "PUBLIC_EXAMPLE_VDOT_40",
    sourceRecordedAt: null,
  };
}
