"use client";

import React, { useState } from "react";
import { Braces, Check, ChevronLeft, X } from "lucide-react";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ParsedPlan } from "@/api/workout";
import {
  getWorkoutDefinitionIssueCode,
  parseWorkoutDefinition,
  stringifyParsedPlan,
} from "@/api/workout";
import { SportType } from "@/api/activities";
import type { PlanSportType as ApiPlanSportType } from "@/api/plans";
import {
  canCreateStructuredWorkout,
  getManualWorkoutSportCatalog,
  getLocalizedSportDefinitionName,
  getLocalizedSportFamilyName,
  getPlanningWorkoutStructureKind,
  usePlanningSportCatalog,
} from "@/api/sports";
import { WorkoutUploadButton } from "@/components/workout/WorkoutUploadButton";
import { WorkoutPlanChart } from "@/components/workout/WorkoutPlanChart";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import { useTranslations } from "next-intl";
import { StructuredWorkoutBuilder } from "@/components/plan/StructuredWorkoutBuilder";
import {
  createDefaultStrengthWorkout,
  StrengthWorkoutBuilder,
} from "@/components/plan/StrengthWorkoutBuilder";
import type { StrengthWorkoutIrV1 } from "@shared/strength-workout-ir";
import type {
  WorkoutDefinitionInput,
  WorkoutStructure,
  WorkoutStructureKind,
} from "@shared/workout-structure";
import type { WorkoutSummary } from "@shared/workout-summary";
import {
  createStepModule,
  structureModulesFromBlocks,
  structureModulesToBlocks,
  validateWorkoutStructure,
  type WorkoutStructureModule,
} from "@/components/plan/plan-workout-builder-model";
import { buildZoneResolutionContext } from "@/components/plan/zone-target-resolution";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useUserZones } from "@/hooks/useUserZones";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type PlanSportType = ApiPlanSportType;

export type WorkoutEditorPayload = {
  text: string;
  notes: string;
  sportType: PlanSportType;
  sportDefinitionCode: string;
  blocks: ParsedPlan | null;
  structureKind: WorkoutStructureKind;
  structure: WorkoutStructure;
  summary: WorkoutSummary;
  definition: WorkoutDefinitionInput;
  name?: string | null;
};

export type WorkoutEditorInitialValue = {
  text?: string;
  notes?: string;
  sportType?: PlanSportType;
  sportDefinitionCode?: string | null;
  blocks?: ParsedPlan | null;
  structureKind?: WorkoutStructureKind;
  structure?: WorkoutStructure | null;
  summary?: WorkoutSummary | null;
  name?: string | null;
};

type WorkoutEditorSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  mobileTitle?: string;
  mobileScheduleLabel?: string;
  mobilePlanLayout?: boolean;
  readOnly?: boolean;
  initialValue?: WorkoutEditorInitialValue;
  resetKey?: string;
  onSave: (payload: WorkoutEditorPayload) => Promise<void>;
  saveLabel?: string;
  showDelete?: boolean;
  canDelete?: boolean;
  onDelete?: () => Promise<void>;
  headerExtra?: React.ReactNode;
  showNameField?: boolean;
};

const DEFAULT_INITIAL: WorkoutEditorInitialValue = {
  text: "work 45m",
  notes: "",
  sportType: "RUN",
  sportDefinitionCode: "ROAD_RUNNING",
  blocks: null,
  name: "",
};

const createDefaultMobileEnduranceStructure = (): WorkoutStructureModule[] => [
  { ...createStepModule("WARMUP"), duration: 10 * 60 },
  { ...createStepModule("WORK"), duration: 30 * 60 },
  { ...createStepModule("COOLDOWN"), duration: 5 * 60 },
];

const DESKTOP_FOOTER_BUTTON_LAYOUT_CLASS = "hidden pc:inline-flex";

