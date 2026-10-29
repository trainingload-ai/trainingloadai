import { describe, expect, it } from '@jest/globals';
import {
  normalizeVo2MaxSourcePreference,
  resolveEffectiveActivityVo2Max,
} from '../vo2max/vo2max-source';

describe('resolveEffectiveActivityVo2Max', () => {
  const values = {
    vo2maxVdotByHr: 48,
    vo2maxVdotByFactor: 46,
    vo2maxVdotByRace: 51,
  };

  it('never exposes the raw heart-rate estimate as a separate final value', () => {
    expect(resolveEffectiveActivityVo2Max(values)).toEqual({
      value: 46,
      source: 'FACTOR',
    });
    expect(
      resolveEffectiveActivityVo2Max({
        ...values,
        vo2maxVdotByHr: 48,
        vo2maxVdotByFactor: 0,
      }),
    ).toEqual({ value: 48, source: 'FACTOR' });
  });

  it('honors corrected and race preferences while retaining fallbacks', () => {
    expect(resolveEffectiveActivityVo2Max(values, 'FACTOR')).toEqual({
      value: 46,
      source: 'FACTOR',
    });
    expect(resolveEffectiveActivityVo2Max(values, 'STANDARD')).toEqual({
      value: 51,
      source: 'RACE',
    });
  });

  it('uses the current user factor instead of a stale stored factor', () => {
    expect(resolveEffectiveActivityVo2Max(values, 'FACTOR', 0.9)).toEqual({
      value: 43.2,
      source: 'FACTOR',
    });
  });

  it('maps the legacy heart-rate preference onto the corrected path', () => {
    expect(resolveEffectiveActivityVo2Max(values, 'HEARTRATE', 0.9)).toEqual({
      value: 43.2,
      source: 'FACTOR',
    });
    expect(normalizeVo2MaxSourcePreference('HEARTRATE')).toBe('FACTOR');
  });

  it('ignores invalid values and normalizes unknown preferences', () => {
    expect(
      resolveEffectiveActivityVo2Max({
        vo2maxVdotByHr: Number.NaN,
        vo2maxVdotByFactor: -1,
        vo2maxVdotByRace: 0,
      }),
    ).toBeUndefined();
    expect(normalizeVo2MaxSourcePreference('unknown')).toBe('FACTOR');
  });
});
