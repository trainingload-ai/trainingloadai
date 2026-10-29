import { describe, expect, it, jest } from '@jest/globals';
import { PlanScheduledActivationWorker } from '../application/plan-scheduled-activation.worker';

function createWorker(sourceStatus: string) {
  const tx = { $executeRawUnsafe: jest.fn(async () => 1) };
  const prisma = {
    $transaction: jest.fn(async (run: (value: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const plans = {
    findUnique: jest.fn(async () => ({
      id: 'next-plan',
      userId: 'user-1',
      title: 'Next plan',
      status: 'SCHEDULED',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T00:00:00.000Z'),
      scheduledActivationAt: new Date('2026-10-01T00:00:00.000Z'),
      activationBlockedAt: null,
      supersedesPlanId: 'source-plan',
      supersedes: {
        id: 'source-plan',
        userId: 'user-1',
        status: sourceStatus,
      },
    })),
    findFirst: jest.fn(async () => null),
    update: jest.fn(async () => ({})),
  };
  const contexts = {
    supersedeContext: jest.fn(async () => undefined),
    ensureContext: jest.fn(async () => undefined),
  };
  const notifications = {
    ensureNotification: jest.fn(async () => undefined),
  };
  const worker = new PlanScheduledActivationWorker(
    prisma as never,
    plans as never,
    contexts as never,
    notifications as never,
  );
  return { worker, plans, contexts, notifications, tx };
}

async function activate(worker: PlanScheduledActivationWorker) {
  await (
    worker as unknown as {
      activate: (planId: string, userId: string) => Promise<void>;
    }
  ).activate('next-plan', 'user-1');
}

describe('PlanScheduledActivationWorker', () => {
  it('atomically supersedes the active source and activates its successor', async () => {
    const { worker, plans, contexts, notifications, tx } =
      createWorker('ACTIVE');

    await activate(worker);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock',
      'user-1',
    );
    expect(plans.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'source-plan' },
        data: expect.objectContaining({ status: 'SUPERSEDED' }),
      }),
      expect.anything(),
    );
    expect(plans.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'next-plan' },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
      expect.anything(),
    );
    expect(contexts.supersedeContext).toHaveBeenCalledTimes(1);
    expect(contexts.ensureContext).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'next-plan', status: 'ACTIVE' }),
    );
    expect(notifications.ensureNotification).not.toHaveBeenCalled();
  });

  it('blocks permanently and notifies when the source was cancelled', async () => {
    const { worker, plans, contexts, notifications } =
      createWorker('CANCELLED');

    await activate(worker);

    expect(plans.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'next-plan' },
        data: expect.objectContaining({
          activationBlockReason: 'SOURCE_PLAN_CANCELLED',
        }),
      }),
      expect.anything(),
    );
    expect(notifications.ensureNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        kind: 'PLAN_ACTIVATION_BLOCKED',
        dedupeKey: 'plan-activation-blocked:next-plan',
      }),
      expect.anything(),
    );
    expect(contexts.ensureContext).not.toHaveBeenCalled();
  });
});
