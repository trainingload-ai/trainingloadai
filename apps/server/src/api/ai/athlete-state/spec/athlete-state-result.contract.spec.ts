import { AthleteStateStatus } from '@prisma/client';
import { validateAiToolInput } from '../../core/tool.types';
import { athleteStateAnswerTool } from '../../core/tools/athleteStateAnswer.tool';
import {
  ATHLETE_STATE_DEFINITIONS,
  parseAthleteStateSkillResult,
} from '../athlete-state-result.contract';

export const validResult = () => ({
  state: 'STABLE',
  confidence: 0.8,
  decisionReadiness: 'SUFFICIENT',
  dimensions: [
    {
      name: 'training',
      status: 'SUPPORTS',
      summary: 'Current sessions are consistent.',
      evidence: [
        'activity.recent: comparable recent sessions completed normally.',
      ],
    },
  ],
  hypotheses: [],
  safetyFlags: [],
  limitations: [],
});

describe('Athlete State Skill output contract', () => {
  it('defines every persisted state without adding a diagnostic classification', () => {
    expect(Object.keys(ATHLETE_STATE_DEFINITIONS).sort()).toEqual(
      Object.values(AthleteStateStatus).sort(),
    );
  });
  it('accepts a complete state without legacy question fields', () => {
    expect(parseAthleteStateSkillResult(validResult())).toMatchObject({
      success: true,
      value: validResult(),
    });
  });
  it.each([
    { confidence: '0.8' },
    { state: 'RECOVERED' },
    { dimensions: [{}] },
    { dimensions: [] },
    { hypotheses: [{ label: 'Fatigue' }] },
    { safetyFlags: [{ code: 'CONCERN' }] },
    { limitations: [42] },
    { evidenceRequests: [] },
    { decisionReadiness: 'NEEDS_USER_INPUT' },
    { state: 'HIGH_CONCERN', safetyFlags: [] },
    { state: 'UNKNOWN', confidence: 0.9, limitations: ['Missing evidence'] },
    {
      state: 'UNKNOWN',
      confidence: 0.3,
      decisionReadiness: 'INSUFFICIENT_BUT_SAFE',
      limitations: [],
    },
  ])(
    'rejects malformed or inconsistent output without coercion: %j',
    (patch) => {
      const raw = { ...validResult(), ...patch };
      const original = JSON.stringify(raw);
      expect(parseAthleteStateSkillResult(raw).success).toBe(false);
      expect(JSON.stringify(raw)).toBe(original);
    },
  );
  it('preserves confirmed sync waiting with no need for a user question', () => {
    const raw = {
      ...validResult(),
      state: 'UNKNOWN',
      confidence: 0.3,
      decisionReadiness: 'WAITING_FOR_SYNC',
      limitations: ['Coverage reports three activities still processing.'],
    };
    expect(parseAthleteStateSkillResult(raw)).toMatchObject({
      success: true,
      value: raw,
    });
  });
  it('rejects invalid nested tool input before invoking the state writer', async () => {
    const submit = jest.fn();
    const checked = await validateAiToolInput(
      athleteStateAnswerTool,
      { athleteState: { submit } } as never,
      {
        result: { ...validResult(), hypotheses: [{ label: 'Incomplete' }] },
      } as never,
    );
    expect(checked.ok).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });
});
