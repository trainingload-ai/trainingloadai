import { describe, expect, it } from '@jest/globals';
import { integrationSupportSkill } from '../skills/integrationSupport.skill';

describe('integration-support skill', () => {
  it('requires authoritative capability and user-setting lookup', () => {
    expect(integrationSupportSkill.suggestedTools).toContain(
      'integration.status',
    );
    expect(integrationSupportSkill.prompt).toContain('productCapabilities');
    expect(integrationSupportSkill.prompt).toContain('effectiveCapabilities');
    expect(integrationSupportSkill.prompt).toContain("athlete's own toggles");
    expect(integrationSupportSkill.prompt).toContain(
      'Never invent an indirect bridge between providers or devices',
    );
  });
});
