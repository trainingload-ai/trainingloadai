import { describe, expect, it } from '@jest/globals';
import { buildCoachSystemPrompt } from '../coach.prompt';
import { TRAINING_EVIDENCE_PROMPT_CONTRACT_LINES } from '../prompt-contracts/training-evidence.contract';
import { getCoachSkillByName } from '../skill.registry';
import { activityByHashIdTool } from '../tools/activityByHashId.tool';
import { compareBlocksTool } from '../tools/compareBlocks.tool';
import { stringifyAiSdkToolResultForModel } from '../ai-sdk-tool-adapter';
import type { AiToolContext } from '../tool.types';

describe('training evidence contract (deterministic wiring, not model-quality evaluation)', () => {
  it.each<[string | null]>([
    ['performance-review'],
    ['metric-explainer'],
    ['week-review'],
    ['readiness-check'],
    ['plan-day-review'],
    [null],
  ])(
    'includes the shared contract regardless of active domain guidance: %s',
    (skillName) => {
      const system = buildCoachSystemPrompt(
        'zh',
        skillName ? getCoachSkillByName(skillName) : null,
      );
      for (const rule of TRAINING_EVIDENCE_PROMPT_CONTRACT_LINES)
        expect(system).toContain(rule);
      expect(system).not.toContain('Tool results are trusted facts.');
      expect(system).not.toContain('tool output is fact;');
    },
  );

  it('uses general evidence principles instead of embedding a scenario rule matrix', () => {
    const prompt = buildCoachSystemPrompt('zh');
    for (const constraint of [
      'Match the evidence scope to the claim',
      'Whole-activity summaries cannot establish segment behavior',
      'Compare like with like',
      'Check only the conditions that could change the conclusion',
      'Do not infer causality or physiological change from one ambiguous signal',
      'smallest useful next step',
    ])
      expect(prompt).toContain(constraint);
    expect(prompt).not.toContain(
      'Two outdoor activities alone cannot establish fitness gain or loss',
    );
    expect(prompt).not.toContain('full-session average and instantaneous peak');
  });

  it('sends single-activity evidence limitations to the model with actual measured values', async () => {
    const text = await stringifyAiSdkToolResultForModel({
      tool: activityByHashIdTool,
      ctx: {} as AiToolContext,
      input: { hashId: 'a' },
      output: {
        sportType: 'Ride',
        duration_min: 60,
        power: { avg: 120 },
        cadence: 70,
      },
    });
    expect(JSON.parse(text)).toMatchObject({
      duration_min: 60,
      power: { avg: 120 },
      cadence: 70,
      evidenceScope: {
        segmentSpecific: false,
        matchedComparisonEstablished: false,
      },
    });
  });

  it.each([
    [7, 7, true],
    [7, 14, false],
  ])(
    'derives window comparability without inventing fitness gain (%s vs %s days)',
    async (a, b, equal) => {
      const output = {
        periodA: { days: a, totalLoad: 200 },
        periodB: { days: b, totalLoad: 300 },
        delta: { totalLoad: 100 },
        zones: { periodA: [], periodB: [] },
      };
      const text = await stringifyAiSdkToolResultForModel({
        tool: compareBlocksTool,
        ctx: {} as AiToolContext,
        input: {},
        output,
      });
      expect(JSON.parse(text)).toMatchObject({
        ...output,
        evidenceScope: {
          equalWindowDays: equal,
          fitnessChangeEstablished: false,
          zoneBasisComparability: 'not_verified',
        },
      });
    },
  );
});
