"use client";

import React from "react";
import type {
  ParsedPlan,
  RepeatBlock,
  WorkRestBlock,
  WorkRestStep,
} from "@/api/workout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

type TargetKind =
  | "none"
  | "powerPercent"
  | "powerWatts"
  | "cadence"
  | "heartRateBpm"
  | "paceKmh"
  | "gradeDeg";

type ManualWorkoutBuilderProps = {
  plan: ParsedPlan | null;
  onChange: (plan: ParsedPlan) => void;
  readOnly?: boolean;
};

const clonePlan = (plan: ParsedPlan | null): ParsedPlan =>
  JSON.parse(JSON.stringify(plan ?? [])) as ParsedPlan;

const createStep = (): WorkRestStep => ({
  duration: 60,
});

const createBlock = (type: "work" | "rest"): WorkRestBlock => ({
  type,
  steps: [createStep()],
});

const createRepeatBlock = (): RepeatBlock => ({
  type: "repeat",
  count: 2,
  children: [createBlock("work"), createBlock("rest")],
});

const getStepTargetKind = (step: WorkRestStep): TargetKind => {
  if (step.powerWatts != null) return "powerWatts";
  if (step.power != null) return "powerPercent";
  if (step.cadence != null) return "cadence";
  if (step.heartRateBpm != null || step.heartRatePercent != null)
    return "heartRateBpm";
  if (step.paceKmh != null) return "paceKmh";
  if (step.gradeDeg != null) return "gradeDeg";
  return "none";
};

const getStepTargetValue = (step: WorkRestStep, kind: TargetKind): string => {
  switch (kind) {
    case "powerPercent":
      return step.power != null ? String(Math.round(step.power * 100)) : "";
    case "powerWatts":
      return step.powerWatts != null ? String(step.powerWatts) : "";
    case "cadence":
      return step.cadence != null ? String(step.cadence) : "";
    case "heartRateBpm":
      return step.heartRateBpm != null
        ? String(step.heartRateBpm)
        : step.heartRatePercent != null
          ? String(step.heartRatePercent)
          : "";
    case "paceKmh":
      return step.paceKmh != null ? String(step.paceKmh) : "";
    case "gradeDeg":
      return step.gradeDeg != null ? String(step.gradeDeg) : "";
    default:
      return "";
  }
};

const clearTargets = (step: WorkRestStep): WorkRestStep => ({
  duration: step.duration,
});

function StepEditor({
  step,
  readOnly,
  onChange,
  onRemove,
}: {
  step: WorkRestStep;
  readOnly?: boolean;
  onChange: (next: WorkRestStep) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("WorkoutEditor");
  const targetKind = getStepTargetKind(step);
  const targetValue = getStepTargetValue(step, targetKind);

  const applyTarget = (kind: TargetKind, rawValue: string) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      onChange(clearTargets(step));
      return;
    }

    const next = clearTargets(step);
    switch (kind) {
      case "powerPercent":
        next.power = value / 100;
        break;
      case "powerWatts":
        next.powerWatts = value;
        break;
      case "cadence":
        next.cadence = value;
        break;
      case "heartRateBpm":
        next.heartRateBpm = value;
        break;
      case "paceKmh":
        next.paceKmh = value;
        break;
      case "gradeDeg":
        next.gradeDeg = value;
        break;
      case "none":
      default:
        break;
    }
    onChange(next);
  };

  return (
    <div className="grid gap-2.5 rounded-md border border-border/60 bg-muted/45 p-2.5 md:grid-cols-[110px_150px_1fr_auto]">
      <div className="space-y-1">
        <div className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("manual.fields.duration")}
        </div>
        <Input
          type="number"
          min={1}
          value={step.duration}
          onChange={(e) =>
            onChange({
              ...step,
              duration: Math.max(1, Number(e.target.value) || 1),
            })
          }
          disabled={readOnly}
        />
      </div>
      <div className="space-y-1">
        <div className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("manual.fields.targetType")}
        </div>
        <Select
          value={targetKind}
          onValueChange={(value: TargetKind) => applyTarget(value, targetValue)}
          disabled={readOnly}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("manual.targets.none")}</SelectItem>
            <SelectItem value="powerPercent">
              {t("manual.targets.powerPercent")}
            </SelectItem>
            <SelectItem value="powerWatts">
              {t("manual.targets.powerWatts")}
            </SelectItem>
            <SelectItem value="cadence">
              {t("manual.targets.cadence")}
            </SelectItem>
            <SelectItem value="heartRateBpm">
              {t("manual.targets.heartRateBpm")}
            </SelectItem>
            <SelectItem value="paceKmh">
              {t("manual.targets.paceKmh")}
            </SelectItem>
            <SelectItem value="gradeDeg">
              {t("manual.targets.gradeDeg")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <div className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("manual.fields.targetValue")}
        </div>
        <Input
          type="number"
          step="any"
          value={targetValue}
          disabled={readOnly || targetKind === "none"}
          placeholder={t("manual.fields.targetValuePlaceholder")}
          onChange={(e) => applyTarget(targetKind, e.target.value)}
        />
      </div>
      <div className="flex items-end">
        <Button
          size="sm"
          variant="outline"
          onClick={onRemove}
          disabled={readOnly}
        >
          {t("manual.buttons.remove")}
        </Button>
      </div>
    </div>
  );
}

