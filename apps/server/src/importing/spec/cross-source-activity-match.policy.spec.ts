import { describe, expect, it } from '@jest/globals';
import {
  evaluateCrossSourceActivityMatch,
  rankUniqueCrossSourceMatch,
} from '../cross-source-activity-match.policy';

describe('cross-source activity match policy', () => {
  it('scores the same quantitative evidence for every caller', () => {
    expect(
      evaluateCrossSourceActivityMatch({
        startDiffSeconds: 2,
        leftElapsedTime: 3600,
        rightElapsedTime: 3595,
        leftDistance: 10_000,
        rightDistance: 10_020,
      }),
    ).toMatchObject({
      confidence: 0.95,
      evidence: {
        matcherVersion: 'cross-source-v2',
        startDiffSeconds: 2,
        score: 95,
      },
    });
  });

  it('does not match from start time without independent evidence', () => {
    expect(
      evaluateCrossSourceActivityMatch({ startDiffSeconds: 0 }),
    ).toBeNull();
  });

  it('rejects a candidate when any supplied quantitative field is incompatible', () => {
    expect(
      evaluateCrossSourceActivityMatch({
        startDiffSeconds: 0,
        leftElapsedTime: 1800,
        rightElapsedTime: 3600,
        leftDistance: 10_000,
        rightDistance: 10_000,
      }),
    ).toBeNull();
  });

  it('marks candidates inside the confidence margin as ambiguous', () => {
    expect(
      rankUniqueCrossSourceMatch([
        { id: 1, confidence: 0.9 },
        { id: 2, confidence: 0.87 },
      ]),
    ).toMatchObject({
      best: { id: 1 },
      runnerUp: { id: 2 },
      confidenceMargin: expect.closeTo(0.03),
      ambiguous: true,
    });
  });
});
