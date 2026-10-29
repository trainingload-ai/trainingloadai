import {
  calculateDirectImpact,
  canEnterAmbient,
  memoryLifecycle,
} from './memory-decay-policy';
import { describe, expect, it } from '@jest/globals';
import type { MemoryDecayProfile } from './memory-operation';

const anchor = new Date('2026-10-10T23:00:00+08:00');

function input(asOf: string, profile: MemoryDecayProfile = 'ACUTE_RECOVERY') {
  return {
    profile,
    asOf: new Date(asOf),
    relevanceAnchorAt: anchor,
    confidence: 0.96,
    authorityWeight: 0.95,
    active: true,
  };
}

describe('Athlete Memory decay policy', () => {
  it('keeps acute recovery observations ambient for the first days', () => {
    const recent = input('2026-10-11T23:00:00+08:00');
    expect(calculateDirectImpact(recent)).toBeGreaterThan(0.5);
    expect(canEnterAmbient(recent)).toBe(true);
  });

  it('removes a single bad-night observation from current impact after 20 days', () => {
    const old = input('2026-10-30T23:00:00+08:00');
    expect(calculateDirectImpact(old)).toBeLessThan(0.001);
    expect(canEnterAmbient(old)).toBe(false);
  });

  it('marks unresolved conditions stale without pretending they recovered', () => {
    const unresolved = {
      ...input('2026-10-30T23:00:00+08:00', 'UNTIL_RESOLVED'),
      reviewAfter: new Date('2026-10-20T00:00:00+08:00'),
    };
    expect(memoryLifecycle(unresolved)).toBe('STALE_UNRESOLVED');
    expect(calculateDirectImpact(unresolved)).toBeGreaterThan(0);
    expect(canEnterAmbient(unresolved)).toBe(true);
  });
});
