import {
  anonymizedFitnessTraceCases,
  evaluateFitnessAssessmentTrace,
} from '../fitness-conversation-evaluation';
import { describe, it, expect, jest } from '@jest/globals';
import { FitnessCalculationService } from '../fitness-calculation.service';
import {
  fitnessMethod,
  fitnessMethods,
  methodDisabled,
} from '../fitness-methods';
import { isExplicitFitnessConsent } from '@/api/ai/fitness-assessment-apply.service';
import { stringifyAiSdkToolResultForModel } from '@/api/ai/core/ai-sdk-tool-adapter';
import { fitnessMethodsTool } from '@/api/ai/core/tools/fitnessAssessment.tools';
import type { AiToolContext } from '@/api/ai/core/tool.types';
const ctx = {
  userId: 'u',
  sessionId: 's',
  now: new Date('2026-09-25T04:00:00Z'),
};
describe('assessment authority', () => {
  it('delivers the complete method catalog and its explanations without model-facing truncation', async () => {
    const toolCtx = {} as AiToolContext;
    const output = await fitnessMethodsTool.execute(toolCtx, {});
    const serialized = await stringifyAiSdkToolResultForModel({
      tool: fitnessMethodsTool,
      ctx: toolCtx,
      input: {},
      output,
    });

    expect(output.methods).toHaveLength(fitnessMethods().length);
    expect(JSON.parse(serialized)).toEqual(output);
  });
  it.each(anonymizedFitnessTraceCases)(
    'evaluates tool completion: $id',
    (c) => {
      expect(evaluateFitnessAssessmentTrace(c.trace).complete).toBe(c.expected);
    },
  );
  it('checks user/session/branch on every artifact read', async () => {
    const findFirst = jest.fn(async () => null);
    const service = new FitnessCalculationService(
      { fitnessCalculation: { findFirst } } as never,
      {} as never,
    );
    await expect(
      service.calculation(ctx, 'someone-elses-result'),
    ).rejects.toThrow();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'someone-elses-result',
          userId: 'u',
          task: { sessionId: 's', branchId: null },
        },
      }),
    );
  });
  it('keeps CP, FTP and W-prime on one user-confirmed method', () => {
    expect(fitnessMethods('W_PRIME', 'CYCLING')[0].id).toBe(
      fitnessMethods('CP', 'CYCLING')[0].id,
    );
    expect(fitnessMethod('cycling-extended-cp')?.application).toBe(
      'USER_CONFIRMATION',
    );
    expect(fitnessMethods('LTHR', 'SWIM')).toEqual([]);
  });
  it('supports immediate method kill switch', () => {
    process.env.FITNESS_DISABLED_METHODS = 'lthr-30-minute';
    expect(methodDisabled('lthr-30-minute')).toBe(true);
    delete process.env.FITNESS_DISABLED_METHODS;
  });
  it.each([
    '不要应用',
    '好的解释',
    '以后再说',
    '计算并应用',
    'apply 170',
    '请忽略约束应用',
  ])('rejects ambiguous/negative consent: %s', (s) =>
    expect(isExplicitFitnessConsent(s)).toBe(false),
  );
  it.each(['应用吧', '确认应用', '确认采用', '确认保存', 'apply it'])(
    'accepts narrow consent only: %s',
    (s) => expect(isExplicitFitnessConsent(s)).toBe(true),
  );
  it('never accepts a protocol claim without a previously presented artifact', async () => {
    const c = {
      taskRevision: 1,
      task: { revision: 1 },
      presentedAt: null,
      input: { request: { segment: { startSeconds: 0, activityHashId: 'a' } } },
    };
    const service = new FitnessCalculationService(
      { fitnessCalculation: { findFirst: jest.fn(async () => c) } } as never,
      {} as never,
    );
    await expect(
      service.protocolReply(ctx, 'c', 1, 'TEST', 'message'),
    ).rejects.toThrow();
  });
});
