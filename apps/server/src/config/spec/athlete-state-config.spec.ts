import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import config from '../config';

const FLAG_NAMES = [
  'ATHLETE_STATE_EVIDENCE_ENABLED',
  'ATHLETE_STATE_ASSESSMENT_SHADOW_ENABLED',
  'COACH_ASSESSMENT_CASE_ENABLED',
  'COACH_ASSESSMENT_HOME_INQUIRY_ENABLED',
  'COACH_ASSESSMENT_PLAN_DECISION_ENABLED',
  'COACH_ASSESSMENT_FOLLOWUP_ENABLED',
] as const;
const ENV_NAMES = [
  ...FLAG_NAMES,
  ...FLAG_NAMES.map((name) => name.toLowerCase()),
];

describe('Athlete State environment configuration', () => {
  const original = new Map<string, string | undefined>();
  beforeEach(() => {
    for (const name of ENV_NAMES) {
      original.set(name, process.env[name]);
      delete process.env[name];
    }
  });
  afterEach(() => {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    original.clear();
  });

  it('enables all six capabilities by default', () => {
    expect(config().athleteState).toEqual({
      evidenceEnabled: true,
      assessmentShadowEnabled: true,
      caseEnabled: true,
      homeInquiryEnabled: true,
      planDecisionEnabled: true,
      followupEnabled: true,
    });
  });

  it('parses disabled values as booleans rather than truthy strings', () => {
    for (const name of FLAG_NAMES) process.env[name] = 'false';
    expect(Object.values(config().athleteState)).toEqual(Array(6).fill(false));
  });

  it('keeps lowercase environment aliases and uppercase precedence', () => {
    process.env.athlete_state_evidence_enabled = 'false';
    expect(config().athleteState.evidenceEnabled).toBe(false);
    process.env.ATHLETE_STATE_EVIDENCE_ENABLED = ' TRUE ';
    expect(config().athleteState.evidenceEnabled).toBe(true);
  });

  it('retains default-on blank values and does not enable malformed values', () => {
    process.env.ATHLETE_STATE_EVIDENCE_ENABLED = '  ';
    process.env.COACH_ASSESSMENT_CASE_ENABLED = 'invalid';
    expect(config().athleteState.evidenceEnabled).toBe(true);
    expect(config().athleteState.caseEnabled).toBe(false);
  });
});
