"use client";

import React from "react";
import { SportType } from "@/api/activities";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { PaceInput } from "@/components/ui/pace-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  Flame,
  Footprints,
  GripVertical,
  Pause,
  Plus,
  Repeat2,
  RotateCcw,
  Snowflake,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createEmptyTarget,
  createStepModule,
  type SwimEquipmentType,
  type SwimStrokeKind,
  type SwimTrainingType,
  type WorkoutDurationKind,
  type WorkoutRepeatModule,
  type WorkoutStepModule,
  type WorkoutStructureModule,
  type WorkoutTargetDraft,
  type WorkoutTargetRelation,
  type WorkoutModuleStepType,
} from "@/components/plan/plan-workout-builder-model";
import {
  type ZoneOption,
  useStructuredWorkoutBuilderModel,
} from "@/components/plan/use-structured-workout-builder-model";
import type { PlanSportType } from "@/api/plans";
import { cn } from "@/lib/utils";

type BuilderSportType = SportType | PlanSportType;

type StructuredWorkoutBuilderProps = {
  sportType: BuilderSportType;
  value: WorkoutStructureModule[];
  onChange: (next: WorkoutStructureModule[]) => void;
  readOnly?: boolean;
};

const STEP_TYPE_OPTIONS: WorkoutModuleStepType[] = [
  "WARMUP",
  "WORK",
  "RECOVERY",
  "REST",
  "COOLDOWN",
  "OTHER",
];

const RUN_DURATION_OPTIONS: WorkoutDurationKind[] = [
  "TIME",
  "DISTANCE",
  "OPEN",
  "CALORIES",
  "HR_GREATER_THAN",
  "HR_LESS_THAN",
  "POWER_GREATER_THAN",
  "POWER_LESS_THAN",
  "CADENCE_GREATER_THAN",
  "CADENCE_LESS_THAN",
];

const SWIM_DURATION_OPTIONS: WorkoutDurationKind[] = ["TIME", "DISTANCE"];

const SWIM_STROKE_OPTIONS: SwimStrokeKind[] = [
  "FREESTYLE",
  "BREASTSTROKE",
  "BACKSTROKE",
  "BUTTERFLY",
  "DRILL",
  "MEDLEY",
];

const SWIM_TRAINING_TYPE_OPTIONS: SwimTrainingType[] = [
  "KICK",
  "PULL",
  "DRILL",
];

const SWIM_EQUIPMENT_OPTIONS: SwimEquipmentType[] = [
  "FINS",
  "KICKBOARD",
  "PADDLES",
  "PULL_BUOY",
  "SNORKEL",
];

const isRunSport = (sportType: BuilderSportType) =>
  String(sportType) === SportType.RUN;

const isSwimSport = (sportType: BuilderSportType) =>
  String(sportType) === SportType.SWIM;

function MobileStepTypeIcon({ stepType }: { stepType: WorkoutModuleStepType }) {
  const Icon =
    stepType === "WARMUP"
      ? Flame
      : stepType === "RECOVERY"
        ? RotateCcw
        : stepType === "REST"
          ? Pause
          : stepType === "COOLDOWN"
            ? Snowflake
            : Footprints;
  return <Icon className="size-[17px]" />;
}

type TargetFamily = "NONE" | "HEART_RATE" | "POWER" | "PACE" | "UNSUPPORTED";
type TargetSource = "BASE" | "ZONE";

const TARGET_FAMILIES: TargetFamily[] = ["NONE", "HEART_RATE", "POWER", "PACE"];

const TARGET_RELATIONS: WorkoutTargetRelation[] = [
  "EQUAL",
  "GREATER_THAN",
  "LESS_THAN",
  "RANGE",
];

const getTargetFamily = (target: WorkoutTargetDraft): TargetFamily => {
  if (target.kind === "NONE") return "NONE";
  if (
    target.kind === "HEART_RATE_CUSTOM" ||
    target.kind === "HEART_RATE_ZONE"
  ) {
    return "HEART_RATE";
  }
  if (target.kind === "POWER_CUSTOM" || target.kind === "POWER_ZONE") {
    return "POWER";
  }
  if (target.kind === "SPEED") return "PACE";
  return "UNSUPPORTED";
};

const getTargetSource = (target: WorkoutTargetDraft): TargetSource =>
  target.kind === "HEART_RATE_ZONE" ||
  target.kind === "POWER_ZONE" ||
  (target.kind === "SPEED" &&
    (Boolean(target.zoneIndex) || target.zoneSource === "TRAININGLOAD"))
    ? "ZONE"
    : "BASE";

const inferTargetRelation = (
  target: WorkoutTargetDraft,
): WorkoutTargetRelation => {
  if (target.relation) return target.relation;
  const low = Number(target.value);
  const high = Number(target.valueHigh);
  const hasLow = Number.isFinite(low);
  const hasHigh = Number.isFinite(high);
  if (hasLow && hasHigh) return low === high ? "EQUAL" : "RANGE";
  if (hasHigh) return "LESS_THAN";
  if (hasLow) return "GREATER_THAN";
  return "EQUAL";
};

const getDurationOptionsForSport = (sportType: BuilderSportType) =>
  isSwimSport(sportType) ? SWIM_DURATION_OPTIONS : RUN_DURATION_OPTIONS;

const getDurationOptionLabel = (
  option: WorkoutDurationKind,
  t: ReturnType<typeof useTranslations>,
) => t(`durationKinds.${option}`);

const isThresholdDurationKind = (kind: WorkoutDurationKind) =>
  kind === "HR_GREATER_THAN" ||
  kind === "HR_LESS_THAN" ||
  kind === "POWER_GREATER_THAN" ||
  kind === "POWER_LESS_THAN" ||
  kind === "CADENCE_GREATER_THAN" ||
  kind === "CADENCE_LESS_THAN";

const BUILDER_FIELD_LABEL_CLASS_NAME =
  "min-w-0 flex-1 truncate text-[16px] text-foreground pc:block pc:text-xs pc:font-medium pc:text-muted-foreground";
