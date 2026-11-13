import { withAutomaticStateUpdatesSuppressed } from '../../athlete-state.events';
import { featureAccessSnapshot } from '@/access/feature-access.types';
import {
  AthleteStateUpdates,
  athleteStateAutoEnabled,
} from '../athlete-state-updates.service';
import {
  stateHealthFactChanged,
  withinStateEvidenceWindow,
  STATE_UPDATE_HEALTH_METRICS,
} from '../athlete-state-update-policy';

function fixture(setting?: string, granted = true, allowed = true) {
  const prisma = {
    userSetting: { findUnique: jest.fn(async () => ({ value: setting })) },
  };
  const queue = {
    requestUpdate: jest.fn(async (_input: unknown, _tx?: unknown) => ({
      status: 'PENDING',
      user_id: 'athlete',
      requested_version: 1,
    })),
  };
  Object.assign(queue, { find: jest.fn(async () => null) });
  const consent = {
    getStatus: jest.fn(async () => ({
      granted,
      state: granted ? 'GRANTED' : 'DECLINED',
    })),
  };
  const access = {
    evaluate: jest.fn(async () =>
      featureAccessSnapshot({
        allowed,
        reason: allowed ? 'GRANTED' : 'FEATURE_DISABLED',
      }),
    ),
  };
  const events = { emitAsync: jest.fn(async () => []) };
  const service = new AthleteStateUpdates(
    prisma as never,
    queue as never,
    consent as never,
    access as never,
    events as never,
  );
  return { service, prisma, queue, consent, access, events };
}
const request = { userId: 'athlete', triggerType: 'HEALTH_FACT_CHANGED' };
describe('Athlete State update eligibility and dispatch', () => {
  it('suppresses maintenance ingestion across async writers without affecting ordinary updates', async () => {
    const f = fixture();
    const result = await withAutomaticStateUpdatesSuppressed(true, async () => {
      await Promise.resolve();
      return f.service.requestUpdate(request);
    });
    expect(result).toEqual({ status: 'SKIPPED', reason: 'MAINTENANCE' });
    expect(f.consent.getStatus).not.toHaveBeenCalled();
    expect(f.access.evaluate).not.toHaveBeenCalled();
    expect(f.queue.requestUpdate).not.toHaveBeenCalled();
    await f.service.requestUpdate(request);
    expect(f.queue.requestUpdate).toHaveBeenCalledTimes(1);
  });
  it('defaults the independent setting to on and never consults a credit ledger', async () => {
    const f = fixture();
    await f.service.requestUpdate(request);
    expect(f.queue.requestUpdate).toHaveBeenCalledTimes(1);
    expect(f.access.evaluate).toHaveBeenCalledWith('athlete', ['ai.coach']);
  });
  it('does not inspect consent or persist a task when automation is off', async () => {
    const f = fixture('false');
    expect(await f.service.requestUpdate(request)).toEqual({
      status: 'SKIPPED',
      reason: 'AUTOMATION_DISABLED',
    });
    expect(f.consent.getStatus).not.toHaveBeenCalled();
    expect(f.queue.requestUpdate).not.toHaveBeenCalled();
  });
  it('skips before feature admission and queuing without consent', async () => {
    const f = fixture(undefined, false);
    expect((await f.service.requestUpdate(request)).status).toBe('SKIPPED');
    expect(f.access.evaluate).not.toHaveBeenCalled();
    expect(f.queue.requestUpdate).not.toHaveBeenCalled();
  });
  it('keeps the feature gate even for a platform-funded task', async () => {
    const f = fixture(undefined, true, false);
    expect(await f.service.requestUpdate(request)).toEqual({
      status: 'SKIPPED',
      reason: 'FEATURE_ACCESS_REQUIRED',
    });
    expect(f.queue.requestUpdate).not.toHaveBeenCalled();
  });
  it('lets explicit Case answers bypass only the automatic preference', async () => {
    const f = fixture('false');
    await f.service.requestUpdate({
      ...request,
      explicit: true,
      mode: 'immediate',
    });
    expect(f.consent.getStatus).toHaveBeenCalled();
    expect(f.queue.requestUpdate).toHaveBeenCalled();
    expect(f.events.emitAsync).toHaveBeenCalledTimes(1);
  });
  it('persists inside the fact transaction without dispatching before commit', async () => {
    const f = fixture();
    const tx = { userSetting: f.prisma.userSetting };
    await f.service.requestUpdate(
      { ...request, mode: 'immediate' },
      tx as never,
    );
    expect(f.queue.requestUpdate).toHaveBeenCalledWith(expect.anything(), tx);
    expect(f.events.emitAsync).not.toHaveBeenCalled();
  });
  it('propagates permission-store outages rather than granting access', async () => {
    const f = fixture();
    f.consent.getStatus.mockRejectedValueOnce(new Error('unavailable'));
    await expect(f.service.requestUpdate(request)).rejects.toThrow(
      'unavailable',
    );
    expect(f.queue.requestUpdate).not.toHaveBeenCalled();
  });
});
describe('state evidence trigger policy', () => {
  it.each(['false', '0', 'no'])('understands explicit off %s', (value) =>
    expect(athleteStateAutoEnabled(value)).toBe(false),
  );
  it('keeps standalone weight, steps and resting HR passive', () => {
    for (const field of [
      'BODY_MASS_KG',
      'STEP_COUNT',
      'RESTING_HEART_RATE_BPM',
    ])
      expect(STATE_UPDATE_HEALTH_METRICS.has(field)).toBe(false);
    for (const field of [
      'HRV_RMSSD_MS',
      'HRV_SDNN_MS',
      'SLEEP_SCORE',
      'SLEEP_ASLEEP_SECONDS',
      'VO2_MAX',
    ])
      expect(STATE_UPDATE_HEALTH_METRICS.has(field)).toBe(true);
  });
  it('ignores timestamps and unused provider changes but detects changed selected values and removals', () => {
    const fact = { value: 40, unit: 'ms', selectedProvider: 'INTERVALS_ICU' };
    expect(stateHealthFactChanged(fact, { ...fact })).toBe(false);
    expect(stateHealthFactChanged(fact, { ...fact, value: 41 })).toBe(true);
    expect(stateHealthFactChanged(fact, null)).toBe(true);
  });
  it('uses athlete-local days and includes baseline backfills without including future facts', () => {
    const now = new Date('2026-11-13T01:00:00Z');
    expect(
      withinStateEvidenceWindow(
        new Date('2026-11-12T00:00:00Z'),
        'America/Los_Angeles',
        now,
      ),
    ).toBe(true);
    expect(
      withinStateEvidenceWindow(
        new Date('2026-11-13T00:00:00Z'),
        'America/Los_Angeles',
        now,
      ),
    ).toBe(false);
    expect(
      withinStateEvidenceWindow(new Date('2026-10-10T00:00:00Z'), 'UTC', now),
    ).toBe(true);
    expect(
      withinStateEvidenceWindow(new Date('2026-09-01T00:00:00Z'), 'UTC', now),
    ).toBe(false);
  });
});
