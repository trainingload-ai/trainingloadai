import { describe, expect, it } from '@jest/globals';
import {
  activityPolylineFingerprint,
  normalizeActivityPolylines,
} from '../activity-polyline.util';

describe('activity polyline util', () => {
  it('normalizes one or many ordered route segments', () => {
    expect(normalizeActivityPolylines(' abc ')).toEqual(['abc']);
    expect(normalizeActivityPolylines([' abc ', '', null, 'def'])).toEqual([
      'abc',
      'def',
    ]);
  });

  it('fingerprints the segment boundary and order', () => {
    expect(activityPolylineFingerprint(['abc', 'def'])).not.toBe(
      activityPolylineFingerprint(['abcdef']),
    );
    expect(activityPolylineFingerprint(['abc', 'def'])).not.toBe(
      activityPolylineFingerprint(['def', 'abc']),
    );
    expect(activityPolylineFingerprint([' abc ', 'def'])).toBe(
      activityPolylineFingerprint(['abc', 'def']),
    );
  });
});