const BUILDER_FIELD_ROW_CLASS_NAME =
  "flex min-h-[52px] items-center gap-3 border-b border-border/60 py-2 [&>:last-child]:ml-auto [&>:last-child]:w-[62%] [&>:last-child]:shrink-0 pc:block pc:min-h-0 pc:space-y-1 pc:border-0 pc:py-0 pc:[&>:last-child]:ml-0 pc:[&>:last-child]:w-full";
const TARGET_FIELD_LABEL_CLASS_NAME =
  "min-w-0 flex-1 truncate text-[16px] text-foreground pc:block pc:text-[11px] pc:font-medium pc:text-muted-foreground";
const TARGET_FIELD_ROW_CLASS_NAME =
  "flex min-h-[52px] items-center gap-3 border-t border-border/50 py-1.5 [&>:last-child]:ml-auto [&>:last-child]:w-[62%] [&>:last-child]:shrink-0 pc:block pc:min-h-0 pc:space-y-1 pc:border-0 pc:py-0 pc:[&>:last-child]:ml-0 pc:[&>:last-child]:w-full";
const BUILDER_SELECT_TRIGGER_CLASS_NAME =
  "border-0 bg-neutral-100 shadow-none focus-visible:ring-0 data-[size=sm]:h-10 data-[size=sm]:rounded-control data-[size=sm]:px-3 data-[size=sm]:text-[16px] dark:bg-muted/45 pc:border pc:bg-background pc:data-[size=sm]:h-8 pc:data-[size=sm]:rounded-md pc:data-[size=sm]:text-sm";
const DURATION_VALUE_FIELD_CLASS_NAME =
  "h-10 rounded-control border-0 bg-neutral-100 shadow-none dark:bg-muted/45 [&_[data-slot=input-group-control]]:h-10 [&_[data-slot=input-group-control]]:text-[16px] [&_[data-slot=input-group-control]:focus-visible]:ring-0 pc:h-8 pc:border pc:bg-transparent pc:dark:bg-input/30 pc:[&_[data-slot=input-group-control]]:h-8 pc:[&_[data-slot=input-group-control]]:text-sm";
const TARGET_SELECT_TRIGGER_CLASS_NAME =
  "border-0 bg-background shadow-none focus-visible:ring-0 data-[size=sm]:h-10 data-[size=sm]:rounded-control data-[size=sm]:px-3 data-[size=sm]:text-[16px] pc:border pc:data-[size=sm]:h-8 pc:data-[size=sm]:rounded-md pc:data-[size=sm]:px-2 pc:data-[size=sm]:text-xs";
const TARGET_VALUE_FIELD_CLASS_NAME =
  "h-10 rounded-control border-0 bg-background shadow-none [&_[data-slot=input-group-control]]:h-10 [&_[data-slot=input-group-control]]:text-[16px] [&_[data-slot=input-group-control]:focus-visible]:ring-0 pc:h-8 pc:border pc:bg-transparent pc:[&_[data-slot=input-group-control]]:h-8 pc:[&_[data-slot=input-group-control]]:text-sm";
const TARGET_SINGLE_VALUE_COLUMN_WIDTH = 148;
const TARGET_PACE_VALUE_COLUMN_WIDTH = 184;
const TARGET_RANGE_VALUE_COLUMN_WIDTH = 272;
const TARGET_PACE_RANGE_VALUE_COLUMN_WIDTH = 384;
const TARGET_GRID_GAP_SIZE = 8;

const estimateTextWidth = (text: string) =>
  Array.from(text).reduce((width, char) => {
    if (char.trim() === "") return width + 4;
    return width + (char.charCodeAt(0) > 255 ? 14 : 7);
  }, 0);

const getCompactSelectWidth = (labels: string[]) => {
  const textWidth = Math.max(...labels.map(estimateTextWidth));
  return Math.ceil(Math.max(56, textWidth + 40));
};

const clampWidth = (width: number, min: number, max: number) =>
  Math.min(max, Math.max(min, width));

const clampInteger = (value: number, min: number, max?: number) => {
  if (!Number.isFinite(value)) return min;
  const floored = Math.floor(value);
  const boundedMin = Math.max(min, floored);
  return max === undefined ? boundedMin : Math.min(max, boundedMin);
};

const parseNumberWithMinimum = (value: string, min: number) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(min, numericValue) : min;
};

const sanitizeNumberTextWithMinimum = (value: string, min: number) => {
  if (value.trim() === "") return "";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "";
  if (numericValue < min) return String(min);
  return value;
};

const getTargetMinimumValue = (targetFamily: TargetFamily) =>
  targetFamily === "HEART_RATE" ? 1 : 0;

const getTargetStepValue = (targetFamily: TargetFamily) =>
  targetFamily === "PACE" ? "0.1" : "1";

const getDurationMinimumValue = (durationKind: WorkoutDurationKind) =>
  durationKind === "POWER_GREATER_THAN" ||
  durationKind === "POWER_LESS_THAN" ||
  durationKind === "CADENCE_GREATER_THAN" ||
  durationKind === "CADENCE_LESS_THAN"
    ? 0
    : 1;

const TWO_DIGIT_OPTIONS = Array.from({ length: 60 }, (_, value) => ({
  value: String(value),
  label: value.toString().padStart(2, "0"),
}));

