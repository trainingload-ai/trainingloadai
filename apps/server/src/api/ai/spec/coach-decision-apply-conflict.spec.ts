import { describe, expect, it } from '@jest/globals';
import { isOwnDecisionHeadAdvance } from '../coach-decision-apply-conflict';

describe('isOwnDecisionHeadAdvance', () => {
  it('treats a REVIEW_* event tagged with this decision as the proposal baseline', () => {
    expect(
      isOwnDecisionHeadAdvance({
        expectedBaseEventSeq: 4,
        headEventSeq: 5,
        intervening: [{ decisionId: 'dec-1' }],
        decisionId: 'dec-1',
      }),
    ).toBe(true);
  });

  it('still conflicts when a later fact event lands after the proposal', () => {
    expect(
      isOwnDecisionHeadAdvance({
        expectedBaseEventSeq: 4,
        headEventSeq: 6,
        intervening: [{ decisionId: 'dec-1' }, { decisionId: null }],
        decisionId: 'dec-1',
      }),
    ).toBe(false);
  });

  it('does not treat a missing intervening event as a safe advance', () => {
    expect(
      isOwnDecisionHeadAdvance({
        expectedBaseEventSeq: 4,
        headEventSeq: 5,
        intervening: [],
        decisionId: 'dec-1',
      }),
    ).toBe(false);
  });
});