function WorkRestBlockEditor({
  block,
  readOnly,
  title,
  onChange,
  onRemove,
}: {
  block: WorkRestBlock;
  readOnly?: boolean;
  title: string;
  onChange: (next: WorkRestBlock) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("WorkoutEditor");

  return (
    <div className="space-y-2.5 rounded-md border border-border/60 bg-background p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex items-center gap-2">
          <Select
            value={block.type}
            onValueChange={(value: "work" | "rest") =>
              onChange({ ...block, type: value })
            }
            disabled={readOnly}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="work">{t("manual.blocks.work")}</SelectItem>
              <SelectItem value="rest">{t("manual.blocks.rest")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={onRemove}
            disabled={readOnly}
          >
            {t("manual.buttons.removeBlock")}
          </Button>
        </div>
      </div>

      <div className="space-y-2.5">
        {block.steps.map((step, stepIndex) => (
          <StepEditor
            key={stepIndex}
            step={step}
            readOnly={readOnly}
            onChange={(nextStep) => {
              const next = clonePlan([block])[0] as WorkRestBlock;
              next.steps[stepIndex] = nextStep;
              onChange(next);
            }}
            onRemove={() => {
              const next = clonePlan([block])[0] as WorkRestBlock;
              next.steps.splice(stepIndex, 1);
              onChange({
                ...next,
                steps: next.steps.length > 0 ? next.steps : [createStep()],
              });
            }}
          />
        ))}
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onChange({ ...block, steps: [...block.steps, createStep()] })
        }
        disabled={readOnly}
      >
        {t("manual.buttons.addStep")}
      </Button>
    </div>
  );
}

function RepeatBlockEditor({
  block,
  readOnly,
  title,
  onChange,
  onRemove,
}: {
  block: RepeatBlock;
  readOnly?: boolean;
  title: string;
  onChange: (next: RepeatBlock) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("WorkoutEditor");

  return (
    <div className="space-y-2.5 rounded-md border border-border/60 bg-background p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRemove}
          disabled={readOnly}
        >
          {t("manual.buttons.removeBlock")}
        </Button>
      </div>

      <div className="space-y-1">
        <div className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("manual.fields.repeatCount")}
        </div>
        <Input
          type="number"
          min={1}
          value={block.count}
          onChange={(e) =>
            onChange({
              ...block,
              count: Math.max(1, Number(e.target.value) || 1),
            })
          }
          disabled={readOnly}
          className="w-[140px]"
        />
      </div>

      <div className="space-y-2.5">
        {block.children.map((child, index) => (
          <WorkRestBlockEditor
            key={index}
            block={child}
            readOnly={readOnly}
            title={`${t("manual.labels.child")} ${index + 1}`}
            onChange={(nextChild) => {
              const next = clonePlan([block])[0] as RepeatBlock;
              next.children[index] = nextChild;
              onChange(next);
            }}
            onRemove={() => {
              const next = clonePlan([block])[0] as RepeatBlock;
              next.children.splice(index, 1);
              onChange({
                ...next,
                children:
                  next.children.length > 0
                    ? next.children
                    : [createBlock("work")],
              });
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...block,
              children: [...block.children, createBlock("work")],
            })
          }
          disabled={readOnly}
        >
          {t("manual.buttons.addWorkBlock")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...block,
              children: [...block.children, createBlock("rest")],
            })
          }
          disabled={readOnly}
        >
          {t("manual.buttons.addRestBlock")}
        </Button>
      </div>
    </div>
  );
}

export function ManualWorkoutBuilder({
  plan,
  onChange,
  readOnly = false,
}: ManualWorkoutBuilderProps) {
  const t = useTranslations("WorkoutEditor");
  const blocks = plan ?? [];

  return (
    <div className="space-y-3 pb-1">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...blocks, createBlock("work")])}
          disabled={readOnly}
        >
          {t("manual.buttons.addWorkBlock")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...blocks, createBlock("rest")])}
          disabled={readOnly}
        >
          {t("manual.buttons.addRestBlock")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...blocks, createRepeatBlock()])}
          disabled={readOnly}
        >
          {t("manual.buttons.addRepeatBlock")}
        </Button>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          {t("manual.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block, index) =>
            block.type === "repeat" ? (
              <RepeatBlockEditor
                key={index}
                block={block}
                readOnly={readOnly}
                title={`${t("manual.blocks.repeat")} ${index + 1}`}
                onChange={(nextBlock) => {
                  const nextPlan = clonePlan(blocks);
                  nextPlan[index] = nextBlock;
                  onChange(nextPlan);
                }}
                onRemove={() => {
                  const nextPlan = clonePlan(blocks);
                  nextPlan.splice(index, 1);
                  onChange(nextPlan);
                }}
              />
            ) : (
              <WorkRestBlockEditor
                key={index}
                block={block}
                readOnly={readOnly}
                title={`${block.type === "work" ? t("manual.blocks.work") : t("manual.blocks.rest")} ${index + 1}`}
                onChange={(nextBlock) => {
                  const nextPlan = clonePlan(blocks);
                  nextPlan[index] = nextBlock;
                  onChange(nextPlan);
                }}
                onRemove={() => {
                  const nextPlan = clonePlan(blocks);
                  nextPlan.splice(index, 1);
                  onChange(nextPlan);
                }}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
