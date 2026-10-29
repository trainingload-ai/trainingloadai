import { healthLocalDayBounds } from '@/health-data/health-local-day';
import {
  MANUAL_WEIGHT_KG_MAX,
  MANUAL_WEIGHT_KG_MIN,
  validateManualWeightKg,
} from '@/api/user/body-metric-validator';
import { CoachActionType, type Prisma } from '@prisma/client';
import { round } from 'lodash';
import { resolveAthleteClock } from '../athlete-relative-day';
import { mutationToolFactory } from '../mutation-tool.factory';
import { METRIC_REVIEW_SKILLS } from '../tool-skill-scopes';
import {
  aiToolError,
  requireSignedInUser,
  type AiToolContext,
} from '../tool.types';

const KG_PER_LB = 0.45359237;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

type WeightUnit = 'kg' | 'lb';

type Input = {
  value: number;
  unit: WeightUnit;
  /** Athlete-local calendar date. Defaults to athlete-local today. */
  effectiveDate?: string;
};

type UiPayload = {
  valueKg: number;
  effectiveDate: string;
  changed: boolean;
};

function promptNamesWeightUnit(
  prompt: string | undefined,
  unit: WeightUnit,
): boolean {
  const text = String(prompt ?? '').trim();
  if (!text) return false;
  if (unit === 'kg') {
    return /(?:\bkg(?:s)?\b|\bkilograms?\b|公斤|千克)/i.test(text);
  }
  return /(?:\blbs?\b|\bpounds?\b|磅)/i.test(text);
}

