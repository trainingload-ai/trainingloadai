import { describe, expect, it } from '@jest/globals';

import { planCapabilities } from '../application/plan-row.mapper';

describe('plan capabilities', () => {
  it('allows deleting drafts and completed history only', () => {
    expect(planCapabilities('DRAFT')).toEqual({ delete: true });
    expect(planCapabilities('COMPLETED')).toEqual({ delete: true });
    expect(planCapabilities('ACTIVE')).toEqual({ delete: false });
    expect(planCapabilities('PAUSED')).toEqual({ delete: false });
    expect(planCapabilities('CANCELLED')).toEqual({ delete: false });
    expect(planCapabilities('SUPERSEDED')).toEqual({ delete: false });
  });
});
