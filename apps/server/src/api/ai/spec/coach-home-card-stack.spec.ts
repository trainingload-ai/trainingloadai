import { describe, expect, it } from '@jest/globals';
import { buildCoachHomeStackItems } from '@shared/coach-home-card-stack';

describe('Coach home card stack', () => {
  it('orders high-risk Decision, Inquiry, ordinary Decision, Guidance, then suggestion', () => {
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
      'inquiry',
      'decision',
      'guidance',
      'suggestion',
    ]);
    expect(items[0].id).toBe('high');
  });

  it('keeps suggestion as the final visible card under the three-card cap', () => {
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
      'inquiry-case-1',
      'suggestion',
    ]);
  });
});
