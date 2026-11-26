import { generationCoverage } from '@shared/rolling-plan';
import {
  getPlanTemplateCopy,
  getPlanTemplateVariant,
  getRunPlanTemplate,
  normalizePlanTemplateLocale,
} from '@shared/plan-templates/registry';
import type { PlanStatus } from '../plan.constants';
import { defaultSportDefinitionCode } from '@/sports/sport-catalog.types';
import type { EndurancePlanBlock } from '../../../../../../packages/shared/endurance-workout-ir';
import type {
  WorkoutStructure,
  WorkoutStructureKind,
} from '../../../../../../packages/shared/workout-structure';
import type { WorkoutService } from '../../workout/workout.service';
import type { WorkoutDefinitionService } from '../../workout/workout-definition.service';
import type { WorkoutPersistenceService } from '../persistence/workout-persistence.service';

export type PlanWorkoutLinkRow = {
  id: string;
  planId: string | null;
  planWorkoutId: string;
  activityId: number;
  source: string;
  role: string;
  linkedAt: Date;
  unlinkedAt: Date | null;
  actualLoad?: number | null;
  actualLoadSource?: string | null;
  activity?: {
    hashId?: string | null;
    activityName?: string | null;
  } | null;
};

export type PlanWorkoutRowLike = {
  id: string;
  planId: string | null;
  dayOffset?: number | null;
  sessionIndex?: number | null;
  scheduledDate?: Date | string | null;
  revision?: number;
  sportType: string;
  sportDefinitionCode?: string | null;
  name?: string | null;
  text?: string | null;
  notes?: string | null;
  structureKind?: WorkoutStructureKind | string | null;
  dslVersion?: number | null;
  status: string;
  completedAt?: Date | null;
  skippedAt?: Date | null;
  movedFromWorkoutId?: string | null;
  movedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  estimatedLoad?: number | null;
  estimatedLoadSource?: string | null;
  estimatedLoadInputs?: unknown;
  estimatedLoadComputedAt?: Date | null;
  plannedDurationSeconds?: number | null;
  plannedSessionRpe?: number | null;
  steps?: unknown;
  strengthExercises?: unknown;
  links?: PlanWorkoutLinkRow[];
};

export type PlanRowLike = {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  goal?: string | null;
  sourceType: string;
  generationMetadata?: unknown;
  coverageWindow?: { from: Date; through: Date };
  status: PlanStatus | string;
  planningMode?: 'FIXED' | 'ROLLING';
  activationTimezone?: string | null;
  automationPolicies?: Array<{
    revision: number;
    revokedAt: Date | null;
    settings: unknown;
  }>;
  monthStrategies?: Array<{
    monthStart: Date;
    monthEnd: Date;
    effectiveFrom: Date;
    revision: number;
    strategy: unknown;
  }>;
  generatedThrough?: Date | string | null;
  weekGenerations?: Array<{
    weekStart: Date;
    generatedFrom: Date;
    generatedThrough: Date;
  }>;
  periodWeeks?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  activatedAt?: Date | null;
  pausedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  derivedFromShareId?: string | null;
  derivedFromLineageId?: string | null;
  rootLineageId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  workouts?: PlanWorkoutRowLike[];
};

export type PlanRowMapperDeps = {
  workoutService: WorkoutService;
  workoutPersistence: WorkoutPersistenceService;
  workoutDefinitionService: WorkoutDefinitionService;
};

export function planCapabilities(status: PlanStatus | string) {
  return {
    delete: status === 'DRAFT' || status === 'COMPLETED',
  };
}

export function toWeekDay(dayOffset: number) {
  return {
    weekIndex: Math.floor(dayOffset / 7) + 1,
    dayIndex: (dayOffset % 7) + 1,
  };
}

