import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type PlanTemplatePreview } from '@prisma/client';
import {
  RUN_PLAN_TEMPLATES,
  buildPlanTemplateDraft,
  chooseFirst5kVariant,
  getPlanTemplateCoachFlow,
  getPlanTemplateIntensityGuidance,
  getPlanTemplateVariant,
  getRunPlanTemplate,
  normalizePlanTemplateLocale,
  publicExampleCapability,
  resolvePlanTemplateWorkoutDefinitions,
  resolveRunningWorkoutIntensity,
  type PlanTemplateDefinition,
  type PlanTemplatePlanDraft,
  type PlanTemplateVariant,
  type RunPlanTemplateGoal,
} from '@shared/plan-templates';
import { RunningPlanBaselineQueryService } from '@/api/activity/running-plan-baseline-query.service';
import { PlanLifecycleService } from '@/api/plan/application/plan-lifecycle.service';
import type { CreatePlanDto } from '@/api/plan/dto/create-plan.dto';
import type { WorkoutDefinitionInput } from '@shared/workout-structure';
import { PrismaService } from '@/prisma/prisma.service';
import type { CreatePlanTemplatePreviewDto } from './dto/create-plan-template-preview.dto';
import { RunningPlanCapabilityService } from './running-plan-capability.service';
import { PlanTemplatePreviewRepository } from './persistence/plan-template-preview.repository';

const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,100}$/;

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function assertToken(token: string) {
  if (!TOKEN_PATTERN.test(token))
    throw new NotFoundException('Plan template preview not found');
}

function assertRealDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('startDate must be a real YYYY-MM-DD date');
  }
}

function normalizeGoal(value: unknown): RunPlanTemplateGoal | null | undefined {
  if (value == null || String(value).trim() === '') return null;
  const goal = String(value).trim().toUpperCase();
  if (
    goal === '5K' ||
    goal === '10K' ||
    goal === 'HALF_MARATHON' ||
    goal === 'MARATHON'
  )
    return goal;
  return undefined;
}

