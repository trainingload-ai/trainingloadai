import { PlanStartService } from '../application/plan-start.service';

describe('draft start preview boundary', () => {
  it('requires a server-owned conversation before accepting a start candidate', async () => {
    const service = new PlanStartService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.createPreview('u', {
        mode: 'START',
        planId: 'p',
        startDate: '2026-11-22',
        rationale: 'Ready',
        evidenceRefs: [],
        changes: [],
        additions: [],
        deletions: [],
        preserveUnmentioned: true,
      }),
    ).rejects.toThrow(/conversation/);
  });
});