export function normalizePlanDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function clampCurrentIndexes(plan: {
  startDate?: Date | string | null;
  planningMode?: 'FIXED' | 'ROLLING';
  activationTimezone?: string | null;
  periodWeeks?: number | null;
  status?: PlanStatus | string | null;
}) {
  if (
    !plan.startDate ||
    plan.status !== 'ACTIVE' ||
    (plan.planningMode !== 'ROLLING' && !plan.periodWeeks)
  ) {
    return {
      currentWeekIndex: null,
      currentDayIndex: null,
    };
  }

  const today = plan.activationTimezone
    ? new Date(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: plan.activationTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()) + 'T00:00:00Z',
      )
    : new Date();
  const start = new Date(plan.startDate);
  const diffDays = Math.max(
    0,
    Math.floor((today.getTime() - start.getTime()) / 86400000),
  );
  const maxDays = Math.max(1, plan.periodWeeks * 7);
  const bounded =
    plan.planningMode === 'ROLLING'
      ? diffDays
      : Math.min(diffDays, maxDays - 1);
  return {
    currentWeekIndex: Math.floor(bounded / 7) + 1,
    currentDayIndex: (bounded % 7) + 1,
  };
}

export function normalizePlanWorkoutRow(
  row: PlanWorkoutRowLike,
  deps: PlanRowMapperDeps,
) {
  const topLevelSteps = Array.isArray(row.steps) ? row.steps : [];
  const blocks = deps.workoutService.buildPlanBlocksFromWorkoutSteps(
    topLevelSteps,
    row.sportType,
  );
  const structureKind = (row.structureKind ??
    'ENDURANCE') as WorkoutStructureKind;
  const dslVersion = Number(row.dslVersion ?? 1);
  const structure: WorkoutStructure =
    structureKind === 'STRENGTH'
      ? deps.workoutPersistence.buildStrengthStructure(
          row.strengthExercises as Parameters<
            WorkoutPersistenceService['buildStrengthStructure']
          >[0],
          {
            durationSeconds: row.plannedDurationSeconds,
            plannedSessionRpe: row.plannedSessionRpe,
          },
        )
      : structureKind === 'FREEFORM'
        ? {
            kind: 'FREEFORM',
            version: 1,
            text: typeof row.text === 'string' ? row.text : '',
            durationSeconds: row.plannedDurationSeconds ?? null,
          }
        : {
            kind: 'ENDURANCE',
            version: 1,
            blocks: blocks as EndurancePlanBlock[],
          };
  const resolved = deps.workoutDefinitionService.resolve(
    {
      kind: structureKind,
      version: dslVersion as 1,
      source: 'STRUCTURE',
      structure,
    },
    { tolerateStoredInvalid: true },
  );
  const text =
    typeof row.text === 'string' && row.text.trim().length > 0
      ? row.text
      : resolved.text;
  const { weekIndex, dayIndex } = toWeekDay(row.dayOffset ?? 0);

  return {
    id: row.id,
    planId: row.planId,
    weekIndex,
    dayIndex,
    dayOffset: row.dayOffset,
    sessionIndex: row.sessionIndex ?? 1,
    scheduledDate: normalizePlanDate(row.scheduledDate),
    revision: row.revision,
    sportType: row.sportType,
    sportDefinitionCode:
      row.sportDefinitionCode ??
      defaultSportDefinitionCode(
        row.sportType as Parameters<typeof defaultSportDefinitionCode>[0],
      ),
    name: row.name ?? null,
    text,
    notes: row.notes ?? null,
    plannedSessionRpe:
      typeof row.plannedSessionRpe === 'number' ? row.plannedSessionRpe : null,
    structureKind,
    dslVersion,
    structure: resolved.structure,
    summary: resolved.summary,
    status: row.status,
    completedAt: row.completedAt ?? null,
    skippedAt: row.skippedAt ?? null,
    movedFromWorkoutId: row.movedFromWorkoutId ?? null,
    movedBy:
      row.movedBy === 'COACH' || row.movedBy === 'USER' ? row.movedBy : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    estimatedLoad:
      typeof row.estimatedLoad === 'number' ? row.estimatedLoad : null,
    estimatedLoadSource: row.estimatedLoadSource ?? null,
    estimatedLoadInputs: row.estimatedLoadInputs ?? null,
    estimatedLoadComputedAt: row.estimatedLoadComputedAt ?? null,
    blocks: structureKind === 'ENDURANCE' ? blocks : null,
    steps: structureKind === 'ENDURANCE' ? topLevelSteps : null,
    links: Array.isArray(row.links)
      ? row.links.map((link) => ({
          id: link.id,
          planId: link.planId,
          planWorkoutId: link.planWorkoutId,
          activityId: link.activityId,
          source: link.source,
          role: link.role,
          linkedAt: link.linkedAt,
          unlinkedAt: link.unlinkedAt,
          actualLoad:
            typeof link.actualLoad === 'number' ? link.actualLoad : null,
          actualLoadSource: link.actualLoadSource ?? null,
          activity:
            link.activity?.hashId != null
              ? {
                  hashId: link.activity.hashId,
                  title:
                    link.activity.activityName != null
                      ? String(link.activity.activityName)
                      : null,
                }
              : null,
        }))
      : [],
  };
}

