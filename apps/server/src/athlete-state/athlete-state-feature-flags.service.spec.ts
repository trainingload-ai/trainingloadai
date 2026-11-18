import { describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AthleteStateFeatureFlags } from './athlete-state-feature-flags.service';

const METHODS = [
  'evidenceEnabled',
  'assessmentShadowEnabled',
  'caseEnabled',
  'homeInquiryEnabled',
  'planDecisionEnabled',
  'followupEnabled',
] as const;

describe('AthleteStateFeatureFlags', () => {
  it.each(METHODS)(
    'reads %s from injected configuration, including false',
    (method) => {
      const config = new ConfigService({ athleteState: { [method]: false } });
      const flags = new AthleteStateFeatureFlags(config);
      expect(flags[method]()).toBe(false);
    },
  );

  it('defaults missing configuration to enabled for isolated module consumers', () => {
    const flags = new AthleteStateFeatureFlags(new ConfigService());
    for (const method of METHODS) expect(flags[method]()).toBe(true);
  });
});