export function WorkoutEditorSheet({
  open,
  onOpenChange,
  title,
  mobileTitle,
  mobileScheduleLabel,
  mobilePlanLayout = false,
  readOnly = false,
  initialValue,
  resetKey,
  onSave,
  saveLabel,
  showDelete = false,
  canDelete = false,
  onDelete,
  headerExtra,
  showNameField = false,
}: WorkoutEditorSheetProps) {
  const t = useTranslations("WorkoutEditor");
  const tSports = useTranslations("SportCatalog");
  const [raw, setRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [sportType, setSportType] = useState<PlanSportType>("RUN");
  const [sportDefinitionCode, setSportDefinitionCode] =
    useState("ROAD_RUNNING");
  const [error, setError] = useState<string | null>(null);
  const [parsedPlan, setParsedPlan] = useState<ParsedPlan | null>(null);
  const [structureKind, setStructureKind] =
    useState<WorkoutStructureKind>("ENDURANCE");
  const [strengthStructure, setStrengthStructure] =
    useState<StrengthWorkoutIrV1>(createDefaultStrengthWorkout);
  const [workoutSummary, setWorkoutSummary] = useState<WorkoutSummary | null>(
    null,
  );
  const [structure, setStructure] = useState<WorkoutStructureModule[]>([]);
  const [validating, setValidating] = useState(false);
  const [mode, setMode] = useState<"rules" | "manual">("manual");
  const { data: userZones } = useUserZones();
  const { data: userProfile } = useUserProfile(sportType as SportType);
  const { data: sportCatalog = [] } = usePlanningSportCatalog();
  const manualSportCatalog = React.useMemo(
    () => getManualWorkoutSportCatalog(sportCatalog),
    [sportCatalog],
  );
  const selectedSportDefinition = React.useMemo(
    () =>
      sportCatalog.find((sport) => sport.code === sportDefinitionCode) ??
      manualSportCatalog.find((sport) => sport.code === sportDefinitionCode),
    [manualSportCatalog, sportCatalog, sportDefinitionCode],
  );
  const sportGroups = React.useMemo(
    () =>
      Array.from(
        manualSportCatalog.reduce((groups, sport) => {
          const items = groups.get(sport.family) ?? [];
          items.push(sport);
          groups.set(sport.family, items);
          return groups;
        }, new Map<PlanSportType, typeof manualSportCatalog>()),
      ),
    [manualSportCatalog],
  );
  const zoneResolution = React.useMemo(
    () => buildZoneResolutionContext(sportType, userProfile, userZones),
    [sportType, userProfile, userZones],
  );

  const getDefinitionErrorMessage = (
    error: unknown,
    fallback: "errors.parseFailed" | "errors.saveFailed",
  ) => {
    switch (getWorkoutDefinitionIssueCode(error)) {
      case "EMPTY_EXERCISE_NAME":
        return t("errors.definition.exerciseNameRequired");
      case "MISSING_EXERCISE":
        return t("errors.definition.exerciseRequired");
      case "MISSING_SET_GROUP":
        return t("errors.definition.setGroupRequired");
      case "MISSING_WORK_SET":
        return t("errors.definition.workSetRequired");
      case undefined:
        return t(fallback);
      default:
        return t("errors.invalidInput");
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const seed = { ...DEFAULT_INITIAL, ...initialValue };
    const nextSportType = seed.sportType || "RUN";
    const nextStructureKind =
      seed.structureKind ??
      seed.structure?.kind ??
      (seed.sportDefinitionCode === "STRENGTH_TRAINING"
        ? "STRENGTH"
        : "ENDURANCE");
    setNotes(seed.notes || "");
    setName(seed.name || "");
    setStructureKind(nextStructureKind);
    setStrengthStructure(
      seed.structure?.kind === "STRENGTH"
        ? seed.structure
        : createDefaultStrengthWorkout(),
    );
    setWorkoutSummary(seed.summary ?? null);
    setSportType(nextSportType);
    setSportDefinitionCode(
      seed.sportDefinitionCode ||
        (nextSportType === "CYCLING"
          ? "ROAD_CYCLING"
          : nextSportType === "SWIM"
            ? "POOL_SWIMMING"
            : nextSportType === "STRETCHING"
              ? "STRETCHING"
              : nextSportType === "RUN"
                ? "ROAD_RUNNING"
                : "OTHER"),
    );
    const seededStructure = structureModulesFromBlocks(
      seed.blocks || null,
      nextSportType,
    );
    const useDefaultMobileStructure =
      mobilePlanLayout &&
      nextStructureKind === "ENDURANCE" &&
      seededStructure.length === 0 &&
      !seed.text?.trim();
    const nextStructure = useDefaultMobileStructure
      ? createDefaultMobileEnduranceStructure()
      : seededStructure;
    const defaultMobilePlan = useDefaultMobileStructure
      ? structureModulesToBlocks(nextStructure, nextSportType)
      : null;

    setStructure(nextStructure);
    setParsedPlan(defaultMobilePlan ?? seed.blocks ?? null);
    setRaw(
      defaultMobilePlan
        ? stringifyParsedPlan(defaultMobilePlan, {
            sportType: nextSportType,
          })
        : seed.text || "",
    );
    setMode(
      mobilePlanLayout &&
        nextStructureKind === "ENDURANCE" &&
        seededStructure.length === 0 &&
        Boolean(seed.text?.trim())
        ? "rules"
        : "manual",
    );
    setError(null);
  }, [open, resetKey, initialValue, mobilePlanLayout]);

  const handleSave = async () => {
    if (!sportType) {
      setError(t("errors.sportType"));
      return;
    }

    setValidating(true);
    setError(null);

    try {
      let input: WorkoutDefinitionInput;
      if (mode === "manual" && structureKind === "ENDURANCE") {
        if (!validateWorkoutStructure(structure)) {
          setError(t("errors.invalidInput"));
          return;
        }
        const nextParsedPlan = structureModulesToBlocks(
          structure,
          sportType,
          zoneResolution,
          { strict: true },
        );
        input = {
          kind: "ENDURANCE",
          version: 1,
          source: "STRUCTURE",
          structure: {
            kind: "ENDURANCE",
            version: 1,
            blocks: nextParsedPlan,
          },
        };
      } else if (mode === "manual" && structureKind === "STRENGTH") {
        if (strengthStructure.exercises.length === 0) {
          setError(t("errors.definition.exerciseRequired"));
          return;
        }
        if (
          strengthStructure.exercises.some((exercise) => !exercise.name.trim())
        ) {
          setError(t("errors.definition.exerciseNameRequired"));
          return;
        }
        if (
          strengthStructure.exercises.some(
            (exercise) => exercise.setGroups.length === 0,
          )
        ) {
          setError(t("errors.definition.setGroupRequired"));
          return;
        }
        if (
          strengthStructure.exercises.some(
            (exercise) =>
              !exercise.setGroups.some((group) => group.setType === "WORK"),
          )
        ) {
          setError(t("errors.definition.workSetRequired"));
          return;
        }
        input = {
          kind: "STRENGTH",
          version: 1,
          source: "STRUCTURE",
          structure: strengthStructure,
        };
      } else {
        if (!raw.trim()) {
          setError(t("errors.rules"));
          return;
        }
        input = {
          kind: structureKind,
          version: 1,
          source: "TEXT",
          text: raw,
        };
      }

      const resolved = await parseWorkoutDefinition(input);
      const nextParsedPlan =
        resolved.structure.kind === "ENDURANCE"
          ? (resolved.structure.blocks as ParsedPlan)
          : null;
      setRaw(resolved.text);
      setParsedPlan(nextParsedPlan);
      setWorkoutSummary(resolved.summary);
      if (resolved.structure.kind === "ENDURANCE") {
        setStructure(structureModulesFromBlocks(nextParsedPlan, sportType));
      } else if (resolved.structure.kind === "STRENGTH") {
        setStrengthStructure(resolved.structure);
      }

      await onSave({
        text: resolved.text,
        notes,
        sportType,
        sportDefinitionCode,
        blocks: nextParsedPlan,
        structureKind: resolved.kind,
        structure: resolved.structure,
        summary: resolved.summary,
        definition: {
          kind: resolved.kind,
          version: 1,
          source: "STRUCTURE",
          structure: resolved.structure,
        },
        name: name.trim() || null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(getDefinitionErrorMessage(err, "errors.saveFailed"));
    } finally {
      setValidating(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    try {
      await onDelete();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.saveFailed"));
    }
  };

  const handleParsed = (result: { block: ParsedPlan; plan: string }) => {
    setError(null);
    setParsedPlan(result.block);
    setStructure(structureModulesFromBlocks(result.block, sportType));
    setRaw(result.plan);
    setMode("rules");
  };

  const handleSportDefinitionChange = (code: string) => {
    const definition = manualSportCatalog.find((sport) => sport.code === code);
    if (!definition) return;
    const nextSportType = definition.family;
    const nextStructureKind = getPlanningWorkoutStructureKind(definition);
    setSportDefinitionCode(code);
    setSportType(definition.family);
    if (nextStructureKind !== structureKind) {
      setStructureKind(nextStructureKind);
      setWorkoutSummary(null);
      if (nextStructureKind === "STRENGTH") {
        setStrengthStructure(createDefaultStrengthWorkout());
        setParsedPlan(null);
        setStructure([]);
        setRaw("");
      } else {
        const nextPlan = [
          { type: "work", steps: [{ duration: 45 * 60 }] },
        ] as ParsedPlan;
        setParsedPlan(nextPlan);
        setStructure(structureModulesFromBlocks(nextPlan, nextSportType));
        setRaw(stringifyParsedPlan(nextPlan, { sportType: nextSportType }));
      }
      return;
    }
    setStructure(structureModulesFromBlocks(parsedPlan, nextSportType));
    if (parsedPlan) {
      setRaw(
        stringifyParsedPlan(parsedPlan, {
          sportType: nextSportType,
        }),
      );
    }
  };

  const handleStructureKindChange = (nextKind: WorkoutStructureKind) => {
    if (nextKind === structureKind) return;
    setStructureKind(nextKind);
    setWorkoutSummary(null);
    if (nextKind === "STRENGTH") {
      setSportType("UNKNOWN");
      setSportDefinitionCode("STRENGTH_TRAINING");
      setStrengthStructure(createDefaultStrengthWorkout());
      setParsedPlan(null);
      setStructure([]);
      setRaw("");
      return;
    }

    const nextSportType = sportType === "UNKNOWN" ? "RUN" : sportType;
    const nextStructure = createDefaultMobileEnduranceStructure();
    const nextPlan = structureModulesToBlocks(nextStructure, nextSportType);
    setSportType(nextSportType);
    setSportDefinitionCode(
      sportDefinitionCode === "STRENGTH_TRAINING"
        ? "ROAD_RUNNING"
        : sportDefinitionCode,
    );
    setParsedPlan(nextPlan);
    setStructure(nextStructure);
    setRaw(stringifyParsedPlan(nextPlan, { sportType: nextSportType }));
  };

  const handleMobileSportChange = (
    nextSportType: Exclude<PlanSportType, "UNKNOWN">,
  ) => {
    const nextCode =
      nextSportType === "CYCLING"
        ? "ROAD_CYCLING"
        : nextSportType === "SWIM"
          ? "POOL_SWIMMING"
          : nextSportType === "STRETCHING"
            ? "STRETCHING"
            : "ROAD_RUNNING";
    setSportType(nextSportType);
    setSportDefinitionCode(nextCode);
    setStructure(structureModulesFromBlocks(parsedPlan, nextSportType));
    if (parsedPlan) {
      setRaw(stringifyParsedPlan(parsedPlan, { sportType: nextSportType }));
    }
  };

  const handleStructureChange = (nextStructure: WorkoutStructureModule[]) => {
    setError(null);
    setStructure(nextStructure);
    const nextPlan = structureModulesToBlocks(
      nextStructure,
      sportType,
      zoneResolution,
    );
    setParsedPlan(nextPlan);
    setRaw(
      stringifyParsedPlan(nextPlan, {
        sportType,
      }),
    );
  };

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      <AdaptiveDialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        mobileClassName={cn(
          "h-[96dvh] max-h-[96dvh] rounded-t-overlay border-0",
          mobilePlanLayout ? "bg-muted" : "bg-background",
        )}
        desktopClassName="h-[min(90vh,760px)] max-h-[90vh] w-[min(92vw,900px)] max-w-none sm:max-w-none"
      >
        <AdaptiveDialogDescription className="sr-only">
          {mobileScheduleLabel ?? title}
        </AdaptiveDialogDescription>
        {mobilePlanLayout ? (
          <div className="shrink-0 px-4 pb-4 pt-2 pc:hidden">
            <AdaptiveDialogHeader className="grid min-h-11 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-0 p-0 text-center">
              <button
                type="button"
                aria-label={t("buttons.close")}
                onClick={() => onOpenChange(false)}
                className="grid size-11 place-items-center rounded-full text-emerald-600 active:bg-black/5 dark:text-emerald-400 dark:active:bg-white/10"
              >
                <ChevronLeft className="size-5" />
              </button>
              <AdaptiveDialogTitle className="truncate text-center text-[17px] font-semibold leading-6">
                {mobileTitle ?? title}
              </AdaptiveDialogTitle>
              {readOnly ? (
                <button
                  type="button"
                  aria-label={t("buttons.close")}
                  onClick={() => onOpenChange(false)}
                  className="grid size-11 place-items-center rounded-full text-muted-foreground active:bg-black/5 dark:active:bg-white/10"
                >
                  <X className="size-[18px]" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={saveLabel ?? t("buttons.saveDraft")}
                  onClick={() => void handleSave()}
                  disabled={validating}
                  className="grid size-11 place-items-center rounded-full text-emerald-600 active:bg-black/5 disabled:opacity-40 dark:text-emerald-400 dark:active:bg-white/10"
                >
                  <Check className="size-5" />
                </button>
              )}
            </AdaptiveDialogHeader>
          </div>
        ) : null}

        <div
          className={cn(
            "shrink-0 space-y-3 border-b border-border/60 px-4 pb-4 pt-2 pc:space-y-2 pc:px-4 pc:pb-3 pc:pt-4",
            mobilePlanLayout && "hidden pc:block",
          )}
        >
          <AdaptiveDialogHeader className="space-y-0 text-left">
            <AdaptiveDialogTitle className="text-base leading-snug">
              {title}
            </AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
          {headerExtra}
          <div className="flex flex-wrap items-center gap-3">
            {showNameField ? (
              <div className="min-w-[180px] flex-1 space-y-1">
                <div className="text-sm font-medium">
                  {t("fields.name.label")}
                </div>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("fields.name.placeholder")}
                  disabled={readOnly}
                />
              </div>
            ) : null}
            <div className="w-full space-y-1 pc:w-auto">
              <div className="text-sm font-medium">
                {t("fields.sportType.label")}
              </div>
              {readOnly ? (
                <div className="text-sm text-muted-foreground">
                  {selectedSportDefinition
                    ? getLocalizedSportDefinitionName(
                        selectedSportDefinition,
                        tSports,
                      )
                    : sportDefinitionCode}
                </div>
              ) : (
                <Select
                  value={sportDefinitionCode}
                  onValueChange={handleSportDefinitionChange}
                >
                  <SelectTrigger
                    className="h-11 w-full rounded-lg bg-background pc:h-9 pc:w-52"
                    disabled={readOnly}
                  >
                    <SelectValue
                      placeholder={t("fields.sportType.placeholder")}
                    >
                      {selectedSportDefinition
                        ? getLocalizedSportDefinitionName(
                            selectedSportDefinition,
                            tSports,
                          )
                        : sportDefinitionCode}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sportGroups.map(([family, sports], groupIndex) => (
                      <React.Fragment key={family}>
                        {groupIndex > 0 ? <SelectSeparator /> : null}
                        <SelectGroup>
                          <SelectLabel>
                            {getLocalizedSportFamilyName(family, tSports)}
                          </SelectLabel>
                          {sports.map((sport) => (
                            <SelectItem
                              key={sport.code}
                              value={sport.code}
                              disabled={!canCreateStructuredWorkout(sport)}
                            >
                              {getLocalizedSportDefinitionName(sport, tSports)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {mobilePlanLayout ? (
          <div
            data-testid="mobile-plan-workout-editor"
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-8 pc:hidden"
          >
            <div className="space-y-5">
              <section className="space-y-2">
                <div className="px-1 text-[13px] font-medium text-muted-foreground">
                  {t("mobile.workoutType")}
                </div>
                <div className="grid grid-cols-2 rounded-control-lg bg-background/40 p-0.5 dark:bg-white/10">
                  {(["STRENGTH", "ENDURANCE"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      data-testid={`mobile-workout-kind-${kind.toLowerCase()}`}
                      aria-pressed={structureKind === kind}
                      onClick={() => handleStructureKindChange(kind)}
                      disabled={readOnly}
                      className={cn(
                        "h-[38px] rounded-lg px-3 text-sm font-semibold transition-colors",
                        structureKind === kind
                          ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                          : "text-foreground",
                      )}
                    >
                      {kind === "STRENGTH"
                        ? t("mobile.strength")
                        : t("mobile.endurance")}
                    </button>
                  ))}
                </div>
              </section>

              {mobileScheduleLabel ? (
                <section
                  data-testid="mobile-workout-schedule"
                  className="flex min-h-[52px] items-center gap-3 rounded-control-lg bg-background px-4 py-2 dark:bg-zinc-900"
                >
                  <div className="shrink-0 text-[16px] text-foreground">
                    {t("mobile.scheduledAt")}
                  </div>
                  <div
                    className="min-w-0 flex-1 truncate text-right text-[15px] font-semibold text-foreground"
                    title={mobileScheduleLabel}
                  >
                    {mobileScheduleLabel}
                  </div>
                </section>
              ) : null}

              <section className="space-y-1.5">
                <label
                  htmlFor="mobile-plan-workout-name"
                  className="block px-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground"
                >
                  {t("fields.name.label")}
                </label>
                <Input
                  id="mobile-plan-workout-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("fields.name.placeholder")}
                  disabled={readOnly}
                  className="h-[52px] rounded-lg border-0 bg-background px-4 text-base shadow-none focus-visible:ring-0 dark:bg-zinc-900"
                />
              </section>

              <section className="space-y-1.5">
                <label
                  htmlFor="mobile-plan-workout-notes"
                  className="block px-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground"
                >
                  {t("fields.notes.label")}
                </label>
                <Textarea
                  id="mobile-plan-workout-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t("fields.notes.placeholder")}
                  readOnly={readOnly}
                  disabled={readOnly}
                  className="min-h-24 resize-none rounded-lg border-0 bg-background px-4 py-3 text-base leading-6 shadow-none focus-visible:ring-0 dark:bg-zinc-900"
                />
              </section>

              {structureKind === "STRENGTH" ? (
                <StrengthWorkoutBuilder
                  value={strengthStructure}
                  readOnly={readOnly}
                  onChange={(next) => {
                    setError(null);
                    setStrengthStructure(next);
                    setWorkoutSummary(null);
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <section className="rounded-surface bg-background px-4 py-3 dark:bg-zinc-900">
                    <div className="text-[13px] font-medium text-muted-foreground">
                      {t("mobile.sport")}
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      {(["RUN", "CYCLING", "SWIM", "STRETCHING"] as const).map(
                        (option) => (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={sportType === option}
                            onClick={() => handleMobileSportChange(option)}
                            disabled={readOnly}
                            className={cn(
                              "min-h-[42px] rounded-compact px-3 text-[15px] font-medium",
                              sportType === option
                                ? "bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300"
                                : "bg-neutral-100 text-foreground dark:bg-zinc-800",
                            )}
                          >
                            {tSports(`families.${option}`)}
                          </button>
                        ),
                      )}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="px-1 text-[13px] font-medium text-muted-foreground">
                      {t("mobile.editMode")}
                    </div>
                    <div className="grid grid-cols-2 rounded-control-lg bg-background/40 p-0.5 dark:bg-white/10">
                      {(["manual", "rules"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          data-testid={`mobile-workout-mode-${option}`}
                          aria-pressed={mode === option}
                          onClick={() => setMode(option)}
                          disabled={readOnly}
                          className={cn(
                            "h-[38px] rounded-lg px-3 text-sm font-semibold transition-colors",
                            mode === option
                              ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                              : "text-foreground",
                          )}
                        >
                          {option === "manual"
                            ? t("mobile.manualMode")
                            : t("mobile.dslMode")}
                        </button>
                      ))}
                    </div>
                  </section>

                  {mode === "manual" ? (
                    <StructuredWorkoutBuilder
                      value={structure}
                      sportType={sportType}
                      readOnly={readOnly}
                      onChange={handleStructureChange}
                    />
                  ) : (
                    <section
                      data-testid="mobile-workout-dsl-editor"
                      className="overflow-hidden rounded-surface bg-background dark:bg-zinc-900"
                    >
                      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-compact bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          <Braces className="size-[17px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[16px] font-semibold text-foreground">
                            {t("mobile.dslMode")}
                          </div>
                          <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
                            {t("mobile.dslHint")}
                          </p>
                        </div>
                      </div>
                      <div className="mx-3 mb-3 overflow-hidden rounded-lg bg-neutral-100 dark:bg-zinc-800">
                        <Textarea
                          aria-label={t("fields.rules.label")}
                          value={raw}
                          onChange={(event) => setRaw(event.target.value)}
                          placeholder={t("mobile.dslPlaceholder")}
                          readOnly={readOnly}
                          disabled={readOnly}
                          spellCheck={false}
                          autoCapitalize="none"
                          autoCorrect="off"
                          className="min-h-48 resize-none rounded-none border-0 bg-transparent px-4 py-3 font-mono text-[14px] leading-6 shadow-none placeholder:font-mono focus-visible:ring-0 dark:bg-transparent"
                        />
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto pc:grid pc:grid-cols-5 pc:items-stretch pc:overflow-hidden",
            mobilePlanLayout && "hidden pc:grid",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-col gap-0 px-4 py-4 pc:col-span-2 pc:h-full pc:border-r pc:border-border/60 pc:px-4 pc:py-3">
            <div className="shrink-0 space-y-2">
              <div className="text-sm font-medium">
                {t("fields.notes.label")}
              </div>
              <div className="h-28 overflow-hidden rounded-control-lg bg-neutral-100 dark:bg-muted/45 pc:h-32 pc:border pc:border-border/60 pc:bg-background pc:dark:bg-background">
                <Textarea
                  value={notes}
                  onChange={(e) => {
                    if (readOnly) return;
                    setNotes(e.target.value);
                  }}
                  placeholder={t("fields.notes.placeholder")}
                  className="h-full min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-sm focus-visible:ring-0"
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div className="mt-2.5 flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* 运动种类：{structureKind} */}
              <div
                data-testid="workout-editor-preview"
                className={cn(
                  "max-h-48 min-h-32 flex-1 rounded-control-lg bg-neutral-100 p-2 dark:bg-muted/45 pc:max-h-none pc:border pc:border-border/60",
                  structureKind === "STRENGTH"
                    ? "overflow-y-auto"
                    : "overflow-hidden",
                )}
              >
                {structureKind === "STRENGTH" ? (
                  <WorkoutRenderer
                    workout={{
                      structureKind,
                      structure: strengthStructure,
                      summary:
                        workoutSummary?.kind === "STRENGTH"
                          ? workoutSummary
                          : undefined,
                      blocks: null,
                      text: raw,
                      sportType,
                    }}
                    density="CARD"
                  />
                ) : (
                  <WorkoutPlanChart
                    plan={parsedPlan}
                    sportType={sportType}
                    fillHeight
                    compact
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex min-h-[52dvh] min-w-0 flex-col overflow-hidden border-t border-border/60 pc:col-span-3 pc:h-full pc:min-h-0 pc:border-t-0">
            <Tabs
              value={mode}
              onValueChange={(value) => setMode(value as "rules" | "manual")}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="shrink-0 border-b border-border/50 bg-muted/30 px-3 py-2 dark:bg-muted/20">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="rules">{t("tabs.rules")}</TabsTrigger>
                  <TabsTrigger value="manual">{t("tabs.manual")}</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="rules"
                className="mt-0 flex min-h-[44dvh] flex-1 flex-col overflow-hidden px-4 pb-4 pt-3 pc:min-h-0"
              >
                <div className="mb-2 shrink-0 text-sm font-medium">
                  {t("fields.rules.label")}
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-control-lg bg-neutral-100 dark:bg-muted/45">
                  <Textarea
                    value={raw}
                    onChange={(e) => {
                      if (readOnly) return;
                      setRaw(e.target.value);
                    }}
                    placeholder={t("fields.rules.placeholder")}
                    className="box-border h-full min-h-0 w-full flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50 md:text-sm"
                    readOnly={readOnly}
                    disabled={readOnly}
                  />
                </div>
              </TabsContent>
              <TabsContent
                value="manual"
                className="mt-0 flex min-h-[44dvh] flex-1 flex-col overflow-hidden px-4 pb-4 pt-3 pc:min-h-0"
              >
                <div className="mb-2 shrink-0 text-sm font-medium">
                  {t("manual.title")}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden rounded-control-lg bg-neutral-100 dark:bg-muted/45 pc:border pc:border-border/60">
                  <div className="h-full max-h-full overflow-y-auto overscroll-contain p-2 pr-1">
                    {structureKind === "STRENGTH" ? (
                      <StrengthWorkoutBuilder
                        value={strengthStructure}
                        readOnly={readOnly}
                        onChange={(next) => {
                          setError(null);
                          setStrengthStructure(next);
                          setWorkoutSummary(null);
                        }}
                      />
                    ) : (
                      <StructuredWorkoutBuilder
                        value={structure}
                        sportType={sportType}
                        readOnly={readOnly}
                        onChange={handleStructureChange}
                      />
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="shrink-0 border-t border-border/60 bg-destructive/5 px-5 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <AdaptiveDialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-4 py-3 pc:px-4 pc:py-2.5">
          <Button
            size={readOnly ? "touch-sm" : "sm"}
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={
              readOnly ? "w-full pc:w-auto" : DESKTOP_FOOTER_BUTTON_LAYOUT_CLASS
            }
          >
            {t("buttons.close")}
          </Button>
          {!readOnly ? (
            <>
              {showDelete && onDelete ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canDelete}
                      className={DESKTOP_FOOTER_BUTTON_LAYOUT_CLASS}
                    >
                      {t("buttons.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("confirmDelete.title")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("confirmDelete.description")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("confirmDelete.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>
                        {t("buttons.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              {structureKind === "ENDURANCE" ? (
                <div className="hidden pc:block">
                  <WorkoutUploadButton
                    size="sm"
                    onParsed={handleParsed}
                    onError={(msg) => setError(msg)}
                    label={t("buttons.uploadFit")}
                  />
                </div>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  setValidating(true);
                  setError(null);
                  try {
                    const resolved = await parseWorkoutDefinition({
                      kind: structureKind,
                      version: 1,
                      source: "TEXT",
                      text: raw,
                    });
                    setRaw(resolved.text);
                    setWorkoutSummary(resolved.summary);
                    if (resolved.structure.kind === "ENDURANCE") {
                      const parsed = resolved.structure.blocks as ParsedPlan;
                      setParsedPlan(parsed);
                      setStructure(
                        structureModulesFromBlocks(parsed, sportType),
                      );
                    } else if (resolved.structure.kind === "STRENGTH") {
                      setParsedPlan(null);
                      setStrengthStructure(resolved.structure);
                    }
                  } catch (err: unknown) {
                    setParsedPlan(null);
                    setError(
                      getDefinitionErrorMessage(err, "errors.parseFailed"),
                    );
                  } finally {
                    setValidating(false);
                  }
                }}
                disabled={validating || !raw.trim()}
                className={DESKTOP_FOOTER_BUTTON_LAYOUT_CLASS}
              >
                {validating ? t("buttons.validating") : t("buttons.validate")}
              </Button>
              <Button
                size="touch-sm"
                onClick={handleSave}
                disabled={validating}
                className="w-full pc:w-auto"
              >
                {saveLabel ?? t("buttons.saveDraft")}
              </Button>
            </>
          ) : null}
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