export function planDescription(
  plan: Pick<
    PlanRowLike,
    'description' | 'sourceType' | 'generationMetadata' | 'periodWeeks'
  >,
) {
  let description = plan.description ?? null;
  // Older official drafts stored the public template copy, even for a
  // different variant. Leave any description edited by the athlete intact.
  if (plan.sourceType === 'TEMPLATE') {
    const metadata = plan.generationMetadata as {
      planTemplate?: { key?: string; variantId?: string; locale?: string };
    } | null;
    const origin = metadata?.planTemplate;
    const template =
      origin?.key === 'RUN_5K_FIRST' ? getRunPlanTemplate(origin.key) : null;
    const variant =
      template && origin?.variantId
        ? getPlanTemplateVariant(template, origin.variantId)
        : null;
    const locale = normalizePlanTemplateLocale(origin?.locale);
    if (
      template &&
      variant &&
      variant.periodWeeks === plan.periodWeeks &&
      description === template.copy[locale].description
    ) {
      description = getPlanTemplateCopy(template, variant, locale).description;
    }
  }
  return description;
}

export function normalizePlanRow(
  plan: PlanRowLike | null,
  deps: PlanRowMapperDeps,
) {
  if (!plan) return null;
  const current = clampCurrentIndexes(plan);
  return {
    id: plan.id,
    userId: plan.userId,
    title: plan.title,
    description: planDescription(plan),
    goal: plan.goal ?? null,
    sourceType: plan.sourceType,
    generationMetadata: plan.generationMetadata ?? null,
    status: plan.status,
    capabilities: planCapabilities(plan.status),
    planningMode: plan.planningMode ?? 'FIXED',
    automationPolicy: plan.automationPolicies?.[0]
      ? {
          revision: plan.automationPolicies[0].revision,
          enabled: !plan.automationPolicies[0].revokedAt,
          settings: plan.automationPolicies[0].settings,
        }
      : null,
    monthDirections: (plan.monthStrategies ?? []).map((m) => ({
      monthStart: normalizePlanDate(m.monthStart),
      monthEnd: normalizePlanDate(m.monthEnd),
      effectiveFrom: normalizePlanDate(m.effectiveFrom),
      revision: m.revision,
      strategy: m.strategy,
    })),
    generatedThrough: normalizePlanDate(plan.generatedThrough),
    generationCoverage: generationCoverage(
      normalizePlanDate(plan.coverageWindow?.from ?? plan.startDate),
      normalizePlanDate(plan.coverageWindow?.through ?? plan.generatedThrough),
      (plan.weekGenerations ?? []).map((g) => ({
        from: normalizePlanDate(g.generatedFrom)!,
        through: normalizePlanDate(g.generatedThrough)!,
        weekStart: normalizePlanDate(g.weekStart)!,
      })),
    ),
    periodWeeks: plan.periodWeeks,
    startDate: normalizePlanDate(plan.startDate),
    endDate: normalizePlanDate(plan.endDate),
    activatedAt: plan.activatedAt ?? null,
    pausedAt: plan.pausedAt ?? null,
    completedAt: plan.completedAt ?? null,
    cancelledAt: plan.cancelledAt ?? null,
    currentWeekIndex: current.currentWeekIndex,
    currentDayIndex: current.currentDayIndex,
    derivedFromShareId: plan.derivedFromShareId ?? null,
    derivedFromLineageId: plan.derivedFromLineageId ?? null,
    rootLineageId: plan.rootLineageId ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    workouts: Array.isArray(plan.workouts)
      ? plan.workouts.map((workout) => normalizePlanWorkoutRow(workout, deps))
      : [],
  };
}
