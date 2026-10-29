import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { AthleteStateFeatureFlags } from './athlete-state-feature-flags.service';

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

describe('AthleteStateFeatureFlags', () => {
  const originalValues = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of ENV_NAMES) {
      originalValues.set(name, process.env[name]);
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of ENV_NAMES) {
      const originalValue = originalValues.get(name);
      if (originalValue == null) delete process.env[name];
      else process.env[name] = originalValue;
    }
    originalValues.clear();
  });

  it('enables every capability when no environment variable is configured', () => {
    const flags = new AthleteStateFeatureFlags();

    expect(flags.evidenceEnabled()).toBe(true);
    expect(flags.assessmentShadowEnabled()).toBe(true);
    expect(flags.caseEnabled()).toBe(true);
    expect(flags.homeInquiryEnabled()).toBe(true);
    expect(flags.planDecisionEnabled()).toBe(true);
    expect(flags.followupEnabled()).toBe(true);
  });

  it('allows an explicit false value to disable a capability', () => {
    process.env.COACH_ASSESSMENT_CASE_ENABLED = 'false';

    expect(new AthleteStateFeatureFlags().caseEnabled()).toBe(false);
  });

  it('accepts the existing lowercase environment variable fallback', () => {
    process.env.athlete_state_evidence_enabled = 'false';

    expect(new AthleteStateFeatureFlags().evidenceEnabled()).toBe(false);
  });
});
