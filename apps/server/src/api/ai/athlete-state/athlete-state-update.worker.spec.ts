import { HttpException } from '@nestjs/common';
import { AthleteStateUpdateWorker } from './athlete-state-update.worker';

function fixture(triggers: any[] = [{ triggerType: 'HEALTH_FACT_CHANGED' }]) {
  const job = {
    user_id: 'athlete',
    running_version: 3,
    requested_version: 3,
    running_triggers: triggers,
    lease_token: 'lease',
  };
  const queue = {
    claim: jest.fn(async () => job),
    heartbeat: jest.fn(async () => {}),
    finish: jest.fn(async () => job),
    fail: jest.fn(async () => {}),
  };
  const updates = {
    eligibility: jest.fn(
      async (_user: string, _explicit: boolean) => null as string | null,
    ),
  };
  const orchestrator = {
    assess: jest.fn(
      async (_args: any) => ({ assessment: { id: 'assessment' } }) as any,
    ),
  };
  const worker = new AthleteStateUpdateWorker(
    { register: jest.fn() } as never,
    { isEnabled: () => true } as never,
    { evidenceEnabled: () => true } as never,
    queue as never,
    updates as never,
    orchestrator as never,
  );
  return { worker, queue, updates, orchestrator, job };
}
describe('Athlete State shared runner', () => {
  it('rechecks eligibility after queuing without reading evidence when consent was revoked', async () => {
    const f = fixture();
    f.updates.eligibility.mockResolvedValue('AI_DATA_CONSENT_REQUIRED');
    await f.worker.tick();
    expect(f.orchestrator.assess).not.toHaveBeenCalled();
    expect(f.queue.finish).toHaveBeenCalledWith(
      f.job,
      'AI_DATA_CONSENT_REQUIRED',
    );
  });
  it('merges ordinary facts into one assessment of the latest evidence', async () => {
    const f = fixture([
      { triggerType: 'HEALTH_FACT_CHANGED' },
      { triggerType: 'FITNESS_FACT_CHANGED' },
    ]);
    await f.worker.tick();
    expect(f.orchestrator.assess).toHaveBeenCalledTimes(1);
    expect(f.queue.finish).toHaveBeenCalledWith(f.job, undefined);
  });
  it('preserves multiple Cases and late answers while coalescing duplicate Case reasons', async () => {
    const f = fixture([
      { triggerType: 'CASE_ANSWER', preserveCaseId: 'case-a', explicit: true },
      { triggerType: 'FOLLOW_UP', preserveCaseId: 'case-a' },
      { triggerType: 'CASE_ANSWER', preserveCaseId: 'case-b', explicit: true },
      {
        triggerType: 'LATE_CASE_ANSWER',
        answerQuestionId: 'late-question',
        explicit: true,
      },
    ]);
    await f.worker.tick();
    expect(f.orchestrator.assess).toHaveBeenCalledTimes(2);
    for (const [input] of f.orchestrator.assess.mock.calls)
      expect(input).toMatchObject({
        scopeCaseIds: ['case-a', 'case-b'],
        answerQuestionIds: ['late-question'],
        explicit: true,
      });
  });
  it('shares the same executor when two immediate requests arrive concurrently', async () => {
    const f = fixture();
    let complete!: () => void;
    f.orchestrator.assess.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = () => resolve({ assessment: {} });
        }),
    );
    const active = f.worker.tick();
    while (!complete)
      await new Promise<void>((resolve) => setImmediate(resolve));
    await f.worker.wake({ userId: 'athlete' });
    expect(f.queue.claim).toHaveBeenCalledTimes(1);
    complete();
    await active;
  });
  it('records a late consent refusal as a skip rather than a retry warning', async () => {
    const f = fixture();
    f.orchestrator.assess.mockRejectedValue(
      new HttpException({ code: 'AI_DATA_CONSENT_REQUIRED' }, 403),
    );
    await f.worker.tick();
    expect(f.queue.fail).not.toHaveBeenCalled();
    expect(f.queue.finish).toHaveBeenCalledWith(
      f.job,
      'AI_DATA_CONSENT_REQUIRED',
    );
  });
  it('retains unexpected failures for bounded retries', async () => {
    const f = fixture();
    f.orchestrator.assess.mockRejectedValue(new Error('upstream unavailable'));
    await f.worker.tick();
    expect(f.queue.fail).toHaveBeenCalledWith(f.job, 'ASSESSMENT_FAILED');
    expect(f.queue.finish).not.toHaveBeenCalled();
  });
});