const DurationTimeInput = ({
  value,
  onChange,
  disabled,
}: {
  value: number | undefined;
  onChange: (nextValue: number | undefined) => void;
  disabled?: boolean;
}) => {
  const totalSeconds =
    typeof value === "number" && value > 0 ? Math.floor(value) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const emit = (
    nextHours: number,
    nextMinutes: number,
    nextSeconds: number,
  ) => {
    const nextTotal = nextHours * 3600 + nextMinutes * 60 + nextSeconds;
    onChange(nextTotal > 0 ? nextTotal : undefined);
  };

  return (
    <div className="flex items-center justify-end gap-1 pc:gap-1">
      <Input
        type="number"
        min={0}
        value={hours}
        onChange={(event) =>
          emit(clampInteger(Number(event.target.value), 0), minutes, seconds)
        }
        disabled={disabled}
        aria-label="duration hours"
        className="h-10 w-12 rounded-control border-0 bg-neutral-100 px-1.5 text-right text-[16px] shadow-none focus-visible:ring-0 dark:bg-muted/45 pc:h-8 pc:w-14 pc:border pc:bg-transparent pc:px-2 pc:text-sm"
      />
      <span className="text-[15px] text-muted-foreground pc:text-xs">:</span>
      <Select
        value={String(minutes)}
        onValueChange={(next) => emit(hours, Number(next), seconds)}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className={cn(
            BUILDER_SELECT_TRIGGER_CLASS_NAME,
            "w-12 data-[size=sm]:px-1.5 pc:w-14 pc:data-[size=sm]:px-2",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TWO_DIGIT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[15px] text-muted-foreground pc:text-xs">:</span>
      <Select
        value={String(seconds)}
        onValueChange={(next) => emit(hours, minutes, Number(next))}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className={cn(
            BUILDER_SELECT_TRIGGER_CLASS_NAME,
            "w-12 data-[size=sm]:px-1.5 pc:w-14 pc:data-[size=sm]:px-2",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TWO_DIGIT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

const PaceFieldWithUnit = ({
  value,
  onChange,
  disabled,
  placeholder,
  unit,
}: {
  value: number | undefined;
  onChange: (nextValue: number | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  unit: string;
}) => {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <PaceInput
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        size="sm"
        className="shrink-0 [&_[data-slot=select-trigger]]:border-0 [&_[data-slot=select-trigger]]:bg-background [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:focus-visible:ring-0 [&_[data-slot=select-trigger][data-size=sm]]:h-10 [&_[data-slot=select-trigger][data-size=sm]]:rounded-control [&_[data-slot=select-trigger][data-size=sm]]:text-[16px] pc:[&_[data-slot=select-trigger]]:border pc:[&_[data-slot=select-trigger][data-size=sm]]:h-8 pc:[&_[data-slot=select-trigger][data-size=sm]]:rounded-md pc:[&_[data-slot=select-trigger][data-size=sm]]:text-sm"
      />
      <span className="shrink-0 text-[15px] text-muted-foreground pc:text-xs">
        {unit}
      </span>
    </div>
  );
};

function SortableShell({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className="w-full"
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      {typeof children === "function"
        ? null
        : React.isValidElement(children)
          ? React.cloneElement(children, {
              dragHandleProps: { ...attributes, ...listeners },
            } as any)
          : children}
    </div>
  );
}

const TargetFields = React.memo(function TargetFields({
  label,
  sportType,
  readOnly,
  heartRateZones,
  powerZones,
  paceZones,
  target,
  t,
  onChange,
}: {
  label: string;
  sportType: BuilderSportType;
  readOnly?: boolean;
  heartRateZones: ZoneOption[];
  powerZones: ZoneOption[];
  paceZones: ZoneOption[];
  target: WorkoutTargetDraft;
  t: ReturnType<typeof useTranslations>;
  onChange: (next: WorkoutTargetDraft) => void;
}) {
  const family = getTargetFamily(target);
  const source = getTargetSource(target);
  const relation = source === "ZONE" ? "RANGE" : inferTargetRelation(target);
  const zoneOptions =
    family === "HEART_RATE"
      ? heartRateZones
      : family === "POWER"
        ? powerZones
        : family === "PACE"
          ? paceZones
          : [];
  const rangeInvalid =
    relation === "RANGE" &&
    target.value.trim() !== "" &&
    target.valueHigh?.trim() !== "" &&
    Number(target.value) > Number(target.valueHigh);

  const getCustomUnit = (targetFamily: TargetFamily) => {
    if (targetFamily === "HEART_RATE") return "bpm";
    if (targetFamily === "POWER") return "W";
    if (targetFamily === "PACE") {
      if (isSwimSport(sportType)) return "sec/100m";
      if (isRunSport(sportType)) return "sec/km";
      return "km/h";
    }
    return undefined;
  };

  const createTarget = (
    targetFamily: TargetFamily,
    targetSource: TargetSource = "BASE",
    zone?: ZoneOption,
  ): WorkoutTargetDraft => {
    if (targetFamily === "NONE" || targetFamily === "UNSUPPORTED") {
      return createEmptyTarget();
    }

    if (targetSource === "ZONE") {
      return {
        kind:
          targetFamily === "HEART_RATE"
            ? "HEART_RATE_ZONE"
            : targetFamily === "POWER"
              ? "POWER_ZONE"
              : "SPEED",
        value: zone ? String(zone.low) : "",
        valueHigh: zone ? String(zone.high) : "",
        relation: "RANGE",
        zoneIndex: zone?.value ?? "",
        zoneLabel: zone?.label ?? "",
        zoneSystem: zone?.zoneSystem ?? "",
        zoneSource: zone?.zoneSource ?? "TRAININGLOAD",
        unit: zone?.unit ?? getCustomUnit(targetFamily),
      };
    }

    return {
      kind:
        targetFamily === "HEART_RATE"
          ? "HEART_RATE_CUSTOM"
          : targetFamily === "POWER"
            ? "POWER_CUSTOM"
            : "SPEED",
      value: "",
      valueHigh: "",
      relation: "EQUAL",
      zoneIndex: "",
      zoneLabel: "",
      zoneSystem: "",
      zoneSource: "",
      unit: getCustomUnit(targetFamily),
    };
  };

  const updateRelation = (nextRelation: WorkoutTargetRelation) => {
    const minimumValue = getTargetMinimumValue(family);
    const currentLowValue = sanitizeNumberTextWithMinimum(
      target.value || "",
      minimumValue,
    );
    const currentHighValue = sanitizeNumberTextWithMinimum(
      target.valueHigh || "",
      minimumValue,
    );
    const currentValue = sanitizeNumberTextWithMinimum(
      target.value || target.valueHigh || "",
      minimumValue,
    );

    if (nextRelation === "EQUAL") {
      onChange({
        ...target,
        value: currentValue,
        valueHigh: currentValue,
        relation: nextRelation,
        unit: target.unit || getCustomUnit(family),
      });
      return;
    }

    if (nextRelation === "GREATER_THAN") {
      onChange({
        ...target,
        value: currentValue,
        valueHigh: "",
        relation: nextRelation,
        unit: target.unit || getCustomUnit(family),
      });
      return;
    }

    if (nextRelation === "LESS_THAN") {
      onChange({
        ...target,
        value: "",
        valueHigh: currentValue,
        relation: nextRelation,
        unit: target.unit || getCustomUnit(family),
      });
      return;
    }

    onChange({
      ...target,
      value: currentLowValue || currentValue,
      valueHigh: currentHighValue || currentValue,
      relation: nextRelation,
      unit: target.unit || getCustomUnit(family),
    });
  };

  const updateCustomValue = (side: "low" | "high", value: string) => {
    const unit = target.unit || getCustomUnit(family);
    const sanitizedValue = sanitizeNumberTextWithMinimum(
      value,
      getTargetMinimumValue(family),
    );

    if (relation === "EQUAL") {
      onChange({
        ...target,
        value: sanitizedValue,
        valueHigh: sanitizedValue,
        relation,
        unit,
      });
      return;
    }

    if (relation === "GREATER_THAN") {
      onChange({
        ...target,
        value: sanitizedValue,
        valueHigh: "",
        relation,
        unit,
      });
      return;
    }

    if (relation === "LESS_THAN") {
      onChange({
        ...target,
        value: "",
        valueHigh: sanitizedValue,
        relation,
        unit,
      });
      return;
    }

    onChange({
      ...target,
      value: side === "low" ? sanitizedValue : target.value,
      valueHigh: side === "high" ? sanitizedValue : target.valueHigh || "",
      relation,
      unit,
    });
  };

  const renderNumericField = (
    side: "low" | "high",
    placeholder: string,
    unit: string,
  ) => (
    <InputGroup className={TARGET_VALUE_FIELD_CLASS_NAME}>
      <InputGroupInput
        type="number"
        min={getTargetMinimumValue(family)}
        step={getTargetStepValue(family)}
        value={side === "low" ? target.value : target.valueHigh || ""}
        onChange={(event) => updateCustomValue(side, event.target.value)}
        disabled={readOnly}
        placeholder={placeholder}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );

  const renderPaceField = (side: "low" | "high", placeholder: string) => {
    const value = side === "low" ? target.value : target.valueHigh || "";
    const numericValue =
      Number.isFinite(Number(value)) && Number(value) > 0
        ? Number(value)
        : undefined;

    if (isSwimSport(sportType)) {
      return (
        <PaceFieldWithUnit
          value={numericValue}
          onChange={(nextValue) =>
            updateCustomValue(
              side,
              nextValue && nextValue > 0 ? String(nextValue) : "",
            )
          }
          disabled={readOnly}
          placeholder={placeholder}
          unit="/100m"
        />
      );
    }

    if (isRunSport(sportType)) {
      return (
        <PaceFieldWithUnit
          value={numericValue}
          onChange={(nextValue) =>
            updateCustomValue(
              side,
              nextValue && nextValue > 0 ? String(nextValue) : "",
            )
          }
          disabled={readOnly}
          placeholder={placeholder}
          unit="min/km"
        />
      );
    }

    return renderNumericField(side, placeholder, "km/h");
  };

  const renderValueField = () => {
    if (family === "NONE") {
      return null;
    }

    if (family === "UNSUPPORTED") {
      return (
        <div className="flex h-10 items-center text-sm text-muted-foreground pc:h-8 pc:text-xs">
          {t("states.unsupportedTarget")}
        </div>
      );
    }

    if (source === "ZONE") {
      return (
        <div className="grid gap-2">
          <Select
            value={target.zoneIndex || ""}
            onValueChange={(value) => {
              const selected = zoneOptions.find(
                (option) => option.value === value,
              );
              if (!selected) return;
              onChange(createTarget(family, "ZONE", selected));
            }}
            disabled={readOnly || zoneOptions.length === 0}
          >
            <SelectTrigger
              size="sm"
              className={TARGET_SELECT_TRIGGER_CLASS_NAME}
              aria-label={t("fields.zonePlaceholder")}
            >
              <SelectValue
                placeholder={
                  zoneOptions.length > 0
                    ? t("fields.zonePlaceholder")
                    : t("states.noZones")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {zoneOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    const placeholder =
      relation === "LESS_THAN"
        ? t("fields.toPlaceholder")
        : t("fields.targetValuePlaceholder");
    const unit = getCustomUnit(family) || "";
    const singleField =
      family === "PACE"
        ? renderPaceField(
            relation === "LESS_THAN" ? "high" : "low",
            placeholder,
          )
        : renderNumericField(
            relation === "LESS_THAN" ? "high" : "low",
            placeholder,
            unit,
          );

    return (
      <div className="grid gap-2">
        {relation === "RANGE" ? (
          <div className="grid grid-cols-2 gap-2">
            {family === "PACE"
              ? renderPaceField("low", t("fields.fromPlaceholder"))
              : renderNumericField("low", t("fields.fromPlaceholder"), unit)}
            {family === "PACE"
              ? renderPaceField("high", t("fields.toPlaceholder"))
              : renderNumericField("high", t("fields.toPlaceholder"), unit)}
          </div>
        ) : (
          singleField
        )}
        {rangeInvalid ? (
          <div className="text-[13px] text-destructive pc:text-xs">
            {t("states.invalidRange")}
          </div>
        ) : null}
      </div>
    );
  };

  const hasTargetDetails = family !== "NONE" && family !== "UNSUPPORTED";
  const stacksTargetValueOnMobile =
    family === "PACE" && source !== "ZONE" && relation === "RANGE";
  const valueColumnClassName = stacksTargetValueOnMobile
    ? "min-w-0 space-y-2 border-t border-border/50 py-2 pc:space-y-1 pc:border-0 pc:py-0"
    : TARGET_FIELD_ROW_CLASS_NAME;
  const targetTypeWidth = getCompactSelectWidth([
    t("fields.targetType"),
    ...TARGET_FAMILIES.map((option) => t(`targetTypes.${option}`)),
  ]);
  const targetSourceWidth = getCompactSelectWidth([
    t("fields.targetSource"),
    t("targetSources.BASE"),
    t("targetSources.ZONE"),
  ]);
  const targetRelationWidth = getCompactSelectWidth([
    t("fields.targetRelation"),
    ...TARGET_RELATIONS.map((option) => t(`targetRelations.${option}`)),
  ]);
  const targetValueWidth =
    family === "NONE" || family === "UNSUPPORTED"
      ? TARGET_SINGLE_VALUE_COLUMN_WIDTH
      : source === "ZONE"
        ? clampWidth(
            getCompactSelectWidth([
              t("fields.zonePlaceholder"),
              t("states.noZones"),
              ...zoneOptions.map((option) => option.label),
            ]),
            180,
            320,
          )
        : relation === "RANGE"
          ? family === "PACE"
            ? TARGET_PACE_RANGE_VALUE_COLUMN_WIDTH
            : TARGET_RANGE_VALUE_COLUMN_WIDTH
          : family === "PACE"
            ? TARGET_PACE_VALUE_COLUMN_WIDTH
            : TARGET_SINGLE_VALUE_COLUMN_WIDTH;
  const unsupportedMessageWidth = clampWidth(
    getCompactSelectWidth([t("states.unsupportedTarget")]),
    180,
    320,
  );
  const targetLayoutColumnWidths =
    family === "NONE"
      ? [targetTypeWidth]
      : family === "UNSUPPORTED"
        ? [targetTypeWidth, unsupportedMessageWidth]
        : [
            targetTypeWidth,
            targetSourceWidth,
            targetRelationWidth,
            targetValueWidth,
          ];
  const targetLayoutMinWidth =
    targetLayoutColumnWidths.reduce((total, width) => total + width, 0) +
    Math.max(0, targetLayoutColumnWidths.length - 1) * TARGET_GRID_GAP_SIZE;
  const targetLayoutStyle = {
    "--target-layout-columns": targetLayoutColumnWidths
      .map((width) => `${width}px`)
      .join(" "),
    "--target-layout-min-width": `${targetLayoutMinWidth}px`,
  } as React.CSSProperties;

  return (
    <div
      data-slot="workout-target-fields"
      className="grid max-w-full gap-0 rounded-lg bg-neutral-200/70 p-3 dark:bg-white/[0.06] pc:gap-2 pc:border pc:border-border/60 pc:bg-muted/45 pc:p-2 pc:dark:bg-muted/45"
    >
      <div className="text-[15px] font-semibold text-foreground pc:text-xs pc:font-medium pc:text-muted-foreground">
        {label}
      </div>
      <div className="max-w-full pc:-mx-1 pc:overflow-x-auto pc:overscroll-x-contain pc:px-1 pc:pb-1 pc:[-webkit-overflow-scrolling:touch]">
        <div
          className="grid w-full grid-cols-1 gap-0 pc:min-w-[var(--target-layout-min-width)] pc:grid-cols-[var(--target-layout-columns)] pc:gap-2"
          style={targetLayoutStyle}
        >
          <div className={TARGET_FIELD_ROW_CLASS_NAME}>
            <div className={TARGET_FIELD_LABEL_CLASS_NAME}>
              {t("fields.targetType")}
            </div>
            <Select
              value={family}
              onValueChange={(value: TargetFamily) =>
                onChange(createTarget(value, "BASE"))
              }
              disabled={readOnly}
            >
              <SelectTrigger
                size="sm"
                className={TARGET_SELECT_TRIGGER_CLASS_NAME}
                aria-label={t("fields.targetType")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_FAMILIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`targetTypes.${option}`)}
                  </SelectItem>
                ))}
                {family === "UNSUPPORTED" ? (
                  <SelectItem value="UNSUPPORTED" disabled>
                    {t("targetTypes.UNSUPPORTED")}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          {hasTargetDetails ? (
            <div className={TARGET_FIELD_ROW_CLASS_NAME}>
              <div className={TARGET_FIELD_LABEL_CLASS_NAME}>
                {t("fields.targetSource")}
              </div>
              <Select
                value={source}
                onValueChange={(value: TargetSource) => {
                  const firstZone = zoneOptions[0];
                  onChange(
                    value === "ZONE"
                      ? createTarget(family, "ZONE", firstZone)
                      : createTarget(family, "BASE"),
                  );
                }}
                disabled={readOnly}
              >
                <SelectTrigger
                  size="sm"
                  className={TARGET_SELECT_TRIGGER_CLASS_NAME}
                  aria-label={t("fields.targetSource")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BASE">
                    {t("targetSources.BASE")}
                  </SelectItem>
                  <SelectItem value="ZONE">
                    {t("targetSources.ZONE")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {hasTargetDetails ? (
            <div className={TARGET_FIELD_ROW_CLASS_NAME}>
              <div className={TARGET_FIELD_LABEL_CLASS_NAME}>
                {t("fields.targetRelation")}
              </div>
              <Select
                value={relation}
                onValueChange={(value: WorkoutTargetRelation) =>
                  updateRelation(value)
                }
                disabled={readOnly || source === "ZONE"}
              >
                <SelectTrigger
                  size="sm"
                  className={TARGET_SELECT_TRIGGER_CLASS_NAME}
                  aria-label={t("fields.targetRelation")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_RELATIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`targetRelations.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {family !== "NONE" ? (
            <div className={valueColumnClassName}>
              {hasTargetDetails ? (
                <div
                  className={cn(
                    TARGET_FIELD_LABEL_CLASS_NAME,
                    stacksTargetValueOnMobile &&
                      "text-[13px] text-muted-foreground",
                  )}
                >
                  {source === "ZONE"
                    ? t("fields.zonePlaceholder")
                    : t("fields.targetValue")}
                </div>
              ) : null}
              {renderValueField()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

const StepCard = React.memo(function StepCard({
  dragHandleProps,
  mobileTitle,
  module,
  onChange,
  onRemove,
  readOnly,
  sportType,
  heartRateZones,
  powerZones,
  paceZones,
}: {
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  mobileTitle?: string;
  module: WorkoutStepModule;
  onChange: (moduleId: string, next: WorkoutStepModule) => void;
  onRemove: (moduleId: string) => void;
  readOnly?: boolean;
  sportType: BuilderSportType;
  heartRateZones: ZoneOption[];
  powerZones: ZoneOption[];
  paceZones: ZoneOption[];
}) {
  const pageT = useTranslations("PlanCreatePage");
  const [mobileExpanded, setMobileExpanded] = React.useState(false);

  const durationOptions = getDurationOptionsForSport(sportType);
  const showTargetFields = !isThresholdDurationKind(module.durationKind);
  const emitChange = React.useCallback(
    (next: WorkoutStepModule) => onChange(module.id, next),
    [module.id, onChange],
  );
  const mobileDuration =
    module.durationKind === "TIME"
      ? `${Math.max(1, Math.round(module.duration / 60))} min`
      : module.durationKind === "DISTANCE"
        ? `${module.duration} ${isSwimSport(sportType) ? "m" : "km"}`
        : module.durationKind === "OPEN"
          ? pageT(`durationKinds.${module.durationKind}`)
          : String(module.duration);

  const renderDurationField = () => {
    if (module.durationKind === "TIME") {
      return (
        <DurationTimeInput
          value={module.duration > 0 ? module.duration : undefined}
          onChange={(nextValue) =>
            emitChange({
              ...module,
              duration: nextValue && nextValue > 0 ? nextValue : 60,
            })
          }
          disabled={readOnly}
        />
      );
    }

    if (module.durationKind === "DISTANCE") {
      const minimumValue = getDurationMinimumValue(module.durationKind);
      return (
        <InputGroup className={DURATION_VALUE_FIELD_CLASS_NAME}>
          <InputGroupInput
            type="number"
            min={minimumValue}
            step={isSwimSport(sportType) ? 1 : 0.1}
            value={module.duration}
            onChange={(event) =>
              emitChange({
                ...module,
                duration: parseNumberWithMinimum(
                  event.target.value,
                  minimumValue,
                ),
              })
            }
            disabled={readOnly}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>
              {isSwimSport(sportType) ? "m" : "km"}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      );
    }

    if (module.durationKind === "CALORIES") {
      const minimumValue = getDurationMinimumValue(module.durationKind);
      return (
        <InputGroup className={DURATION_VALUE_FIELD_CLASS_NAME}>
          <InputGroupInput
            type="number"
            min={minimumValue}
            step={1}
            value={module.duration}
            onChange={(event) =>
              emitChange({
                ...module,
                duration: parseNumberWithMinimum(
                  event.target.value,
                  minimumValue,
                ),
              })
            }
            disabled={readOnly}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>kJ</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      );
    }

    if (module.durationKind === "OPEN") {
      return (
        <InputGroup className={DURATION_VALUE_FIELD_CLASS_NAME}>
          <InputGroupInput value="-" disabled />
        </InputGroup>
      );
    }

    const thresholdUnit =
      module.durationKind === "POWER_GREATER_THAN" ||
      module.durationKind === "POWER_LESS_THAN"
        ? "W"
        : module.durationKind === "CADENCE_GREATER_THAN" ||
            module.durationKind === "CADENCE_LESS_THAN"
          ? "rpm"
          : "bpm";
    const minimumValue = getDurationMinimumValue(module.durationKind);

    return (
      <InputGroup className={DURATION_VALUE_FIELD_CLASS_NAME}>
        <InputGroupInput
          type="number"
          min={minimumValue}
          step={1}
          value={module.duration}
          onChange={(event) =>
            emitChange({
              ...module,
              duration: parseNumberWithMinimum(
                event.target.value,
                minimumValue,
              ),
            })
          }
          disabled={readOnly}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{thresholdUnit}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    );
  };

  return (
    <div className="overflow-hidden rounded-surface bg-background pc:overflow-visible pc:border pc:border-border/60 pc:p-2">
      <div className="flex min-h-[60px] items-center px-3 pc:hidden">
        <button
          type="button"
          data-testid={`mobile-workout-step-${module.id}`}
          aria-expanded={mobileExpanded}
          onClick={() => setMobileExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-center text-left"
        >
          <span className="mr-3 grid size-9 shrink-0 place-items-center rounded-compact bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <MobileStepTypeIcon stepType={module.stepType} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-semibold">
              {mobileTitle ?? pageT("cards.step")}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
              {pageT(`stepTypes.${module.stepType}`)} · {mobileDuration}
            </span>
          </span>
          {mobileExpanded ? (
            <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="ml-2 size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          className="ml-1 shrink-0 rounded-full text-red-600"
          onClick={() => onRemove(module.id)}
          disabled={readOnly}
        >
          <Trash2 className="size-[17px]" />
        </Button>
      </div>

      <div className="mb-3 hidden items-start justify-between gap-3 pc:flex">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium">{pageT("cards.step")}</div>
        </div>
        <Button
          type="button"
          size="icon-compact"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(module.id)}
          disabled={readOnly}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div
        className={cn(
          "gap-3 border-t border-border/60 px-3 pb-3 pt-3 pc:grid pc:border-0 pc:px-0 pc:pb-0 pc:pt-0",
          mobileExpanded ? "grid" : "hidden",
        )}
      >
        <div className="grid gap-0 pc:grid-cols-[112px_128px_minmax(0,1fr)] pc:gap-3">
          <div className={BUILDER_FIELD_ROW_CLASS_NAME}>
            <div className={BUILDER_FIELD_LABEL_CLASS_NAME}>
              {pageT("fields.stepType")}
            </div>
            <Select
              value={module.stepType}
              onValueChange={(value: WorkoutModuleStepType) =>
                emitChange({ ...module, stepType: value })
              }
              disabled={readOnly}
            >
              <SelectTrigger
                size="sm"
                className={BUILDER_SELECT_TRIGGER_CLASS_NAME}
                aria-label={pageT("fields.stepType")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STEP_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {pageT(`stepTypes.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={BUILDER_FIELD_ROW_CLASS_NAME}>
            <div className={BUILDER_FIELD_LABEL_CLASS_NAME}>
              {pageT("fields.durationType")}
            </div>
            <Select
              value={module.durationKind}
              onValueChange={(value: WorkoutDurationKind) => {
                emitChange({
                  ...module,
                  durationKind: value,
                  primaryTarget: isThresholdDurationKind(value)
                    ? createEmptyTarget()
                    : module.primaryTarget,
                  secondaryTarget: createEmptyTarget(),
                });
              }}
              disabled={readOnly}
            >
              <SelectTrigger
                size="sm"
                className={BUILDER_SELECT_TRIGGER_CLASS_NAME}
                aria-label={pageT("fields.durationType")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durationOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {getDurationOptionLabel(option, pageT)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={BUILDER_FIELD_ROW_CLASS_NAME}>
            <div className={BUILDER_FIELD_LABEL_CLASS_NAME}>
              {pageT("fields.durationValue")}
            </div>
            {renderDurationField()}
          </div>
        </div>

        {isSwimSport(sportType) ? (
          <div className="grid gap-0 pc:grid-cols-3 pc:gap-3">
            <div className={BUILDER_FIELD_ROW_CLASS_NAME}>
              <div className={BUILDER_FIELD_LABEL_CLASS_NAME}>
                {pageT("fields.swimStroke")}
              </div>
              <Select
                value={module.swimStroke || ""}
                onValueChange={(value: SwimStrokeKind) =>
                  emitChange({ ...module, swimStroke: value })
                }
                disabled={readOnly}
              >
                <SelectTrigger
                  size="sm"
                  className={BUILDER_SELECT_TRIGGER_CLASS_NAME}
                  aria-label={pageT("fields.swimStroke")}
                >
                  <SelectValue
                    placeholder={pageT("fields.selectPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {SWIM_STROKE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {pageT(`swim.stroke.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={BUILDER_FIELD_ROW_CLASS_NAME}>
              <div className={BUILDER_FIELD_LABEL_CLASS_NAME}>
                {pageT("fields.swimTrainingType")}
              </div>
              <Select
                value={module.swimTrainingType || ""}
                onValueChange={(value: SwimTrainingType) =>
                  emitChange({ ...module, swimTrainingType: value })
                }
                disabled={readOnly}
              >
                <SelectTrigger
                  size="sm"
                  className={BUILDER_SELECT_TRIGGER_CLASS_NAME}
                  aria-label={pageT("fields.swimTrainingType")}
                >
                  <SelectValue
                    placeholder={pageT("fields.selectPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {SWIM_TRAINING_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {pageT(`swim.trainingType.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={BUILDER_FIELD_ROW_CLASS_NAME}>
              <div className={BUILDER_FIELD_LABEL_CLASS_NAME}>
                {pageT("fields.swimEquipment")}
              </div>
              <Select
                value={module.swimEquipment || ""}
                onValueChange={(value: SwimEquipmentType) =>
                  emitChange({ ...module, swimEquipment: value })
                }
                disabled={readOnly}
              >
                <SelectTrigger
                  size="sm"
                  className={BUILDER_SELECT_TRIGGER_CLASS_NAME}
                  aria-label={pageT("fields.swimEquipment")}
                >
                  <SelectValue
                    placeholder={pageT("fields.selectPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {SWIM_EQUIPMENT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {pageT(`swim.equipment.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {showTargetFields && isSwimSport(sportType) ? (
          <TargetFields
            label={pageT("fields.swimIntensityTarget")}
            sportType={sportType}
            readOnly={readOnly}
            target={module.primaryTarget}
            t={pageT}
            heartRateZones={heartRateZones}
            powerZones={powerZones}
            paceZones={paceZones}
            onChange={(next) => emitChange({ ...module, primaryTarget: next })}
          />
        ) : showTargetFields ? (
          <TargetFields
            label={pageT("fields.primaryTarget")}
            sportType={sportType}
            readOnly={readOnly}
            target={module.primaryTarget}
            t={pageT}
            heartRateZones={heartRateZones}
            powerZones={powerZones}
            paceZones={paceZones}
            onChange={(next) => emitChange({ ...module, primaryTarget: next })}
          />
        ) : null}
      </div>
    </div>
  );
});

const RepeatCard = React.memo(function RepeatCard({
  dragHandleProps,
  mobileTitle,
  module,
  onChange,
  onRemove,
  readOnly,
  sportType,
  heartRateZones,
  powerZones,
  paceZones,
}: {
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  mobileTitle?: string;
  module: WorkoutRepeatModule;
  onChange: (moduleId: string, next: WorkoutRepeatModule) => void;
  onRemove: (moduleId: string) => void;
  readOnly?: boolean;
  sportType: BuilderSportType;
  heartRateZones: ZoneOption[];
  powerZones: ZoneOption[];
  paceZones: ZoneOption[];
}) {
  const t = useTranslations("PlanCreatePage");
  const tMobile = useTranslations("WorkoutEditor.mobile");
  const [mobileExpanded, setMobileExpanded] = React.useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const emitChange = React.useCallback(
    (next: WorkoutRepeatModule) => onChange(module.id, next),
    [module.id, onChange],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = module.steps.findIndex((step) => step.id === active.id);
    const nextIndex = module.steps.findIndex((step) => step.id === over.id);
    if (oldIndex < 0 || nextIndex < 0) return;
    emitChange({
      ...module,
      steps: arrayMove(module.steps, oldIndex, nextIndex),
    });
  };

  const updateStep = React.useCallback(
    (stepId: string, next: WorkoutStepModule) => {
      emitChange({
        ...module,
        steps: module.steps.map((item) => (item.id === stepId ? next : item)),
      });
    },
    [emitChange, module],
  );

  const removeStep = React.useCallback(
    (stepId: string) => {
      emitChange({
        ...module,
        steps:
          module.steps.length > 1
            ? module.steps.filter((item) => item.id !== stepId)
            : [createStepModule("WORK")],
      });
    },
    [emitChange, module],
  );

  return (
    <div className="overflow-hidden rounded-surface bg-background pc:overflow-visible pc:border pc:border-border/60 pc:p-2">
      <div className="flex min-h-[60px] items-center px-3 pc:hidden">
        <button
          type="button"
          data-testid={`mobile-workout-repeat-${module.id}`}
          aria-expanded={mobileExpanded}
          onClick={() => setMobileExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-center text-left"
        >
          <span className="mr-3 grid size-9 shrink-0 place-items-center rounded-compact bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <Repeat2 className="size-[17px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-semibold">
              {mobileTitle ?? t("cards.repeat")}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
              {tMobile("repeatSummary", {
                count: module.count,
                steps: module.steps.length,
              })}
            </span>
          </span>
          {mobileExpanded ? (
            <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="ml-2 size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          className="ml-1 shrink-0 rounded-full text-red-600"
          onClick={() => onRemove(module.id)}
          disabled={readOnly}
        >
          <Trash2 className="size-[17px]" />
        </Button>
      </div>

      <div className="mb-3 hidden items-start justify-between gap-3 pc:flex">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium">{t("cards.repeat")}</div>
        </div>
        <Button
          type="button"
          size="icon-compact"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(module.id)}
          disabled={readOnly}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div
        className={cn(
          "border-t border-border/60 px-3 pb-3 pt-3 pc:block pc:border-0 pc:px-0 pc:pb-0 pc:pt-0",
          mobileExpanded ? "block" : "hidden",
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="text-[16px] text-foreground pc:text-xs pc:font-medium pc:text-muted-foreground">
            {t("fields.repeatCount")}
          </div>
          <Input
            type="number"
            min={1}
            value={module.count}
            onChange={(event) =>
              emitChange({
                ...module,
                count: Math.max(1, Number(event.target.value) || 1),
              })
            }
            disabled={readOnly}
            className="h-10 w-20 rounded-control border-0 bg-neutral-100 text-[16px] shadow-none focus-visible:ring-0 dark:bg-muted/45 pc:h-8 pc:border pc:bg-transparent pc:text-sm"
          />
          <Button
            type="button"
            size="touch-compact"
            variant="outline"
            className="border-0 bg-neutral-100 dark:bg-muted/45 pc:border pc:bg-background"
            onClick={() =>
              emitChange({
                ...module,
                steps: [...module.steps, createStepModule("WORK")],
              })
            }
            disabled={readOnly}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("buttons.addStep")}
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={module.steps.map((step) => step.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3 rounded-control-lg bg-neutral-100 p-2 dark:bg-muted/35 pc:rounded-none pc:bg-transparent pc:p-0">
              {module.steps.map((step, stepIndex) => (
                <SortableShell key={step.id} id={step.id}>
                  <StepCard
                    mobileTitle={tMobile("stepLabel", {
                      number: stepIndex + 1,
                    })}
                    module={step}
                    readOnly={readOnly}
                    sportType={sportType}
                    heartRateZones={heartRateZones}
                    powerZones={powerZones}
                    paceZones={paceZones}
                    onChange={updateStep}
                    onRemove={removeStep}
                  />
                </SortableShell>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
});

export function StructuredWorkoutBuilder({
  sportType,
  value,
  onChange,
  readOnly = false,
}: StructuredWorkoutBuilderProps) {
  const t = useTranslations("PlanCreatePage");
  const tMobile = useTranslations("WorkoutEditor.mobile");
  const {
    sensors,
    heartRateZones,
    powerZones,
    paceZones,
    handleDragEnd,
    addStep,
    addRepeat,
    updateModule,
    removeModule,
  } = useStructuredWorkoutBuilderModel({
    sportType,
    value,
    onChange,
  });

  return (
    <div className="flex min-h-0 flex-col gap-4 pc:h-full pc:gap-3">
      <p className="px-1 text-[13px] leading-[18px] text-muted-foreground pc:hidden">
        {tMobile("manualBuilderHint")}
      </p>

      <div className="hidden shrink-0 flex-wrap gap-2 pc:flex">
        <Button
          type="button"
          size="touch-xs"
          variant="outline"
          className="border-0 bg-background pc:border"
          onClick={addStep}
          disabled={readOnly}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("buttons.addStep")}
        </Button>
        <Button
          type="button"
          size="touch-xs"
          variant="outline"
          className="border-0 bg-background pc:border"
          onClick={addRepeat}
          disabled={readOnly}
        >
          <Repeat2 className="mr-1 h-3.5 w-3.5" />
          {t("buttons.addRepeat")}
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="min-h-0 pc:flex-1">
          <div className="rounded-control-lg bg-background p-4 text-sm text-muted-foreground pc:border pc:border-dashed pc:border-border/70 pc:p-2">
            {t("states.emptyStructure")}
          </div>
        </div>
      ) : (
        <div className="min-h-0 pc:flex-1 pc:overflow-y-auto pc:pr-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={value.map((module) => module.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {value.map((module, moduleIndex) => (
                  <SortableShell key={module.id} id={module.id}>
                    {module.kind === "STEP" ? (
                      <StepCard
                        mobileTitle={tMobile("stepLabel", {
                          number: moduleIndex + 1,
                        })}
                        module={module}
                        readOnly={readOnly}
                        sportType={sportType}
                        heartRateZones={heartRateZones}
                        powerZones={powerZones}
                        paceZones={paceZones}
                        onChange={updateModule}
                        onRemove={removeModule}
                      />
                    ) : (
                      <RepeatCard
                        mobileTitle={tMobile("repeatLabel", {
                          number: moduleIndex + 1,
                        })}
                        module={module}
                        readOnly={readOnly}
                        sportType={sportType}
                        heartRateZones={heartRateZones}
                        powerZones={powerZones}
                        paceZones={paceZones}
                        onChange={updateModule}
                        onRemove={removeModule}
                      />
                    )}
                  </SortableShell>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {!readOnly ? (
        <div className="overflow-hidden rounded-surface bg-background pc:hidden">
          <button
            type="button"
            data-testid="mobile-add-workout-step"
            onClick={addStep}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 px-4 text-[16px] font-medium text-emerald-700 active:bg-neutral-50 dark:text-emerald-300 dark:active:bg-muted/45"
          >
            <Plus className="size-[19px]" />
            {t("buttons.addStep")}
          </button>
          <button
            type="button"
            data-testid="mobile-add-workout-repeat"
            onClick={addRepeat}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 border-t border-border/60 px-4 text-[16px] font-medium text-emerald-700 active:bg-neutral-50 dark:text-emerald-300 dark:active:bg-muted/45"
          >
            <Repeat2 className="size-[19px]" />
            {t("buttons.addRepeat")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
