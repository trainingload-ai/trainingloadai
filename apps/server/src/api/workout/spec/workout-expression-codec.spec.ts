import { describe, expect, it } from '@jest/globals';
import {
  averageExpressionSpeedAsKmh,
  convertExpressionSpeedToKmh,
  expressionSpeedUnitToToken,
  getExpressionSpeedUnitForSport,
  isSwimExpressionSport,
  normalizeExpressionSpeedUnit,
  parseTargetValueWithUnit,
} from '../workout-expression-codec';

describe('workout expression speed units', () => {
  it('treats swim sport names case-insensitively', () => {
    expect(isSwimExpressionSport('SWIM')).toBe(true);
    expect(isSwimExpressionSport('swim')).toBe(true);
    expect(isSwimExpressionSport('RUN')).toBe(false);
    expect(isSwimExpressionSport(null)).toBe(false);
  });

  it('uses swim pace for swim and running pace for other sports', () => {
    expect(getExpressionSpeedUnitForSport('SWIM')).toBe('sec/100m');
    expect(getExpressionSpeedUnitForSport('RUN')).toBe('sec/km');
    expect(getExpressionSpeedUnitForSport('CYCLING')).toBe('sec/km');
    expect(getExpressionSpeedUnitForSport(undefined)).toBe('sec/km');
  });

  it('normalizes explicit aliases before falling back to the sport default', () => {
    expect(normalizeExpressionSpeedUnit('s/100m', 'RUN')).toBe('sec/100m');
    expect(normalizeExpressionSpeedUnit('s/km', 'SWIM')).toBe('sec/km');
    expect(normalizeExpressionSpeedUnit(undefined, 'SWIM')).toBe('sec/100m');
    expect(normalizeExpressionSpeedUnit('mph', 'RUN')).toBe('sec/km');
  });

  it('serializes speed units to expression tokens', () => {
    expect(expressionSpeedUnitToToken('sec/100m')).toBe('s/100m');
    expect(expressionSpeedUnitToToken('sec/km')).toBe('s/km');
    expect(expressionSpeedUnitToToken('km/h')).toBe('km/h');
    expect(expressionSpeedUnitToToken(undefined)).toBe('km/h');
  });
});

describe('workout expression speed conversion', () => {
  it('converts pace units to km/h', () => {
    expect(convertExpressionSpeedToKmh(300, 'sec/km')).toBe(12);
    expect(convertExpressionSpeedToKmh(120, 'sec/100m')).toBe(3);
    expect(convertExpressionSpeedToKmh(32, 'km/h')).toBe(32);
  });

  it('rejects non-positive or non-finite speed values', () => {
    expect(convertExpressionSpeedToKmh(0, 'km/h')).toBeUndefined();
    expect(convertExpressionSpeedToKmh(-1, 'sec/km')).toBeUndefined();
    expect(convertExpressionSpeedToKmh(Number.POSITIVE_INFINITY, 'sec/100m'))
      .toBeUndefined();
  });

  it('averages valid low and high values after unit conversion', () => {
    expect(averageExpressionSpeedAsKmh(240, 300, 'sec/km')).toBe(13.5);
    expect(averageExpressionSpeedAsKmh(undefined, 120, 'sec/100m')).toBe(3);
    expect(averageExpressionSpeedAsKmh(undefined, undefined, 'km/h'))
      .toBeUndefined();
  });
});

describe('parseTargetValueWithUnit', () => {
  it('parses inline ranges with unit suffixes', () => {
    expect(parseTargetValueWithUnit('220-250W')).toEqual({
      low: 220,
      high: 250,
      unit: 'W',
      consumedUnitToken: false,
    });
  });

  it('parses explicit unit tokens and marks them as consumed', () => {
    expect(parseTargetValueWithUnit('85-95', 'rpm')).toEqual({
      low: 85,
      high: 95,
      unit: 'rpm',
      consumedUnitToken: true,
    });
  });

  it('parses a single numeric value without a unit', () => {
    expect(parseTargetValueWithUnit('150')).toEqual({
      low: 150,
      high: undefined,
      unit: undefined,
      consumedUnitToken: false,
    });
  });

  it('returns null for unsupported target value forms', () => {
    expect(parseTargetValueWithUnit('4:30')).toBeNull();
    expect(parseTargetValueWithUnit('fast', 'bpm')).toBeNull();
    expect(parseTargetValueWithUnit('120', 'mph')).toEqual({
      low: 120,
      high: undefined,
      unit: undefined,
      consumedUnitToken: false,
    });
  });
});
