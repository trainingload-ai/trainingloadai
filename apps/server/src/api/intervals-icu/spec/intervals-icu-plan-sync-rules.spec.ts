import { describe, expect, it, jest } from '@jest/globals';
import { IntervalsIcuPlanSyncService } from '../intervals-icu-plan-sync.service';
import { IntervalsIcuApiError } from '@/integrations/intervals-icu/intervals-icu.client';
import { parseIntervalsIcuCalendarEvent } from '../intervals-icu-workout-doc.mapper';
import {
  decidePlanSyncDeletion,
  planSyncChecksum,
} from '../intervals-icu-plan-sync-state';
import { syncChecksum } from '../intervals-icu-workout-checksum.util';

// The fake store implements the Prisma-shaped projections used by the real coordinator.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fixture() {
  const locals = new Map<string, Row>();
  const remotes = new Map<string, Row>();
  const mappings = new Map<string, Row>();
  const connection = {
    id: 'connection',
    userId: 'user',
    externalAthleteId: 'i42',
    status: 'ACTIVE',
    credentialCiphertext: 'test',
    metadata: {
      planSync: { syncPlannedWorkouts: true, exportPlannedWorkouts: true },
    },
  };
  let clock = 0;
  let localSequence = 0;
  const tick = () => new Date(Date.UTC(2026, 6, 1, 0, 0, ++clock));
  const remote = (id = '100', extra: Row = {}): Row => ({
    id,
    athlete_id: 'i42',
    category: 'WORKOUT',
    type: 'Run',
    name: 'Easy run',
    start_date_local: '2026-07-06T00:00:00',
    description: null,
    workout_doc: { steps: [{ duration: 1800, text: 'Run' }] },
    ...extra,
  });
  const makeLocal = (id = 'local', extra: Row = {}): Row => ({
    id,
    userId: 'user',
    createdAt: tick(),
    updatedAt: tick(),
    revision: 1,
    name: 'Easy run',
    notes: null,
    text: 'Run',
    sportType: 'RUN',
    sportDefinitionCode: 'ROAD_RUNNING',
    scheduledDate: new Date('2026-07-06T00:00:00Z'),
    status: 'PLANNED',
    planId: null,
    steps: parseIntervalsIcuCalendarEvent(remote() as never)!.blocks,
    ...extra,
  });
  const findMapping = ({ where }: Row) =>
    [...mappings.values()].find(
      (m) =>
        (!where.planWorkoutId || m.planWorkoutId === where.planWorkoutId) &&
        (!where.externalEventId ||
          typeof where.externalEventId !== 'string' ||
          m.externalEventId === where.externalEventId),
    ) ?? null;
  const plan = {
    findMapping: jest.fn(async (args: Row) => findMapping(args)),
    findMappingUnique: jest.fn(
      async ({ where }: Row) => mappings.get(where.id) ?? null,
    ),
    findMappings: jest.fn(async ({ where }: Row) =>
      [...mappings.values()].filter((m) => {
        if (where.OR) return !m.planWorkoutId || m.localDeletedAt;
        if (where.planWorkout?.OR) return false;
        if (where.planWorkout)
          return Boolean(m.planWorkoutId && locals.has(m.planWorkoutId));
        return true;
      }),
    ),
    createMapping: jest.fn(async ({ data }: Row) => {
      const m = { id: `mapping-${mappings.size + 1}`, ...data };
      mappings.set(m.id, m);
      return m;
    }),
    updateMapping: jest.fn(async ({ where, data }: Row) => {
      const m = mappings.get(where.id)!;
      Object.assign(m, data);
      return m;
    }),
    findLocalWorkout: jest.fn(
      async (_user: string, id: string) => locals.get(id) ?? null,
    ),
    findExportWindowWorkouts: jest.fn(async () => [...locals.values()]),
    createIndependentWorkout: jest.fn(async (args: Row) => {
      const row = makeLocal(`local-${++localSequence}`, {
        ...args,
        steps: args.blocks,
      });
      locals.set(row.id, row);
      return row;
    }),
    updateImportedWorkout: jest.fn(async (args: Row) => {
      const row = locals.get(args.workoutId)!;
      Object.assign(row, {
        name: args.name,
        notes: args.notes,
        scheduledDate: args.scheduledDate,
        steps: args.blocks,
        updatedAt: tick(),
        revision: row.revision + 1,
      });
      return row;
    }),
    deleteSyncedWorkout: jest.fn(async ({ workoutId }: Row) => {
      locals.delete(workoutId);
      for (const m of mappings.values())
        if (m.planWorkoutId === workoutId) m.planWorkoutId = null;
      return 'deleted';
    }),
  };
  const client = {
    listEvents: jest.fn(async () => [...remotes.values()]),
    getEvent: jest.fn(async (_key: unknown, id: string) => {
      if (!remotes.has(id)) throw new IntervalsIcuApiError(404, 'Not Found');
      return remotes.get(id)!;
    }),
    createEventsBulk: jest.fn(async (_key: unknown, payloads: Row[]) =>
      payloads.map((p) => {
        const existing = [...remotes.values()].find(
          (r) => r.external_id === p.external_id,
        );
        const r = remote(existing?.id ?? `new-${remotes.size + 1}`, p);
        remotes.set(String(r.id), r);
        return r;
      }),
    ),
    updateEvent: jest.fn(async (_key: unknown, id: string, payload: Row) => {
      const r = { ...remotes.get(id)!, ...payload };
      remotes.set(id, r);
      return r;
    }),
    deleteEvent: jest.fn(async (_key: unknown, id: string) => {
      remotes.delete(id);
    }),
  };
  const workouts = {
    parseFile: jest.fn(async () => ({
      block: parseIntervalsIcuCalendarEvent(remote() as never)!.blocks,
      plan: 'Run',
    })),
    buildPlanBlocksFromWorkoutSteps: jest.fn((steps: unknown[]) => steps),
    stringifyPlan: jest.fn(() => 'Run'),
    buildFITFromPlan: jest.fn(async () => Uint8Array.from([1])),
  };
  const providers = {
    model: () => ({
      findUnique: jest.fn(async () => connection),
      update: jest.fn(async ({ data }: Row) => {
        Object.assign(connection, data);
        return connection;
      }),
    }),
  };
  const catalog = {
    fromProvider: jest.fn(async () => ({ sport: { code: 'ROAD_RUNNING' } })),
    resolve: jest.fn(async () => ({ code: 'ROAD_RUNNING' })),
    toProvider: jest.fn(async () => ({
      externalCode: 'RUN',
      metadata: { apiType: 'Run' },
      sport: { fitSport: 'running', fitSubSport: 'generic' },
    })),
  };
  const service = new IntervalsIcuPlanSyncService(
    {} as never,
    client as never,
    { resolveConnectionCredential: () => 'key' } as never,
    workouts as never,
    catalog as never,
    plan as never,
    providers as never,
    {
      run: (_id: string, work: () => Promise<unknown>) => work(),
      assertHeld: () => undefined,
    } as never,
  );
  const sync = async () => {
    const result = await service.syncConnectionWeek({
      userId: 'user',
      connection,
      credential: 'key',
      weekStart: '2026-07-06',
      trigger: 'manual',
    });
    expect(result.import?.failed ?? 0).toBe(0);
    expect(result.export?.failed ?? 0).toBe(0);
    return result;
  };
  const webhook = (events: Row[] = [], deleted: string[] = []) =>
    service.handleCalendarWebhookEvent({
      userId: 'user',
      connection,
      calendarEvents: events,
      deletedEvents: deleted,
    });
  const establish = async () => {
    remotes.set('100', remote());
    await sync();
    client.updateEvent.mockClear();
    client.createEventsBulk.mockClear();
    return {
      local: [...locals.values()][0],
      mapping: [...mappings.values()][0],
    };
  };
  return {
    locals,
    remotes,
    mappings,
    connection,
    plan,
    client,
    service,
    remote,
    makeLocal,
    sync,
    webhook,
    establish,
  };
}

