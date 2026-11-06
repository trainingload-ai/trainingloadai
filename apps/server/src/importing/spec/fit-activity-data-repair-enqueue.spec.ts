jest.mock('../trackswap-file', () => ({ decodeTrackFile: jest.fn() }));

import {
  FitActivityDataRepairService,
  type FitActivityRepairCandidate,
} from '../fit-activity-data-repair.service';

function candidate(index: number, count = 1, extra = '') {
  const payloads = Array.from({ length: count }, (_, n) => ({
    source: { sourceUid: `source-${index}-${n}` },
    summary: { name: extra },
    records: [{ timestamp: index, heartRate: 140 }],
  }));
  return {
    sourceObjectId: `object-${index}`,
    userId: 'athlete-1',
    sourceKind: 'FILE',
    sourceUid: `object-${index}`,
    fileName: `${index}.fit`,
    payloads,
    reasons: [],
    repairs: Object.fromEntries(
      payloads.map((p) => [p.source.sourceUid, { migrationId: 'migration-1' }]),
    ),
  } as unknown as FitActivityRepairCandidate;
}

function harness() {
  let state = {
    batches: [] as any[],
    items: [] as any[],
    events: [] as any[],
    ledger: [] as string[],
  };
  const sizes: number[] = [];
  let failLedger = 0;
  let transactions = 0;
  let insideTransaction = false;
  const prisma = {
    $transaction: jest.fn(async (run: (tx: any) => Promise<unknown>) => {
      const draft = structuredClone(state);
      const number = ++transactions;
      const before = draft.items.length;
      const tx = {
        draft,
        $queryRaw: async () => [],
        activityDataMigration: {
          findFirst: async () => ({ id: 'migration' }),
          findUniqueOrThrow: async () => ({ importBatchIds: draft.ledger }),
          update: async ({ data }: any) => {
            if (failLedger === number) throw Error('LEDGER_WRITE_FAILED');
            draft.ledger = data.importBatchIds;
          },
        },
        importEventLog: {
          create: async ({ data }: any) => {
            draft.events.push(data);
          },
        },
      };
      insideTransaction = true;
      try {
        const result = await run(tx);
        state = draft;
        sizes.push(draft.items.length - before);
        return result;
      } finally {
        insideTransaction = false;
      }
    }),
  };
  const jobs = {
    batchJobs: (tx: any) => ({
      create: async ({ data }: any) => {
        const row = { ...data, id: `batch-${tx.draft.batches.length}` };
        tx.draft.batches.push(row);
        return row;
      },
    }),
    itemJobs: (tx: any) => ({
      findMany: async ({ where }: any) =>
        tx.draft.items.filter((item: any) =>
          where.sourceObjectId.in.includes(item.sourceObjectId),
        ),
      create: async ({ data }: any) => {
        const row = { ...data, id: `item-${tx.draft.items.length}` };
        tx.draft.items.push(row);
        return row;
      },
    }),
  };
  return {
    service: new FitActivityDataRepairService(
      prisma as never,
      {} as never,
      jobs as never,
    ),
    prisma,
    sizes,
    state: () => state,
    failLedgerAt: (n: number) => {
      failLedger = n;
    },
    insideTransaction: () => insideTransaction,
  };
}

describe('bounded repair task registration', () => {
  it('registers a full scan page in sequential, bounded transactions', async () => {
    const h = harness();
    const result = await h.service.enqueue(
      Array.from({ length: 25 }, (_, i) => candidate(i)),
    );
    expect(h.sizes).toEqual([5, 5, 5, 5, 5]);
    expect(result).toEqual({
      batchIds: h.state().ledger,
      queued: 25,
      skippedActive: 0,
    });
    expect(h.state().batches).toHaveLength(5);
    expect(h.state().events).toHaveLength(25);
    expect(
      h.prisma.$transaction.mock.calls.every(
        (args: any[]) =>
          args[1]?.timeout === 30_000 && args[1]?.maxWait === 5000,
      ),
    ).toBe(true);
  });

  it('budgets payload bytes before taking a transaction lock', async () => {
    const h = harness();
    const sources = [
      candidate(1, 1, 'a'.repeat(4 * 1024 * 1024)),
      candidate(2, 1, 'b'.repeat(4 * 1024 * 1024)),
    ];
    for (const source of sources)
      Object.defineProperty(source.payloads[0].summary, 'name', {
        get: () => {
          expect(h.insideTransaction()).toBe(false);
          return 'a'.repeat(4 * 1024 * 1024);
        },
      });
    await h.service.enqueue(sources);
    expect(h.sizes).toEqual([1, 1]);
  });

  it('keeps every activity of an oversized source together without truncation', async () => {
    const h = harness();
    const large = candidate(2, 7, 'a'.repeat(2 * 1024 * 1024));
    await h.service.enqueue([candidate(1), large, candidate(3)]);
    expect(h.sizes).toEqual([1, 7, 1]);
    const items = h
      .state()
      .items.filter((i) => i.sourceObjectId === large.sourceObjectId);
    expect(new Set(items.map((i) => i.batchJobId)).size).toBe(1);
    expect(items.map((i) => i.sourceRef.payload)).toEqual(large.payloads);
  });

  it('keeps users, source kinds and migration ledgers in separate batches', async () => {
    const h = harness();
    const second = candidate(2);
    second.userId = 'athlete-2';
    const third = candidate(3);
    third.sourceKind = 'INTERVALS_ICU';
    const fourth = candidate(4);
    Object.values(fourth.repairs!)[0].migrationId = 'migration-2';
    await h.service.enqueue([candidate(1), second, third, fourth]);
    expect(h.sizes).toEqual([1, 1, 1, 1]);
  });

  it('rolls back the failed batch and resumes without duplicating committed sources', async () => {
    const h = harness();
    const inputs = Array.from({ length: 12 }, (_, i) => candidate(i));
    h.failLedgerAt(2);
    await expect(h.service.enqueue(inputs)).rejects.toThrow(
      'LEDGER_WRITE_FAILED',
    );
    expect(h.state().items).toHaveLength(5);
    expect(h.state().events).toHaveLength(5);
    expect(h.state().ledger).toEqual(['batch-0']);
    const result = await h.service.enqueue(inputs);
    expect(result).toEqual({
      batchIds: ['batch-1', 'batch-2'],
      queued: 7,
      skippedActive: 5,
    });
    expect(h.state().items).toHaveLength(12);
    expect(h.state().events).toHaveLength(12);
    expect(h.state().ledger).toEqual(['batch-0', 'batch-1', 'batch-2']);
    expect(new Set(h.state().items.map((i) => i.sourceObjectId)).size).toBe(12);
  });

  it('fails closed before writing when a source mixes migration identities', async () => {
    const h = harness(),
      source = candidate(1, 2);
    Object.values(source.repairs!)[1].migrationId = 'another-migration';
    await expect(h.service.enqueue([source])).rejects.toThrow(
      'ACTIVITY_DATASET_REPAIR_MIGRATION_CONFLICT',
    );
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires migration authorization for every payload before the first write', async () => {
    const h = harness(),
      source = candidate(1, 2);
    delete source.repairs![source.payloads[1].source.sourceUid];
    await expect(h.service.enqueue([candidate(0), source])).rejects.toThrow(
      'ACTIVITY_DATASET_REPAIR_MIGRATION_REQUIRED',
    );
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
});
