import { describe, expect, it } from '@jest/globals';
import { sanitizeActivityRecordSpeeds } from '../instantaneous-speed';

function records(speeds: number[]) {
  return speeds.map((speed, index) => ({
    timestamp: new Date(Date.UTC(2026, 8, 4, 8, 0, index)),
    speed,
    enhancedSpeed: speed,
  }));
}

describe('instantaneous speed sanitization', () => {
  it('repairs the isolated cycling peaks seen in the reported activity', () => {
    const input = records([5.602, 5.637, 17.24, 5.757, 5.824]);

    const output = sanitizeActivityRecordSpeeds(input, 'CYCLING');

    expect(output[2].speed).toBeCloseTo(5.697, 3);
    expect(output[2].enhancedSpeed).toBeCloseTo(5.697, 3);
    expect(input[2].speed).toBe(17.24);
  });

  it('repairs a two-sample peak but preserves sustained high cycling speed', () => {
    const peak = sanitizeActivityRecordSpeeds(
      records([5, 5.2, 17, 17.2, 5.4, 5.5]),
      'CYCLING',
    );
    const sustained = sanitizeActivityRecordSpeeds(
      records([5, 5.2, 12, 12.2, 12.1, 12]),
      'CYCLING',
    );

    expect(peak[2].speed).toBeLessThan(6);
    expect(peak[3].speed).toBeLessThan(6);
    expect(sustained.map((record) => record.speed)).toEqual([
      5, 5.2, 12, 12.2, 12.1, 12,
    ]);
  });

  it('repairs isolated peaks at either series boundary', () => {
    const startPeak = sanitizeActivityRecordSpeeds(
      records([17, 5.2, 5.3]),
      'CYCLING',
    );
    const endPeak = sanitizeActivityRecordSpeeds(
      records([5, 5.2, 17]),
      'CYCLING',
    );
    const sustainedStart = sanitizeActivityRecordSpeeds(
      records([17, 17.2, 17.1, 17]),
      'CYCLING',
    );

    expect(startPeak.map((record) => record.speed)).toEqual([5.2, 5.2, 5.3]);
    expect(endPeak.map((record) => record.speed)).toEqual([5, 5.2, 5.2]);
    expect(sustainedStart.map((record) => record.speed)).toEqual([
      17, 17.2, 17.1, 17,
    ]);
  });

  it('clears a series that is entirely above the sport hard limit', () => {
    const output = sanitizeActivityRecordSpeeds(
      records([40, 41, 42]),
      'CYCLING',
    );

    expect(output.map((record) => record.speed)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(output.map((record) => record.enhancedSpeed)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('uses the stricter running profile and ignores unsupported sports', () => {
    const run = sanitizeActivityRecordSpeeds(
      records([3.1, 3.2, 8.5, 3.3, 3.4]),
      'RUN',
    );
    const swim = sanitizeActivityRecordSpeeds(
      records([3.1, 3.2, 8.5, 3.3, 3.4]),
      'SWIM',
    );

    expect(run[2].speed).toBeCloseTo(3.25, 6);
    expect(swim[2].speed).toBe(8.5);
  });
});
