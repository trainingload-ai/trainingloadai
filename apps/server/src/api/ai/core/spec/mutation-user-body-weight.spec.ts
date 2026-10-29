import { CoachActionRiskTier, CoachActionType } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { validateAiToolInput, type AiToolContext } from '../tool.types';
import {
  normalizeCoachWeightKg,
  userBodyWeightMutationBundle,
  userBodyWeightMutationTool,
} from '../tools/mutationUserBodyWeight.tool';

function context(overrides: Partial<AiToolContext> = {}) {
  const tx = {};
  const userService = {
    getPreferredTimezone: jest.fn(async () => 'Asia/Shanghai'),
    recordManualWeight: jest.fn(async () => ({
      id: 'weight-1',
      operation: 'create' as const,
      changed: true,
      previousValue: null,
      previousEffectiveAt: null,
      weightKg: 72.4,
    })),
  };
  const coachActions = {
    run: jest.fn(async (input: any) => {
      const result = await input.exec(tx);
      return {
        actionId: 'action-1',
        type: input.type,
        riskTier: input.riskTier,
        summary: result.summary,
        undoUntil: new Date('2026-10-13T05:00:30.000Z'),
        payloadForUi: result.payloadForUi,
        createdAt: new Date('2026-10-13T05:00:00.000Z'),
      };
    }),
  };
  const ctx = {
    session: { user: { id: 'athlete-1' } },
    userService,
    coachActions,
    currentTurnStartedAt: new Date('2026-10-13T04:00:00.000Z'),
    currentUserPrompt: '测试输入同时明确列出 72.4 kg 和 160 lb。',
    currentToolCallId: 'tool-call-1',
    sid: 'session-1',
    lang: 'zh',
    i18n: {
      t: jest.fn((key: string, options?: { args?: Record<string, unknown> }) =>
        key.endsWith('.summary')
          ? `已记录 ${options?.args?.effectiveDate} 的体重：${options?.args?.weightKg} kg。`
          : key.endsWith('.unchanged')
            ? '体重没有变化。'
            : key,
      ),
    },
    signal: new AbortController().signal,
    ...overrides,
  } as unknown as AiToolContext;
  return { ctx, tx, userService, coachActions };
}

describe('mutation_user_body_weight', () => {
  it('converts pounds using the canonical kg value', () => {
    expect(normalizeCoachWeightKg(160, 'lb')).toBe(72.575);
    expect(normalizeCoachWeightKg(72.4567, 'kg')).toBe(72.457);
  });

  it.each([
    [{ value: 0, unit: 'kg' }, 'INVALID_INPUT'],
    [{ value: 900, unit: 'lb' }, 'INVALID_INPUT'],
    [{ value: 72.4 }, 'INVALID_INPUT'],
    [{ value: 72.4, unit: 'kg', effectiveDate: '2026-02-30' }, 'INVALID_INPUT'],
    [{ value: 72.4, unit: 'kg', effectiveDate: '2026-10-14' }, 'INVALID_INPUT'],
  ])('rejects invalid or unsafe input %#', async (input, code) => {
    const result = await validateAiToolInput(
      userBodyWeightMutationTool,
      context().ctx,
      input as never,
    );
    expect(result).toMatchObject({ ok: false, code });
  });

  it('rejects a model-inferred unit when the current user message omitted it', async () => {
    const fixture = context();
    fixture.ctx.currentUserPrompt = '请记录我今天的体重为 72.4。';
    await expect(
      validateAiToolInput(userBodyWeightMutationTool, fixture.ctx, {
        value: 72.4,
        unit: 'kg',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'MISSING_UNIT_EVIDENCE',
    });
  });

  it('rejects a unit that contradicts the explicit user message', async () => {
    const fixture = context();
    fixture.ctx.currentUserPrompt = 'Today I weigh 160 lb.';
    await expect(
      validateAiToolInput(userBodyWeightMutationTool, fixture.ctx, {
        value: 160,
        unit: 'kg',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'MISSING_UNIT_EVIDENCE',
    });
  });

  it('writes today at the athlete-local midnight through the audited transaction', async () => {
    const fixture = context();
    await expect(
      userBodyWeightMutationTool.execute(fixture.ctx, {
        value: 72.4,
        unit: 'kg',
      }),
    ).resolves.toMatchObject({
      kind: 'mutation_applied',
      actionId: 'action-1',
      type: CoachActionType.USER_BODY_METRIC_UPDATE,
      riskTier: CoachActionRiskTier.LOW,
      payload: {
        valueKg: 72.4,
        effectiveDate: '2026-10-13',
        changed: true,
      },
    });
    expect(fixture.userService.recordManualWeight).toHaveBeenCalledWith({
      userId: 'athlete-1',
      weightKg: 72.4,
      effectiveAt: new Date('2026-10-12T16:00:00.000Z'),
      dayStart: new Date('2026-10-12T16:00:00.000Z'),
      dayEnd: new Date('2026-10-13T16:00:00.000Z'),
      tx: fixture.tx,
    });
    expect(fixture.coachActions.run).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'athlete-1',
        type: CoachActionType.USER_BODY_METRIC_UPDATE,
        riskTier: CoachActionRiskTier.LOW,
        messageId: 'tool-call-1',
        sid: 'session-1',
      }),
    );
  });

  it('undoes only the owned record and restores an updated row', async () => {
    const update = jest.fn(async () => ({}));
    const prisma = {
      userBodyMetric: {
        findFirst: jest.fn(async () => ({
          id: 'weight-1',
          value: '72.4',
          effectiveDate: new Date('2026-10-12T16:00:00.000Z'),
        })),
        delete: jest.fn(async () => ({})),
        update,
      },
    };
    await userBodyWeightMutationBundle.undoHandler({
      prisma: prisma as never,
      users: {
        bodyMetrics: () => prisma.userBodyMetric,
      } as never,
      userId: 'athlete-1',
      reverseData: {
        metricId: 'weight-1',
        operation: 'update',
        previousValue: '73.2',
        previousEffectiveAt: '2026-10-12T16:00:00.000Z',
        writtenValue: '72.4',
        writtenEffectiveAt: '2026-10-12T16:00:00.000Z',
      },
    });
    expect(prisma.userBodyMetric.findFirst).toHaveBeenCalledWith({
      where: { id: 'weight-1', userId: 'athlete-1' },
      select: { id: true, value: true, effectiveDate: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'weight-1' },
      data: {
        value: '73.2',
        effectiveDate: new Date('2026-10-12T16:00:00.000Z'),
      },
    });
  });

  it('refuses a stale undo after a newer weight change', async () => {
    const update = jest.fn(async () => ({}));
    const remove = jest.fn(async () => ({}));
    const prisma = {
      userBodyMetric: {
        findFirst: jest.fn(async () => ({
          id: 'weight-1',
          value: '74',
          effectiveDate: new Date('2026-10-12T16:00:00.000Z'),
        })),
        delete: remove,
        update,
      },
    };

    await expect(
      userBodyWeightMutationBundle.undoHandler({
        prisma: prisma as never,
        users: {
          bodyMetrics: () => prisma.userBodyMetric,
        } as never,
        userId: 'athlete-1',
        reverseData: {
          metricId: 'weight-1',
          operation: 'update',
          previousValue: '72.4',
          previousEffectiveAt: '2026-10-12T16:00:00.000Z',
          writtenValue: '73.1',
          writtenEffectiveAt: '2026-10-12T16:00:00.000Z',
        },
      }),
    ).rejects.toThrow('refusing stale undo');
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