describe('Intervals.icu bidirectional planned workout rules', () => {
  it('imports a new remote workout once, without echoing it back', async () => {
    const f = fixture();
    await f.establish();
    await f.sync();
    expect(f.locals.size).toBe(1);
    expect(f.mappings.size).toBe(1);
    expect(f.client.updateEvent).not.toHaveBeenCalled();
    expect(f.client.createEventsBulk).not.toHaveBeenCalled();
  });

  it('exports a new local workout once and consumes its echo', async () => {
    const f = fixture();
    f.locals.set('local', f.makeLocal());
    await f.sync();
    await f.sync();
    expect(f.client.createEventsBulk).toHaveBeenCalledTimes(1);
    expect(f.locals.size).toBe(1);
    expect(f.remotes.size).toBe(1);
  });

  it('imports remote edits into the same local identity', async () => {
    const f = fixture();
    const { local } = await f.establish();
    f.remotes.get('100')!.name = 'Remote edit';
    await f.sync();
    expect(f.locals.get(local.id)!.name).toBe('Remote edit');
    expect(f.locals.size).toBe(1);
    expect(f.client.updateEvent).not.toHaveBeenCalled();
  });

  it('exports local edits into the same remote identity', async () => {
    const f = fixture();
    const { local } = await f.establish();
    local.name = 'Local edit';
    await f.sync();
    expect(f.remotes.get('100')!.name).toBe('Local edit');
    expect(f.client.updateEvent).toHaveBeenCalledTimes(1);
  });

  it('uses B for simultaneous edits during B -> A, including the scheduled import-first flow', async () => {
    const f = fixture();
    const { local } = await f.establish();
    local.name = 'Local edit';
    f.remotes.get('100')!.name = 'Remote edit';
    await f.sync();
    expect(local.name).toBe('Remote edit');
    expect(f.client.updateEvent).not.toHaveBeenCalled();
  });

  it('uses A for simultaneous edits during A -> B', async () => {
    const f = fixture();
    const { local } = await f.establish();
    f.connection.metadata.planSync.syncPlannedWorkouts = false;
    local.name = 'Local edit';
    f.remotes.get('100')!.name = 'Remote edit';
    await f.sync();
    expect(f.remotes.get('100')!.name).toBe('Local edit');
  });

  it.each(['LOCAL', 'REMOTE'])(
    'propagates remote deletion of an unchanged %s-origin workout',
    async (origin) => {
      const f = fixture();
      const { mapping } = await f.establish();
      mapping.origin = origin;
      f.remotes.delete('100');
      await f.webhook([], ['100']);
      await f.sync();
      expect(f.locals.size).toBe(0);
      expect(mapping.localDeletedAt).toBeTruthy();
      expect(f.client.updateEvent).not.toHaveBeenCalled();
      expect(f.client.createEventsBulk).not.toHaveBeenCalled();
    },
  );

  it('keeps and detaches a locally modified survivor without recreating the remote', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    local.name = 'Keep this edit';
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    await f.sync();
    await f.sync();
    expect(f.locals.get(local.id)!.name).toBe('Keep this edit');
    expect(mapping.metadata.survivor).toBe('local');
    expect(f.client.createEventsBulk).not.toHaveBeenCalled();
    expect(f.client.updateEvent).not.toHaveBeenCalled();
  });

  it.each(['LOCAL', 'REMOTE'])(
    'propagates local deletion of an unchanged %s-origin workout',
    async (origin) => {
      const f = fixture();
      const { local, mapping } = await f.establish();
      mapping.origin = origin;
      f.locals.delete(local.id);
      mapping.planWorkoutId = null;
      await f.sync();
      await f.sync();
      expect(f.remotes.size).toBe(0);
      expect(f.locals.size).toBe(0);
      expect(f.client.deleteEvent).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps and detaches a remotely modified survivor without recreating the local', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    f.locals.delete(local.id);
    mapping.planWorkoutId = null;
    f.remotes.get('100')!.name = 'Keep remote edit';
    await f.sync();
    await f.sync();
    expect(f.remotes.get('100')!.name).toBe('Keep remote edit');
    expect(f.locals.size).toBe(0);
    expect(mapping.metadata.survivor).toBe('remote');
    expect(f.client.deleteEvent).not.toHaveBeenCalled();
  });

  it('closes a relationship when both endpoints are already gone', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    f.locals.delete(local.id);
    mapping.planWorkoutId = null;
    f.remotes.delete('100');
    await f.sync();
    expect(mapping.metadata.relationClosedAt).toBeTruthy();
    expect(f.client.deleteEvent).not.toHaveBeenCalled();
  });

  it('does not equate a moved-out-of-window workout with a deletion', async () => {
    const f = fixture();
    const { local } = await f.establish();
    f.remotes.get('100')!.start_date_local = '2026-08-01T00:00:00';
    f.client.listEvents.mockResolvedValue([]);
    await f.sync();
    expect(local.scheduledDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(f.plan.deleteSyncedWorkout).not.toHaveBeenCalled();
  });

  it('imports a recreated same-name/date/content workout as a new identity, even with the same UID', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    f.remotes.set('200', f.remote('200', { uid: 'reused' }));
    await f.webhook([f.remote('200')]);
    await f.sync();
    expect(f.locals.size).toBe(1);
    expect(f.mappings.size).toBe(2);
    expect(mapping.metadata.relationClosedAt).toBeTruthy();
  });

  it('ignores a delayed update notification after deletion', async () => {
    const f = fixture();
    await f.establish();
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    await f.webhook([f.remote()]);
    expect(f.locals.size).toBe(0);
    expect(f.client.createEventsBulk).not.toHaveBeenCalled();
  });

  it('checks live remote state before accepting an old deletion notification', async () => {
    const f = fixture();
    await f.establish();
    await f.webhook([], ['100']);
    expect(f.locals.size).toBe(1);
    expect(f.plan.deleteSyncedWorkout).not.toHaveBeenCalled();
  });

  it('preserves a remote edit made between initial verification and deletion', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    f.locals.delete(local.id);
    mapping.planWorkoutId = null;
    f.client.getEvent.mockResolvedValueOnce(
      f.remote('100', { name: 'Concurrent edit' }),
    );
    await f.sync();
    expect(f.client.deleteEvent).not.toHaveBeenCalled();
    expect(mapping.metadata.survivor).toBe('remote');
  });

  it('preserves local history protected by the plan domain', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    f.plan.deleteSyncedWorkout.mockResolvedValue('protected');
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    expect(f.locals.size).toBe(1);
    expect(mapping.metadata.detachedReason).toBe('LOCAL_HISTORY_PROTECTED');
  });

  it('treats a changed local revision during deletion as a survivor', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    f.plan.deleteSyncedWorkout.mockResolvedValue('changed');
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    expect(mapping.metadata.survivor).toBe('local');
  });

  it('retries unavailable remote state without deleting or detaching', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    f.client.getEvent.mockRejectedValue(
      new IntervalsIcuApiError(503, 'Unavailable'),
    );
    await expect(f.webhook([], ['100'])).rejects.toThrow('Unavailable');
    expect(mapping.metadata.relationClosedAt).toBeUndefined();
    expect(f.plan.deleteSyncedWorkout).not.toHaveBeenCalled();
  });

  it('keeps the inspected push baseline if a local edit arrives while provider I/O is running', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    local.name = 'First edit';
    f.client.updateEvent.mockImplementationOnce(async (_key, id, payload) => {
      const r = { ...f.remotes.get(id)!, ...payload };
      f.remotes.set(id, r);
      f.locals.set(local.id, { ...local, name: 'Later edit', revision: 2 });
      return r;
    });
    await f.sync();
    expect(mapping.syncState).toBe('LOCAL_CHANGED');
    await f.sync();
    expect(f.remotes.get('100')!.name).toBe('Later edit');
  });

  it('does not mutate remote workouts when export is disabled', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    f.connection.metadata.planSync.exportPlannedWorkouts = false;
    f.locals.delete(local.id);
    mapping.planWorkoutId = null;
    await f.sync();
    expect(f.remotes.size).toBe(1);
    expect(f.locals.size).toBe(0);
    expect(f.client.deleteEvent).not.toHaveBeenCalled();
  });

  it('does not delete local workouts when import is disabled', async () => {
    const f = fixture();
    await f.establish();
    f.connection.metadata.planSync.syncPlannedWorkouts = false;
    f.remotes.delete('100');
    await f.sync();
    expect(f.locals.size).toBe(1);
    expect(f.client.createEventsBulk).not.toHaveBeenCalled();
  });

  it('ends an old REMOTE_DELETED mapping during the next scan rather than retrying its PUT', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    mapping.remoteDeletedAt = new Date();
    mapping.syncState = 'REMOTE_DELETED';
    f.remotes.delete('100');
    await f.sync();
    expect(f.locals.size).toBe(0);
    expect(f.client.updateEvent).not.toHaveBeenCalled();
  });

  it('preserves a local survivor when a historical baseline is missing', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    mapping.lastLocalChecksum = null;
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    expect(f.locals.size).toBe(1);
    expect(mapping.metadata.survivor).toBe('local');
  });

  it('preserves a remote survivor when a historical baseline is missing', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    mapping.lastRemoteChecksum = null;
    f.locals.delete(local.id);
    mapping.planWorkoutId = null;
    await f.sync();
    expect(f.remotes.size).toBe(1);
    expect(f.locals.size).toBe(0);
    expect(mapping.metadata.survivor).toBe('remote');
  });

  it('upgrades known legacy baselines without pretending the creation timestamp changed', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    mapping.metadata.syncVersion = 1;
    const legacy = syncChecksum({
      scheduledDate: '2026-07-06',
      sportType: 'RUN',
      subSportType: 'ROAD_RUNNING',
      name: local.name,
      notes: null,
      blocks: local.steps,
    });
    mapping.lastLocalChecksum = legacy;
    mapping.lastRemoteChecksum = legacy;
    await f.sync();
    expect(mapping.metadata.syncVersion).toBe(2);
    expect(f.client.updateEvent).not.toHaveBeenCalled();
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    expect(f.locals.size).toBe(0);
  });

  it('includes the local creation timestamp when deciding whether deletion may propagate', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    local.createdAt = new Date('2026-07-02T00:00:00Z');
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    expect(f.locals.size).toBe(1);
    expect(mapping.metadata.survivor).toBe('local');
  });

  it('never creates a new remote after an event disappears during its PUT', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    local.name = 'Unsynced local edit';
    f.client.updateEvent.mockImplementationOnce(async () => {
      f.remotes.delete('100');
      throw new IntervalsIcuApiError(404, 'Not Found');
    });
    await f.sync();
    await f.sync();
    expect(mapping.metadata.survivor).toBe('local');
    expect(f.client.createEventsBulk).not.toHaveBeenCalled();
  });

  it('rejects mappings belonging to a different provider account', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    mapping.externalAthleteId = 'i999';
    f.remotes.delete('100');
    await expect(f.webhook([], ['100'])).rejects.toThrow(
      'INTERVALS_PLAN_ACCOUNT_MISMATCH',
    );
    expect(f.locals.size).toBe(1);
    expect(mapping.metadata.relationClosedAt).toBeUndefined();
  });

  it('propagates authentication failures without clearing the relationship', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    f.client.getEvent.mockRejectedValue(
      new IntervalsIcuApiError(403, 'Forbidden'),
    );
    await expect(f.webhook([], ['100'])).rejects.toThrow('Forbidden');
    expect(mapping.metadata.relationClosedAt).toBeUndefined();
  });

  it('recovers a remote create accepted before a failed readback without creating a duplicate', async () => {
    const f = fixture();
    f.locals.set('local', f.makeLocal());
    f.client.getEvent.mockRejectedValueOnce(
      new IntervalsIcuApiError(503, 'Unavailable'),
    );
    const result = await f.service.syncConnectionWeek({
      userId: 'user',
      connection: f.connection,
      credential: 'key',
      weekStart: '2026-07-06',
      trigger: 'manual',
    });
    expect(result.outcome).toBe('PARTIAL_FAILURE');
    expect(result.export!.failed).toBe(1);
    await f.sync();
    expect(f.remotes.size).toBe(1);
    expect(f.locals.size).toBe(1);
    expect(f.client.createEventsBulk).toHaveBeenCalledTimes(1);
  });
  it('does not propagate a legacy false deletion when the remote event still exists', async () => {
    const f = fixture();
    const { mapping } = await f.establish();
    mapping.remoteDeletedAt = new Date();
    mapping.syncState = 'REMOTE_DELETED';
    await f.sync();
    expect(f.locals.size).toBe(1);
    expect(mapping.remoteDeletedAt).toBeNull();
    expect(f.plan.deleteSyncedWorkout).not.toHaveBeenCalled();
  });
  it('does not reconnect a recreated event carrying the old application key', async () => {
    const f = fixture();
    const { local, mapping } = await f.establish();
    const key = `trainingload.ai:plan_workout:${local.id}`;
    mapping.origin = 'LOCAL';
    mapping.externalSourceKey = key;
    f.remotes.delete('100');
    await f.webhook([], ['100']);
    f.remotes.set(
      '200',
      f.remote('200', { external_id: key, uid: key + '@trainingload.ai' }),
    );
    await f.webhook([f.remote('200')]);
    const next = [...f.mappings.values()].find(
      (m) => m.externalEventId === '200',
    )!;
    expect(next.planWorkoutId).not.toBe(local.id);
    expect(next.externalSourceKey).toBeNull();
    expect(next.origin).toBe('REMOTE');
    expect(mapping.metadata.relationClosedAt).toBeTruthy();
  });
});

describe('creation identity in synchronization checksums', () => {
  it('includes creation time even when all content and the object ID match', () => {
    const args = { id: 'local', contentChecksum: 'same-content' };
    expect(
      planSyncChecksum({ ...args, createdAt: '2026-01-01T00:00:00Z' }),
    ).not.toBe(
      planSyncChecksum({ ...args, createdAt: '2026-01-02T00:00:00Z' }),
    );
  });
  it('includes remote event identity when the provider supplies no creation timestamp', () => {
    expect(
      planSyncChecksum({ id: '100', createdAt: null, contentChecksum: 'same' }),
    ).not.toBe(
      planSyncChecksum({ id: '200', createdAt: null, contentChecksum: 'same' }),
    );
  });
  it('does not authorize deleting a survivor without a verified baseline', () => {
    expect(decidePlanSyncDeletion({ exists: true, currentChecksum: 'x' })).toBe(
      'detach',
    );
  });
});
