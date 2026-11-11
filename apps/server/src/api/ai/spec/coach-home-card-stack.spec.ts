import { describe, expect, it } from '@jest/globals';
import { buildCoachHomeStackItems } from '@shared/coach-home-card-stack';

describe('Coach home card stack', () => {
  it('prioritizes high-risk decisions, then daily judgment before ordinary follow-ups', () => {
    const decisions = [
      { id: 'ordinary', riskTier: 'LOW' },
      { id: 'high', riskTier: 'HIGH' },
    ];
    const items = buildCoachHomeStackItems(
      decisions,
      6,
      { id: 'guidance' },
      { caseId: 'case-1' },
    );
    expect(items.map((item) => item.kind)).toEqual([
      'decision',
      'suggestion',
      'decision',
      'inquiry',
      'guidance',
    ]);
    expect(items[0].id).toBe('high');
  });

  it('keeps daily judgment ahead of ordinary inquiries under the three-card cap', () => {
    const items = buildCoachHomeStackItems(
      [
        { id: 'high', riskTier: 'HIGH' },
        { id: 'ordinary', riskTier: 'LOW' },
      ],
      3,
      { id: 'guidance' },
      { caseId: 'case-1' },
    );
    expect(items.map((item) => item.id)).toEqual([
      'high',
      'suggestion',
      'ordinary',
    ]);
  });
  it('preserves urgent inquiries ahead of the daily judgment', () => {
    const items = buildCoachHomeStackItems(
      [{ id: 'high', riskTier: 'HIGH' }],
      3,
      null,
      { caseId: 'urgent', state: 'HIGH_CONCERN' },
    );
    expect(items.map((item) => item.id)).toEqual([
      'high',
      'inquiry-urgent',
      'suggestion',
    ]);
  });
});
