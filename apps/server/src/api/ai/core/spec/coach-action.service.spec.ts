import { Logger } from '@nestjs/common';
import { CoachActionRiskTier, CoachActionType } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { PMC_INVALIDATE_EVENT } from '@/training-load/events/pmc.events';
import {
  CoachActionService,
  type CoachActionExecResult,
} from '../coach-action.service';

type ActionRow = {
  id: string;
  userId: string;
  type: CoachActionType;
  riskTier: CoachActionRiskTier;
  summary: string;
  forwardData: unknown;
  reverseData: unknown;
  undoUntil: Date | null;
  undoneAt: Date | null;
  messageId: string | null;
  sid: string | null;
  createdAt: Date;
};

function createFixture(startTime = new Date()) {
  const domain = { writes: 0, reversals: 0 };
  let action: ActionRow | null = null;
  let failAuditCreate = false;
  const coachAction = {
    create: jest.fn(async ({ data }: { data: Omit<ActionRow, 'id' | 'createdAt' | 'undoneAt'> }) => {
      if (failAuditCreate) throw new Error('audit write failed');
      action = { ...data, id: 'action-1', undoneAt: null, createdAt: new Date() };
      return action;
    }),
    findUnique: jest.fn(async ({ select }: { select?: unknown } = {}) => {
      if (!action) return null;
      return select
        ? { undoneAt: action.undoneAt, undoUntil: action.undoUntil }
        : action;
    }),
    updateMany: jest.fn(async ({ data }: { data: { undoneAt: Date } }) => {
      if (!action || action.undoneAt || !action.undoUntil) return { count: 0 };
      action.undoneAt = data.undoneAt;
      return { count: 1 };
    }),
  };
  const tx = { coachAction };
  const prisma = {
    coachAction: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const actionSnapshot = action ? { ...action } : null;
      const domainSnapshot = { ...domain };
      try {
        return await callback(tx);
      } catch (error) {
        action = actionSnapshot;
        Object.assign(domain, domainSnapshot);
        throw error;
      }
    }),
  };
  const activityRead = { findFirst: jest.fn(async () => ({ startTime })) };
  const events = { emitAsync: jest.fn(async () => []) };
  const service = new CoachActionService(
    prisma as never,
    activityRead as never,
    {} as never,
    events as never,
  );
  const run = (
    exec: (client: typeof tx) => Promise<CoachActionExecResult<unknown>>,
  ) =>
    service.run({
      userId: 'user-1',
      type: CoachActionType.ACTIVITY_SESSION_RPE,
      riskTier: CoachActionRiskTier.LOW,
      exec: exec as never,
    });
  return {
    service,
    prisma,
    tx,
    coachAction,
    activityRead,
    events,
    domain,
    run,
    setFailAuditCreate: (value: boolean) => (failAuditCreate = value),
    getAction: () => action,
  };
}

function successfulResult(
  afterCommit?: () => Promise<void>,
): CoachActionExecResult<unknown> {
  return {
    forwardData: { activityId: 7, newRpe: 6 },
    reverseData: { activityId: 7, previousRpe: null },
    summary: 'Saved Session RPE',
    payloadForUi: {},
    afterCommit,
  };
}

describe('CoachActionService transactional ledger', () => {
  it('uses one transaction client for the domain write and audit row', async () => {
    const fixture = createFixture();
    const exec = jest.fn(async (tx: typeof fixture.tx) => {
      expect(tx).toBe(fixture.tx);
      fixture.domain.writes += 1;
      return successfulResult();
    });

    await expect(fixture.run(exec)).resolves.toMatchObject({ actionId: 'action-1' });
    expect(fixture.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(fixture.tx);
    expect(fixture.coachAction.create).toHaveBeenCalledTimes(1);
    expect(fixture.domain.writes).toBe(1);
  });

  it('rolls back the domain write when the audit row fails', async () => {
    const fixture = createFixture();
    const afterCommit = jest.fn(async () => undefined);
    fixture.setFailAuditCreate(true);

    await expect(
      fixture.run(async () => {
        fixture.domain.writes += 1;
        return successfulResult(afterCommit);
      }),
    ).rejects.toThrow('audit write failed');
    expect(fixture.domain.writes).toBe(0);
    expect(fixture.getAction()).toBeNull();
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('does not write an audit row when the domain mutation fails', async () => {
    const fixture = createFixture();
    await expect(
      fixture.run(async () => {
        throw new Error('domain write failed');
      }),
    ).rejects.toThrow('domain write failed');
    expect(fixture.coachAction.create).not.toHaveBeenCalled();
    expect(fixture.getAction()).toBeNull();
  });

  it('reports success when afterCommit fails and logs the failure', async () => {
    const fixture = createFixture();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(
      fixture.run(async () =>
        successfulResult(async () => {
          throw new Error('cache unavailable');
        }),
      ),
    ).resolves.toMatchObject({ actionId: 'action-1' });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('afterCommit failed actionId=action-1'),
    );
    warn.mockRestore();
  });
});

describe('CoachActionService transactional undo', () => {
  async function createUndoFixture() {
    const fixture = createFixture();
    await fixture.run(async () => successfulResult());
    return fixture;
  }

  it('allows only one concurrent undo claim', async () => {
    const fixture = await createUndoFixture();
    const handler = jest.fn(async () => {
      fixture.domain.reversals += 1;
    });
    fixture.service.registerUndoHandler(CoachActionType.ACTIVITY_SESSION_RPE, handler);
    const results = await Promise.allSettled([
      fixture.service.undo({ userId: 'user-1', id: 'action-1' }),
      fixture.service.undo({ userId: 'user-1', id: 'action-1' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'ALREADY_UNDONE' }),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rolls back undoneAt when the reverse mutation fails', async () => {
    const fixture = await createUndoFixture();
    fixture.service.registerUndoHandler(
      CoachActionType.ACTIVITY_SESSION_RPE,
      async () => {
        fixture.domain.reversals += 1;
        throw new Error('reverse failed');
      },
    );
    await expect(
      fixture.service.undo({ userId: 'user-1', id: 'action-1' }),
    ).rejects.toThrow('reverse failed');
    expect(fixture.getAction()?.undoneAt).toBeNull();
    expect(fixture.domain.reversals).toBe(0);
  });
});

describe('CoachActionService activity Session RPE refresh window', () => {
  it('最近 60 天内的活动变更会刷新 PMC', async () => {
    const fixture = createFixture(new Date());
    await fixture.run(async () => successfulResult());
    expect(fixture.events.emitAsync).toHaveBeenCalledWith(
      PMC_INVALIDATE_EVENT,
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('超过 60 天的活动变更不会刷新 PMC', async () => {
    const fixture = createFixture(
      new Date(Date.now() - 61 * 24 * 60 * 60 * 1000),
    );
    await fixture.run(async () => successfulResult());
    expect(fixture.events.emitAsync).not.toHaveBeenCalled();
  });
});