@Injectable()
export class PlanTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanLifecycleService,
    private readonly runningBaseline: RunningPlanBaselineQueryService,
    private readonly capabilityResolver: RunningPlanCapabilityService,
    private readonly previews: PlanTemplatePreviewRepository,
  ) {}

  listPublic(localeInput?: unknown, goalInput?: unknown) {
    const locale = normalizePlanTemplateLocale(localeInput);
    const goal = normalizeGoal(goalInput);
    return {
      templates: (goal === undefined
        ? []
        : RUN_PLAN_TEMPLATES.filter(
            (template) => goal === null || template.goal === goal,
          )
      ).map((template) => {
        const variant = this.publicVariant(template);
        return {
          key: template.key,
          version: template.version,
          slug: template.slug,
          goal: template.goal,
          outcome: template.outcome ?? null,
          methodId: template.methodId ?? null,
          copyVersion: template.copyVersion ?? template.version,
          publicExample: template.publicExample ?? null,
          capabilityRequirements: template.capabilityRequirements ?? [],
          intensityMode: template.publicExample
            ? 'PACE_RANGE_WITH_RPE_FALLBACK'
            : 'RPE_WITH_OPTIONAL_PERSONAL_PACE',
          contentHash: template.contentHash,
          title: template.copy[locale].title,
          description: template.copy[locale].description,
          eligibility: template.copy[locale].eligibility,
          promise: template.copy[locale].promise,
          periodWeeks: variant.periodWeeks,
          trainingDaysPerWeek: variant.trainingDaysPerWeek,
          availableVariants: template.variants.map((item) => ({
            id: item.id,
            periodWeeks: item.periodWeeks,
          })),
        };
      }),
    };
  }

  getPublic(slug: string, localeInput?: unknown) {
    const template = this.requiredTemplate(slug);
    const variant = this.publicVariant(template);
    const example = template.publicExample
      ? new Map(
          variant.workouts.map((workout) => [
            workout.semanticId,
            resolveRunningWorkoutIntensity({
              template,
              workout,
              capability: publicExampleCapability(),
            }).definition,
          ]),
        )
      : undefined;
    return {
      template: this.serializeTemplate(template, variant, localeInput, example),
    };
  }

  async getPersonalized(
    userId: string,
    slug: string,
    localeInput?: unknown,
    variantId?: string,
  ) {
    const template = this.requiredTemplate(slug);
    const baseline = await this.runningBaseline.get(userId);
    const inferredVariant =
      template.key === 'RUN_5K_FIRST'
        ? chooseFirst5kVariant(baseline.longestContinuousRunMinutes)
        : template.publicVariantId;
    const variant = this.requiredVariant(
      template,
      variantId?.trim() || inferredVariant,
    );
    const locale = normalizePlanTemplateLocale(localeInput);
    const capability = template.outcome
      ? await this.capabilityResolver.resolve(userId, baseline)
      : undefined;
    const workoutDefinitions = resolvePlanTemplateWorkoutDefinitions({
      template,
      variant,
      recent5kSeconds: baseline.recent5kSeconds ?? undefined,
      capabilitySnapshot: capability,
    });

    return {
      template: this.serializeTemplate(
        template,
        variant,
        locale,
        workoutDefinitions,
      ),
      capability: capability ?? null,
    };
  }

  async recommend(userId: string, goalInput?: unknown) {
    const normalizedGoal = normalizeGoal(goalInput);
    if (normalizedGoal === undefined) {
      return { recommendation: null, alternatives: [] };
    }
    const goal = normalizedGoal ?? '5K';
    const baseline = await this.runningBaseline.get(userId);
    if (goal !== '5K') {
      const capability = await this.capabilityResolver.resolve(
        userId,
        baseline,
      );
      const templates = RUN_PLAN_TEMPLATES.filter(
        (template) => template.goal === goal,
      );
      const hasRecent5k = Boolean(baseline.recent5kSeconds);
      const hasContinuousBase =
        (baseline.longestContinuousRunMinutes ?? 0) >= 30;
      const options = templates.map((template) => {
        if (!template.outcome) {
          const ready = goal !== '10K' || hasRecent5k || hasContinuousBase;
          return {
            slug: template.slug,
            status: ready
              ? capability.state === 'AVAILABLE'
                ? ('ELIGIBLE' as const)
                : ('ELIGIBLE_RPE_FALLBACK' as const)
              : ('NOT_ELIGIBLE' as const),
            reasonCodes: ready ? [] : ['TEN_K_BASELINE_REQUIRED'],
            missingInputs: [],
            reasonDetails: ready
              ? []
              : [
                  {
                    code: 'TEN_K_BASELINE_REQUIRED',
                    actual: baseline.longestContinuousRunMinutes ?? 0,
                    required: 30,
                    unit: 'minutes' as const,
                  },
                ],
          };
        }
        const evaluated = this.capabilityResolver.evaluate({
          template,
          baseline,
          capability,
        });
        return { slug: template.slug, ...evaluated.eligibility };
      });
      const selected = options.find(
        (option) =>
          option.status === 'ELIGIBLE' ||
          option.status === 'ELIGIBLE_WITH_WARNING' ||
          option.status === 'ELIGIBLE_RPE_FALLBACK',
      );
      return {
        recommendation: selected
          ? {
              slug: selected.slug,
              variantId: 'standard',
              status: selected.status,
            }
          : null,
        baseline,
        capability,
        options,
        alternatives: options.map((option) => option.slug),
      };
    }
    let slug: PlanTemplateDefinition['slug'] = 'first-5k';
    let variantId = chooseFirst5kVariant(baseline.longestContinuousRunMinutes);
    const reasons: string[] = [];
    if (
      baseline.personalizationReadiness === 'adequate' &&
      baseline.recent5kSeconds &&
      baseline.activeDaysPerWeek >= 3.5
    ) {
      slug = 'improve-5k';
      variantId = 'standard';
      reasons.push(
        'Recent 5K evidence and a consistent four-day running baseline are available.',
      );
    } else if ((baseline.longestContinuousRunMinutes ?? 0) >= 20) {
      slug = 'finish-5k';
      variantId = 'standard';
      reasons.push(
        'Recent running supports at least 20 minutes of continuous work.',
      );
    } else if (baseline.personalizationReadiness === 'none') {
      reasons.push(
        'No reliable recent running baseline is available, so the conservative first-5K path is recommended.',
      );
    } else {
      reasons.push(
        'Recent running is present but does not yet support the finish or improve entry criteria.',
      );
    }
    return {
      recommendation: { slug, variantId, reasons },
      baseline,
      alternatives: this.listPublic('en', '5K').templates.map(
        (template) => template.slug,
      ),
    };
  }

  async createPreview(
    userId: string,
    slug: string,
    input: CreatePlanTemplatePreviewDto,
  ) {
    assertRealDate(input.startDate);
    const template = this.requiredTemplate(slug);
    this.assertScheduleInput(
      template,
      input.preferredWeekdays,
      input.longRunWeekday,
    );
    const baseline = await this.runningBaseline.get(userId);
    const inferredVariant =
      template.key === 'RUN_5K_FIRST'
        ? chooseFirst5kVariant(baseline.longestContinuousRunMinutes)
        : template.publicVariantId;
    const variant = this.requiredVariant(
      template,
      input.variantId ?? inferredVariant,
    );
    const locale = normalizePlanTemplateLocale(input.locale);
    const recent5kSeconds = baseline.recent5kSeconds ?? undefined;
    const capability = template.outcome
      ? await this.capabilityResolver.resolve(userId, baseline)
      : undefined;
    let targetRace =
      template.outcome === 'TARGET'
        ? await this.capabilityResolver.resolveGoalRace(
            userId,
            template,
            input.targetRaceEventId,
          )
        : null;
    let effectiveStartDate = input.startDate;
    let eligibility = null;
    if (template.outcome && capability) {
      const evaluated = this.capabilityResolver.evaluate({
        template,
        baseline,
        capability,
        targetRace,
        startDate: input.startDate,
      });
      eligibility = evaluated.eligibility;
      targetRace = evaluated.targetRace;
      if (
        eligibility.status === 'INPUT_REQUIRED' ||
        eligibility.status === 'NOT_ELIGIBLE'
      ) {
        throw new BadRequestException({
          code: eligibility.reasonCodes[0] ?? 'RUNNING_PLAN_INPUT_REQUIRED',
          ...eligibility,
        });
      }
      if (targetRace) {
        effectiveStartDate = this.alignTargetStartDate(
          targetRace.raceDate,
          variant.periodWeeks,
          input.preferredWeekdays,
          input.longRunWeekday,
        );
      } else if (template.scheduleVersion && input.longRunWeekday) {
        effectiveStartDate = this.alignStartAfterLongRunDay(
          input.startDate,
          input.longRunWeekday,
        );
      }
    }
    let draft: PlanTemplatePlanDraft;
    try {
      draft = buildPlanTemplateDraft({
        template,
        variant,
        locale,
        preferredWeekdays: input.preferredWeekdays,
        requestedStartDate: effectiveStartDate,
        recent5kSeconds,
        capabilitySnapshot: capability,
        targetRace,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Invalid template preview input',
      );
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
    const draftHash = createHash('sha256')
      .update(JSON.stringify(draft))
      .digest('hex');
    const normalizedInput = {
      startDate: effectiveStartDate,
      requestedStartDate: input.startDate,
      preferredWeekdays: [...input.preferredWeekdays].sort((a, b) => a - b),
      longRunWeekday: input.longRunWeekday ?? null,
      targetRaceEventId: targetRace?.eventId ?? null,
      recent5kSeconds: recent5kSeconds ?? null,
      capability: capability ?? null,
      eligibility,
      draftHash,
    };
    await this.previews.create({
      data: {
        userId,
        tokenHash: tokenHash(token),
        templateKey: template.key,
        templateVersion: template.version,
        templateContentHash: template.contentHash,
        variantId: variant.id,
        locale,
        normalizedInput: normalizedInput as Prisma.InputJsonValue,
        payload: draft as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });
    const calendar = draft.workouts.map((workout, workoutIndex) => {
      const date = new Date(`${effectiveStartDate}T00:00:00.000Z`);
      date.setUTCDate(
        date.getUTCDate() + (workout.weekIndex - 1) * 7 + workout.dayIndex - 1,
      );
      return {
        workoutIndex,
        weekIndex: workout.weekIndex,
        dayIndex: workout.dayIndex,
        date: date.toISOString().slice(0, 10),
        name: workout.name,
      };
    });
    return {
      previewToken: token,
      expiresAt: expiresAt.toISOString(),
      startDate: effectiveStartDate,
      template: this.serializeTemplate(
        template,
        variant,
        locale,
        new Map(
          variant.workouts.map((workout, index) => [
            workout.semanticId,
            draft.workouts[index]?.definition,
          ]),
        ),
      ),
      draft,
      calendar,
      eligibility,
      capability,
      targetRace,
      draftHash,
    };
  }

  async instantiate(userId: string, slug: string, previewToken: string) {
    assertToken(previewToken);
    const template = this.requiredTemplate(slug);
    const hash = tokenHash(previewToken);
    const existing = await this.previews.findFirst({
      where: { tokenHash: hash, userId },
    });
    if (existing?.createdPlanId) {
      this.assertPreviewMatches(existing, template);
      return {
        ...(await this.plans.getPlanDetail(userId, existing.createdPlanId)),
        reused: true,
      };
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await this.previews.findFirst({
        where: { tokenHash: hash, userId },
      }, tx);
      this.assertPreviewMatches(row, template);
      if (row.createdPlanId) {
        return {
          ...(await this.plans.getPlanDetail(userId, row.createdPlanId, tx)),
          reused: true,
        };
      }
      if (row.expiresAt.getTime() <= Date.now())
        throw new GoneException('Plan template preview has expired');

      const claimedAt = new Date();
      const claimed = await this.previews.updateMany({
        where: {
          id: row.id,
          consumedAt: null,
          createdPlanId: null,
          expiresAt: { gt: claimedAt },
        },
        data: { consumedAt: claimedAt },
      }, tx);
      if (claimed.count !== 1) {
        const current = await this.previews.findUnique({
          where: { id: row.id },
        }, tx);
        if (current?.createdPlanId) {
          return {
            ...(await this.plans.getPlanDetail(
              userId,
              current.createdPlanId,
              tx,
            )),
            reused: true,
          };
        }
        throw new GoneException('Plan template preview is no longer available');
      }

      const payload = row.payload as unknown as PlanTemplatePlanDraft;
      const created = await this.plans.createPlan(
        userId,
        payload as unknown as CreatePlanDto,
        { tx },
      );
      const planId = created.plan.id;
      await this.previews.update({
        where: { id: row.id },
        data: { createdPlanId: planId },
      }, tx);
      return { ...created, reused: false };
    });
  }

  private requiredTemplate(slug: string) {
    const template = getRunPlanTemplate(slug);
    if (!template) throw new NotFoundException('Plan template not found');
    return template;
  }

  private publicVariant(template: PlanTemplateDefinition) {
    return this.requiredVariant(template, template.publicVariantId);
  }

  private requiredVariant(template: PlanTemplateDefinition, variantId: string) {
    const variant = getPlanTemplateVariant(template, variantId);
    if (!variant)
      throw new BadRequestException('Unsupported plan template variant');
    return variant;
  }

  private assertScheduleInput(
    template: PlanTemplateDefinition,
    preferredWeekdays: number[],
    longRunWeekday?: number,
  ) {
    if (new Set(preferredWeekdays).size !== preferredWeekdays.length)
      throw new BadRequestException('PLAN_SCHEDULE_NOT_FEASIBLE');
    if (longRunWeekday && !preferredWeekdays.includes(longRunWeekday))
      throw new BadRequestException('PLAN_SCHEDULE_NOT_FEASIBLE');
    const sorted = [...preferredWeekdays].sort((left, right) => left - right);
    const scheduledWeekdays = longRunWeekday
      ? [
          ...sorted.filter((day) => day > longRunWeekday),
          ...sorted.filter((day) => day <= longRunWeekday),
        ]
      : sorted;
    if (template.scheduleVersion) {
      const variant = this.publicVariant(template);
      for (const week of variant.weeks) {
        const workouts = variant.workouts
          .filter((workout) => workout.weekIndex === week.weekIndex)
          .sort((left, right) => left.slotIndex - right.slotIndex);
        const demandingDays = workouts
          .map((workout) => ({
            workout,
            day: scheduledWeekdays[workout.slotIndex - 1],
          }))
          .filter(({ workout }) => workout.quality)
          .map(({ day }) => day)
          .filter((day): day is number => day != null);
        for (let index = 0; index < demandingDays.length; index += 1) {
          for (
            let other = index + 1;
            other < demandingDays.length;
            other += 1
          ) {
            const gap = Math.abs(demandingDays[index] - demandingDays[other]);
            if (gap === 1 || gap === 6)
              throw new BadRequestException('PLAN_SCHEDULE_NOT_FEASIBLE');
          }
        }
      }
    }
    if (template.key !== 'RUN_10K_FINISH' || sorted.length !== 3) return;
    const gaps = sorted.map((day, index) => {
      const next = sorted[(index + 1) % sorted.length];
      return (index === sorted.length - 1 ? next + 7 : next) - day;
    });
    if (gaps.some((gap) => gap < 2)) {
      throw new BadRequestException(
        'The 10K plan requires at least one recovery day between runs',
      );
    }
  }

  private alignTargetStartDate(
    raceDate: string,
    periodWeeks: number,
    preferredWeekdays: number[],
    longRunWeekday?: number,
  ) {
    const race = new Date(`${raceDate}T00:00:00.000Z`);
    const raceWeekday = race.getUTCDay() || 7;
    if (!preferredWeekdays.includes(raceWeekday))
      throw new BadRequestException('PLAN_SCHEDULE_NOT_FEASIBLE');
    if (longRunWeekday != null && longRunWeekday !== raceWeekday)
      throw new BadRequestException('PLAN_SCHEDULE_NOT_FEASIBLE');
    const start = new Date(race);
    start.setUTCDate(start.getUTCDate() - (periodWeeks * 7 - 1));
    return start.toISOString().slice(0, 10);
  }

  private alignStartAfterLongRunDay(startDate: string, longRunWeekday: number) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const desiredStartWeekday = (longRunWeekday % 7) + 1;
    const currentWeekday = start.getUTCDay() || 7;
    start.setUTCDate(
      start.getUTCDate() + ((desiredStartWeekday - currentWeekday + 7) % 7),
    );
    return start.toISOString().slice(0, 10);
  }

  private serializeTemplate(
    template: PlanTemplateDefinition,
    variant: PlanTemplateVariant,
    localeInput?: unknown,
    personalizedDefinitions?: ReadonlyMap<
      string,
      WorkoutDefinitionInput | undefined
    >,
  ) {
    const locale = normalizePlanTemplateLocale(localeInput);
    return {
      key: template.key,
      version: template.version,
      slug: template.slug,
      goal: template.goal,
      outcome: template.outcome ?? null,
      methodId: template.methodId ?? null,
      copyVersion: template.copyVersion ?? template.version,
      publicExample: template.publicExample ?? null,
      capabilityRequirements: template.capabilityRequirements ?? [],
      intensityMode: template.publicExample
        ? 'PACE_RANGE_WITH_RPE_FALLBACK'
        : 'RPE_WITH_OPTIONAL_PERSONAL_PACE',
      contentHash: template.contentHash,
      variantId: variant.id,
      periodWeeks: variant.periodWeeks,
      trainingDaysPerWeek: variant.trainingDaysPerWeek,
      availableVariants: template.variants.map((item) => ({
        id: item.id,
        periodWeeks: item.periodWeeks,
      })),
      ...template.copy[locale],
      coachFlow: getPlanTemplateCoachFlow(locale),
      weeks: variant.weeks.map((week) => ({
        weekIndex: week.weekIndex,
        phase: week.phase,
        ...week.copy[locale],
        workouts: variant.workouts
          .filter((workout) => workout.weekIndex === week.weekIndex)
          .map((workout) => {
            const workoutDefinition =
              personalizedDefinitions?.get(workout.semanticId) ??
              workout.definition;
            return {
              semanticId: workout.semanticId,
              slotIndex: workout.slotIndex,
              quality: workout.quality,
              intensityKind: workout.intensityKind,
              plannedRpe: workout.plannedRpe,
              plannedRpeRange: workout.plannedRpeRange,
              intensityGuidance: getPlanTemplateIntensityGuidance({
                workout,
                locale,
                definition: workoutDefinition,
              }),
              ...workout.copy[locale],
              definition: workoutDefinition,
            };
          }),
      })),
    };
  }

  private assertPreviewMatches(
    row: PlanTemplatePreview | null,
    template: PlanTemplateDefinition,
  ): asserts row is PlanTemplatePreview {
    if (!row) throw new NotFoundException('Plan template preview not found');
    if (
      row.templateKey !== template.key ||
      row.templateVersion !== template.version ||
      row.templateContentHash !== template.contentHash
    ) {
      throw new GoneException(
        'Plan template preview is stale; create a new preview',
      );
    }
  }
}
