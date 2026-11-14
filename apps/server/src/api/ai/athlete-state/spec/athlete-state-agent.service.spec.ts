import { AthleteStateAgentService } from '../athlete-state-agent.service';

const result = {
  state: 'STABLE',
  confidence: 0.8,
  decisionReadiness: 'SUFFICIENT',
  dimensions: [
    {
      name: 'training',
      status: 'SUPPORTS',
      summary: 'Recent sessions are consistent.',
      evidence: ['training.readiness: recent sessions completed normally.'],
    },
  ],
  hypotheses: [],
  safetyFlags: [],
  limitations: [],
};
function fixture() {
  const saveAssessment = jest.fn(async (args: any) => ({
    assessment: { id: 'assessment', ...args.result },
  }));
  const updates = { eligibility: jest.fn(async () => null as string | null) };
  const service = new AthleteStateAgentService(
    { saveAssessment } as never,
    updates as never,
  );
  const onSubmitted = jest.fn();
  const input = {
    userId: 'athlete',
    sessionId: 'state-session',
    runId: 'run',
    timezone: 'UTC',
    asOf: new Date('2026-11-13T01:00:00Z'),
    onSubmitted,
  };
  return {
    service,
    turn: service.openTurn(input),
    input,
    saveAssessment,
    updates,
    onSubmitted,
  };
}
describe('Athlete State Skill result persistence', () => {
  it('requires authoritative evidence instead of accepting a model-only conclusion', async () => {
    const f = fixture();
    await expect(f.turn.submit(result)).rejects.toThrow(
      'ATHLETE_STATE_COVERAGE_REQUIRED',
    );
    expect(f.saveAssessment).not.toHaveBeenCalled();
  });
  it('records actual tool-read receipts and the persisted conversation, without copying private claims', async () => {
    const f = fixture();
    f.turn.recordRead('training.data_coverage', {}, { complete: true });
    f.turn.recordRead(
      'training.readiness',
      {},
      { recentActivities: ['normal'] },
    );
    f.turn.recordRead(
      'memory.search',
      { query: 'recovery' },
      { claim: 'private athlete feedback' },
    );
    f.turn.recordRead(
      'plan.execution_context',
      {},
      { planId: 'plan', version: 3 },
    );
    expect(await f.turn.submit(result)).toEqual({
      assessmentId: 'assessment',
      state: 'STABLE',
      confidence: 0.8,
    });
    const evidence = f.saveAssessment.mock.calls[0][0].evidence;
    expect(evidence.snapshot).toMatchObject({
      schemaVersion: 2,
      sessionId: 'state-session',
      runId: 'run',
    });
    expect(evidence.snapshot.reads.map((read: any) => read.tool)).toEqual([
      'training.data_coverage',
      'training.readiness',
      'memory.search',
      'plan.execution_context',
    ]);
    expect(JSON.stringify(evidence)).not.toContain('private athlete feedback');
    expect(f.onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ assessmentId: 'assessment' }),
    );
    await expect(f.turn.submit(result)).rejects.toThrow(
      'ATHLETE_STATE_RESULT_ALREADY_SUBMITTED',
    );
  });
  it('includes extra plan/tool facts in the assessment identity rather than hashing only prefetched data', async () => {
    const f = fixture();
    const a = f.service.openTurn(f.input);
    const b = f.service.openTurn(f.input);
    a.recordRead('training.data_coverage', {}, { complete: true });
    a.recordRead('training.readiness', {}, { recentActivities: ['normal'] });
    b.recordRead('training.data_coverage', {}, { complete: true });
    b.recordRead('training.readiness', {}, { recentActivities: ['normal'] });
    b.recordRead('plan.execution_context', {}, { changed: true });
    await a.submit(result);
    await b.submit(result);
    expect(f.saveAssessment.mock.calls[0][0].evidence.evidenceHash).not.toBe(
      f.saveAssessment.mock.calls[1][0].evidence.evidenceHash,
    );
  });
  it('does not mistake coverage or configuration reads for evidence of a known state', async () => {
    const f = fixture();
    f.turn.recordRead('training.data_coverage', {}, { complete: true });
    f.turn.recordRead('profile.current', {}, { sport: 'RUN' });
    await expect(f.turn.submit(result)).rejects.toThrow(
      'ATHLETE_STATE_FACTS_REQUIRED',
    );
    expect(f.saveAssessment).not.toHaveBeenCalled();
  });
  it('rejects legacy question payloads instead of silently rewriting a waiting state', async () => {
    const f = fixture();
    f.turn.recordRead('training.data_coverage', {}, {});
    await expect(
      f.turn.submit({
        ...result,
        decisionReadiness: 'NEEDS_USER_INPUT',
        evidenceRequests: [],
      }),
    ).rejects.toThrow();
    expect(f.saveAssessment).not.toHaveBeenCalled();
  });
  it('rechecks authorization before writing a result', async () => {
    const f = fixture();
    f.turn.recordRead('training.data_coverage', {}, {});
    f.updates.eligibility.mockResolvedValue('AI_DATA_CONSENT_REQUIRED');
    await expect(f.turn.submit(result)).rejects.toThrow(
      'AI_DATA_CONSENT_REQUIRED',
    );
    expect(f.saveAssessment).not.toHaveBeenCalled();
  });
});
