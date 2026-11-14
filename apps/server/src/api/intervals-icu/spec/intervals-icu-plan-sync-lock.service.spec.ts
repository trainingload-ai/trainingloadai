import { EventEmitter } from 'node:events';
import { IntervalsIcuPlanSyncLock } from '../intervals-icu-plan-sync-lock.service';

const clients: FakeClient[] = [];
let acquired = true;
class FakeClient extends EventEmitter {
  connect = jest.fn(async () => undefined);
  query = jest.fn(async () => ({ rows: [{ acquired }] }));
  end = jest.fn(async () => undefined);
  constructor() {
    super();
    clients.push(this);
  }
}
jest.mock('pg', () => ({ Client: FakeClient }));

describe('IntervalsIcuPlanSyncLock', () => {
  beforeEach(() => {
    clients.length = 0;
    acquired = true;
  });

  it('acquires a database session lock scoped to the connection and closes the session', async () => {
    const lock = new IntervalsIcuPlanSyncLock();
    await expect(
      lock.run('connection', async () => {
        lock.assertHeld();
        return 'done';
      }),
    ).resolves.toBe('done');
    expect(clients[0].query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      ['intervals-plan-sync:connection'],
    );
    expect(clients[0].end).toHaveBeenCalledTimes(1);
    expect(() => lock.assertHeld()).toThrow(
      'INTERVALS_PLAN_SYNC_LOCK_REQUIRED',
    );
  });

  it('rejects competing workers before either endpoint is changed', async () => {
    acquired = false;
    const work = jest.fn(async () => undefined);
    await expect(
      new IntervalsIcuPlanSyncLock().run('connection', work),
    ).rejects.toThrow('INTERVALS_PLAN_SYNC_BUSY');
    expect(work).not.toHaveBeenCalled();
    expect(clients[0].end).toHaveBeenCalledTimes(1);
  });

  it('closes the session on failure so retries can acquire the relationship', async () => {
    await expect(
      new IntervalsIcuPlanSyncLock().run('connection', async () => {
        throw new Error('provider failed');
      }),
    ).rejects.toThrow('provider failed');
    expect(clients[0].end).toHaveBeenCalledTimes(1);
  });

  it('rejects side effects after the session loses ownership', async () => {
    const lock = new IntervalsIcuPlanSyncLock();
    await expect(
      lock.run('connection', async () => {
        clients[0].emit('error', new Error('socket lost'));
        lock.assertHeld();
      }),
    ).rejects.toThrow('INTERVALS_PLAN_SYNC_LOCK_LOST');
    expect(clients[0].end).toHaveBeenCalledTimes(1);
  });
});
