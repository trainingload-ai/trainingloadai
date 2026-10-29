import { describe, expect, it } from '@jest/globals';
import {
  parseLocalStartHour,
  parsePositiveInt,
  parsePositiveMinutes,
  parsePositiveNumber,
} from '../config-number.util';

describe('config number util', () => {
  it('parses positive numbers and falls back for non-positive or invalid values', () => {
    expect(parsePositiveNumber('12.5', 60)).toBe(12.5);
    expect(parsePositiveNumber(0, 60)).toBe(60);
    expect(parsePositiveNumber(-1, 60)).toBe(60);
    expect(parsePositiveNumber('not-a-number', 60)).toBe(60);
  });

  it('parses positive integers by flooring positive numeric values', () => {
    expect(parsePositiveInt('20', 10)).toBe(20);
    expect(parsePositiveInt('20.9', 10)).toBe(20);
    expect(parsePositiveInt('0.9', 10)).toBe(10);
    expect(parsePositiveInt(undefined, 10)).toBe(10);
  });

  it('keeps minute values as positive numbers', () => {
    expect(parsePositiveMinutes('2.5', 60)).toBe(2.5);
    expect(parsePositiveMinutes('', 60)).toBe(60);
  });

  it('parses local start hours in the inclusive 0-23 range', () => {
    expect(parseLocalStartHour('0', 2)).toBe(0);
    expect(parseLocalStartHour(23, 2)).toBe(23);
    expect(parseLocalStartHour(24, 2)).toBe(2);
    expect(parseLocalStartHour('2.5', 2)).toBe(2);
  });
});
