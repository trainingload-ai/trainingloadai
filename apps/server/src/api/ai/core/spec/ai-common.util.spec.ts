import { describe, expect, it } from '@jest/globals';
import {
  dayDiffByYmd,
  localDateYmd,
  normalizeStringArray,
  previewText,
  safeLogJson,
  sha256Hex,
  stableJson,
} from '../ai-common.util';

describe('ai-common util', () => {
  it('normalizes preview text and includes original length when truncated', () => {
    expect(previewText('  hello\n\nworld  ')).toBe('hello world');
    expect(previewText('abcdef', 3)).toBe('abc…(len=6)');
  });

  it('serializes values safely for logs', () => {
    expect(safeLogJson({ ok: true })).toBe('{"ok":true}');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(safeLogJson(circular)).toBe('[object Object]');
  });

  it('produces stable JSON for object key order, arrays, and undefined inputs', () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    expect(stableJson([{ z: 1, a: 2 }, undefined])).toBe(
      '[{"a":2,"z":1},null]',
    );
    expect(stableJson(undefined)).toBe('{}');
  });

  it('hashes strings with sha256 hex encoding', () => {
    expect(sha256Hex('starshards')).toHaveLength(64);
    expect(sha256Hex('starshards')).toBe(sha256Hex('starshards'));
    expect(sha256Hex('starshards')).not.toBe(sha256Hex('other'));
  });

  it('normalizes string arrays by trimming, dropping blanks, and limiting length', () => {
    expect(normalizeStringArray([' a ', '', null, 'b', 'c', 'd', 'e', 'f'])).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(normalizeStringArray('not-array')).toEqual([]);
  });

  it('formats a local calendar date in the requested time zone', () => {
    const instant = '2026-06-29T01:30:00.000Z';

    expect(localDateYmd(instant, 'Asia/Shanghai')).toBe('2026-06-29');
    expect(localDateYmd(instant, 'America/Los_Angeles')).toBe('2026-06-28');
    expect(localDateYmd('not-a-date', 'UTC')).toBeNull();
    expect(localDateYmd(instant, 'bad/time-zone')).toBeNull();
  });

  it('computes date differences by calendar day strings', () => {
    expect(dayDiffByYmd('2026-06-29', '2026-07-01')).toBe(2);
    expect(dayDiffByYmd('2026-07-01', '2026-06-29')).toBe(-2);
    expect(dayDiffByYmd('2026-6-29', '2026-07-01')).toBeNull();
  });
});