function strictDateKey(value: string): string | null {
  if (!DATE_KEY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function normalizeCoachWeightKg(
  value: number,
  unit: WeightUnit,
): number {
  return round(unit === 'lb' ? value * KG_PER_LB : value, 3);
}

async function resolveWeightDate(
  ctx: AiToolContext,
  requested?: string,
): Promise<{
  dateKey: string;
  timezone: string;
  today: string;
}> {
  const userId = ctx.session?.user?.id;
  const clock = await resolveAthleteClock({
    userService: ctx.userService,
    userId,
    now: ctx.currentTurnStartedAt,
  });
  const raw = String(requested ?? '').trim();
  const dateKey = raw ? strictDateKey(raw) : clock.athleteLocalToday;
  if (!dateKey) throw new Error('INVALID_EFFECTIVE_DATE');
  return {
    dateKey,
    timezone: clock.timezone,
    today: clock.athleteLocalToday,
  };
}

function translate(
  ctx: AiToolContext,
  key: string,
  args?: Record<string, unknown>,
) {
  const value = ctx.i18n.t(key, { lang: ctx.lang, args });
  return typeof value === 'string' && value !== key ? value : key;
}

/** Save one manual body-weight record (LOW / reversible for 30 seconds). */
export const userBodyWeightMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_user_body_weight',
  aliases: ['user.body_weight_record', 'user.weight_record'],
  description:
    "Record or correct the signed-in athlete's body weight for one athlete-local calendar day. Use only when the athlete explicitly provides a weight and its unit in the current message; the server verifies that evidence, so never infer a missing unit from locale, profile, or prior messages. effectiveDate is YYYY-MM-DD in the athlete timezone; omit it only when the athlete clearly means today.",
  searchHint: 'weight body mass kg lb record profile',
  applicableSkills: [...METRIC_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'unit'],
    properties: {
      value: { type: 'number' },
      unit: { type: 'string', enum: ['kg', 'lb'] },
      effectiveDate: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description:
          'Athlete-local YYYY-MM-DD. Omit only for an explicit today measurement.',
      },
    },
  },
  cost: 'low',
  type: CoachActionType.USER_BODY_METRIC_UPDATE,
  riskTier: 'low',
  validateInput: async (ctx, input) => {
    if (typeof input?.value !== 'number' || !Number.isFinite(input.value)) {
      return aiToolError('value must be a finite number', 'INVALID_INPUT');
    }
    if (input.unit !== 'kg' && input.unit !== 'lb') {
      return aiToolError('unit must be kg or lb', 'MISSING_OR_INVALID_UNIT');
    }
    if (!promptNamesWeightUnit(ctx.currentUserPrompt, input.unit)) {
      return aiToolError(
        'The current user message must explicitly state kg or lb; ask the athlete which unit they mean.',
        'MISSING_UNIT_EVIDENCE',
      );
    }
    const weightKg = normalizeCoachWeightKg(input.value, input.unit);
    const validation = validateManualWeightKg(weightKg);
    if (validation.valid === false) {
      return aiToolError(
        `weight must be between ${MANUAL_WEIGHT_KG_MIN} and ${MANUAL_WEIGHT_KG_MAX} kg`,
        'INVALID_INPUT',
      );
    }
    const requested = String(input.effectiveDate ?? '').trim();
    if (requested && !strictDateKey(requested)) {
      return aiToolError(
        'effectiveDate must be a real YYYY-MM-DD calendar date',
        'INVALID_INPUT',
      );
    }
    const resolved = await resolveWeightDate(ctx, requested);
    if (resolved.dateKey > resolved.today) {
      return aiToolError(
        'effectiveDate cannot be in the future',
        'INVALID_INPUT',
      );
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  async exec(ctx, input, _runtime, tx) {
    const userId = ctx.session!.user!.id;
    const resolved = await resolveWeightDate(ctx, input.effectiveDate);
    const bounds = healthLocalDayBounds(resolved.dateKey, resolved.timezone);
    const weightKg = normalizeCoachWeightKg(input.value, input.unit);
    const result = await ctx.userService.recordManualWeight({
      userId,
      weightKg,
      effectiveAt: bounds.start,
      dayStart: bounds.start,
      dayEnd: bounds.end,
      tx,
    });

    const summary = result.changed
      ? translate(ctx, 'common.aiCoach.mutation.userBodyWeight.summary', {
          effectiveDate: resolved.dateKey,
          weightKg: result.weightKg,
        })
      : translate(ctx, 'common.aiCoach.mutation.userBodyWeight.unchanged', {
          effectiveDate: resolved.dateKey,
          weightKg: result.weightKg,
        });

    return {
      forwardData: {
        providedValue: input.value,
        providedUnit: input.unit,
        weightKg: result.weightKg,
        effectiveDate: resolved.dateKey,
      } as Prisma.InputJsonValue,
      reverseData: {
        metricId: result.id,
        operation: result.operation,
        previousValue: result.previousValue,
        previousEffectiveAt: result.previousEffectiveAt?.toISOString() ?? null,
        writtenValue: String(result.weightKg),
        writtenEffectiveAt: bounds.start.toISOString(),
      } as Prisma.InputJsonValue,
      summary,
      payloadForUi: {
        valueKg: result.weightKg,
        effectiveDate: resolved.dateKey,
        changed: result.changed,
      },
    };
  },
  async undo({ prisma, users, userId, reverseData }) {
    const data = reverseData as {
      metricId: string;
      operation: 'create' | 'update';
      previousValue: string | null;
      previousEffectiveAt: string | null;
      writtenValue: string;
      writtenEffectiveAt: string;
    };
    const row = await users.bodyMetrics(prisma).findFirst({
      where: { id: data.metricId, userId },
      select: { id: true, value: true, effectiveDate: true },
    });
    if (!row) return;
    if (
      String(row.value) !== data.writtenValue ||
      row.effectiveDate.toISOString() !== data.writtenEffectiveAt
    ) {
      throw new Error(
        'Body weight changed after this Coach action; refusing stale undo',
      );
    }
    if (data.operation === 'create') {
      await users.bodyMetrics(prisma).delete({ where: { id: row.id } });
      return;
    }
    if (data.previousValue == null || data.previousEffectiveAt == null) return;
    await users.bodyMetrics(prisma).update({
      where: { id: row.id },
      data: {
        value: data.previousValue,
        effectiveDate: new Date(data.previousEffectiveAt),
      },
    });
  },
});

export const userBodyWeightMutationTool = userBodyWeightMutationBundle.tool;
