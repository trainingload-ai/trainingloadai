import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '@/prisma/prisma.service';
import { PrismaAthleteMemoryStore } from './prisma-athlete-memory.store';
import type { MemoryOperation } from '../../domain/memory-operation';

describe('Athlete Memory PostgreSQL invariants', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let store: PrismaAthleteMemoryStore;

  beforeAll(async () => {
    database = fork(
      resolve(__dirname, '../../../api/ai/core/spec/coach-run-postgres.mjs'),
      [],
      { execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
    );
    const address = await new Promise<string>((resolveAddress, reject) => {
      database.once('message', (value: { address: string }) =>
        resolveAddress(value.address),
      );
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${address}/postgres?connection_limit=1&sslmode=disable`,
    });
    await prisma.$connect();
    store = new PrismaAthleteMemoryStore(prisma as PrismaService);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null) {
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
    }
  });

  beforeEach(async () => {
    await prisma.$disconnect();
    await prisma.$connect();
    await prisma.aiCoachSession.deleteMany();
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
  });

  async function source(userId: string, suffix = '') {
    await prisma.$executeRawUnsafe(
      `INSERT INTO t_user(id) VALUES ('${userId.replace(/'/g, "''")}') ON CONFLICT (id) DO NOTHING`,
    );
    const sessionId = `session${suffix}`;
    const messageId = `message${suffix}`;
    await prisma.aiCoachSession.create({
      data: { userId, id: sessionId, lang: 'zh' },
    });
    const message = await prisma.aiCoachMessage.create({
      data: {
        id: messageId,
        userId,
        sessionId,
        role: 'USER',
        content: '昨晚没睡好',
        sequence: 1,
      },
    });
    const job = await prisma.aiCoachMemoryExtractionJob.create({
      data: {
        userId,
        sessionId,
        sourceMessageId: messageId,
        policyVersion: 'athlete-memory-v1',
        status: 'RUNNING',
        leaseOwner: 'test-worker',
      },
    });
    return { message, job };
  }

  const createOperation: MemoryOperation = {
    operation: 'CREATE',
    kind: 'OBSERVATION',
    category: 'sleep_quality',
    claim: '用户主观认为昨晚睡眠质量较差',
    eventStart: '2026-10-10T12:00:00.000Z',
    eventEnd: '2026-10-11T01:15:00.000Z',
    timeText: '昨晚',
    timePrecision: 'APPROXIMATE',
    epistemicStatus: 'USER_ASSERTED',
    confidence: 0.96,
    decayProfile: 'ACUTE_RECOVERY',
    reasonCode: 'NEW_FUTURE_VALUE',
  };

  it('atomically applies fact, evidence, event and terminal job status', async () => {
    const { message, job } = await source('athlete-a');
    const input = {
      jobId: job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    };
    await expect(store.applyOperations(input)).resolves.toEqual({
      applied: 1,
      idempotent: false,
    });
    expect(await prisma.athleteMemoryFact.count()).toBe(1);
    expect(await prisma.athleteMemoryEvidence.count()).toBe(1);
    expect(await prisma.athleteMemoryEvent.count()).toBe(1);
    expect(
      await prisma.aiCoachMemoryExtractionJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'SUCCEEDED' });

    await expect(store.applyOperations(input)).resolves.toEqual({
      applied: 0,
      idempotent: true,
    });
    expect(await prisma.athleteMemoryFact.count()).toBe(1);
    expect(await prisma.athleteMemoryEvent.count()).toBe(1);
  });

  it('rejects cross-user targets and preserves the original fact', async () => {
    const first = await source('athlete-a', '-a');
    await store.applyOperations({
      jobId: first.job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: first.message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: first.message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    });
    const fact = await prisma.athleteMemoryFact.findFirstOrThrow({
      where: { userId: 'athlete-a' },
    });
    const second = await source('athlete-b', '-b');
    const operation: MemoryOperation = {
      operation: 'CORROBORATE',
      targetFactId: fact.id,
      reasonCode: 'DUPLICATE_EVIDENCE',
    };
    await expect(
      store.applyOperations({
        jobId: second.job.id,
        leaseOwner: 'test-worker',
        userId: 'athlete-b',
        sourceMessageId: second.message.id,
        sourceHash: 'b'.repeat(64),
        assertedAt: second.message.createdAt,
        timezone: 'Asia/Shanghai',
        model: 'test-model',
        policyVersion: 'athlete-memory-v1',
        decision: { operations: [operation] },
        operations: [operation],
      }),
    ).rejects.toThrow('does not belong to user');
    expect(
      await prisma.athleteMemoryFact.count({ where: { userId: 'athlete-b' } }),
    ).toBe(0);
    expect(
      await store.findFacts({
        userId: 'athlete-b',
        statuses: ['ACTIVE'],
        take: 20,
      }),
    ).toEqual([]);
  });

  it('uses optimistic versions for deterministic user correction', async () => {
    const { message, job } = await source('athlete-a');
    await store.applyOperations({
      jobId: job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    });
    const fact = await prisma.athleteMemoryFact.findFirstOrThrow();
    const corrected = await store.correctFact({
      userId: 'athlete-a',
      factId: fact.id,
      expectedVersion: 1,
      claim: '用户确认昨晚实际睡得很好',
    });
    expect(corrected).toMatchObject({
      version: 2,
      epistemicStatus: 'USER_CONFIRMED',
      confidence: 1,
    });
    await expect(
      store.correctFact({
        userId: 'athlete-a',
        factId: fact.id,
        expectedVersion: 1,
        claim: '过期并发写入',
      }),
    ).rejects.toThrow('version conflict');
  });

  it('rejects a stale worker lease before writing facts', async () => {
    const { message, job } = await source('athlete-a');

    await expect(
      store.applyOperations({
        jobId: job.id,
        leaseOwner: 'stale-worker',
        userId: 'athlete-a',
        sourceMessageId: message.id,
        sourceHash: 'a'.repeat(64),
        assertedAt: message.createdAt,
        timezone: 'Asia/Shanghai',
        model: 'test-model',
        policyVersion: 'athlete-memory-v1',
        decision: { operations: [createOperation] },
        operations: [createOperation],
      }),
    ).rejects.toThrow('active worker lease');
    expect(await prisma.athleteMemoryFact.count()).toBe(0);
  });

  it('keeps an explicit user correction after its original chat source is removed', async () => {
    const { message, job } = await source('athlete-a');
    await store.applyOperations({
      jobId: job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    });
    const fact = await prisma.athleteMemoryFact.findFirstOrThrow();
    await store.correctFact({
      userId: 'athlete-a',
      factId: fact.id,
      expectedVersion: 1,
      claim: '用户确认昨晚实际睡得很好',
    });

    await store.retractSources({
      userId: 'athlete-a',
      sourceMessageIds: [message.id],
      policyVersion: 'test-source-delete',
    });

    expect(
      await prisma.athleteMemoryFact.findUniqueOrThrow({
        where: { id: fact.id },
        select: { status: true, epistemicStatus: true, confidence: true },
      }),
    ).toEqual({
      status: 'ACTIVE',
      epistemicStatus: 'USER_CONFIRMED',
      confidence: 1,
    });
    expect(await prisma.athleteMemoryEvidence.count()).toBe(0);
  });

  it('reactivates an independently supported predecessor when its replacement source is removed', async () => {
    const first = await source('athlete-a', '-original');
    await store.applyOperations({
      jobId: first.job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: first.message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: first.message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    });
    const original = await prisma.athleteMemoryFact.findFirstOrThrow({
      where: { userId: 'athlete-a' },
    });
    const second = await source('athlete-a', '-replacement');
    const supersede: MemoryOperation = {
      operation: 'SUPERSEDE',
      targetFactId: original.id,
      replacement: {
        ...createOperation,
        claim: '用户后来确认昨晚睡眠质量良好',
        epistemicStatus: 'USER_ASSERTED',
      },
      reasonCode: 'USER_CORRECTION',
    };
    await store.applyOperations({
      jobId: second.job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: second.message.id,
      sourceHash: 'b'.repeat(64),
      assertedAt: second.message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [supersede] },
      operations: [supersede],
    });
    const replacement = await prisma.athleteMemoryFact.findFirstOrThrow({
      where: { userId: 'athlete-a', id: { not: original.id } },
    });

    await store.retractSources({
      userId: 'athlete-a',
      sourceMessageIds: [second.message.id],
      policyVersion: 'test-source-delete',
    });

    expect(
      await prisma.athleteMemoryFact.findUniqueOrThrow({
        where: { id: original.id },
        select: { status: true, supersededById: true },
      }),
    ).toEqual({ status: 'ACTIVE', supersededById: null });
    expect(
      await prisma.athleteMemoryFact.findUniqueOrThrow({
        where: { id: replacement.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'RETRACTED' });
    expect(
      await prisma.athleteMemoryEvent.count({
        where: { factId: original.id, operation: 'REACTIVATE' },
      }),
    ).toBe(1);
  });

  it('rejects a pagination cursor owned by another user', async () => {
    const first = await source('athlete-a', '-a');
    await store.applyOperations({
      jobId: first.job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: first.message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: first.message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    });
    const foreignCursor = await prisma.athleteMemoryFact.findFirstOrThrow({
      where: { userId: 'athlete-a' },
      select: { id: true },
    });
    await source('athlete-b', '-b');

    await expect(
      store.listFacts({
        userId: 'athlete-b',
        take: 20,
        cursor: foreignCursor.id,
      }),
    ).rejects.toThrow('cursor is invalid');
  });

  it('clears facts, provenance, audit and extraction decisions but keeps Coach messages', async () => {
    const { message, job } = await source('athlete-a');
    await store.applyOperations({
      jobId: job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    });

    await expect(store.deleteAllForUser('athlete-a')).resolves.toBe(1);
    expect(await prisma.athleteMemoryFact.count()).toBe(0);
    expect(await prisma.athleteMemoryEvidence.count()).toBe(0);
    expect(await prisma.athleteMemoryEvent.count()).toBe(0);
    expect(await prisma.aiCoachMemoryExtractionJob.count()).toBe(0);
    expect(await prisma.aiCoachMessage.count()).toBe(1);
  });

  it('removes a source job even when it has not produced evidence yet', async () => {
    const { message } = await source('athlete-a');

    await expect(
      store.retractSources({
        userId: 'athlete-a',
        sourceMessageIds: [message.id],
        policyVersion: 'test-source-edit',
      }),
    ).resolves.toBe(0);

    expect(await prisma.aiCoachMemoryExtractionJob.count()).toBe(0);
    expect(await prisma.aiCoachMessage.count()).toBe(1);
  });

  it('physically deletes one fact and its generating decision', async () => {
    const { message, job } = await source('athlete-a');
    await store.applyOperations({
      jobId: job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    });
    const fact = await prisma.athleteMemoryFact.findFirstOrThrow();

    await expect(
      store.deleteFact({ userId: 'athlete-a', factId: fact.id }),
    ).resolves.toBe(true);

    expect(await prisma.athleteMemoryFact.count()).toBe(0);
    expect(await prisma.athleteMemoryEvidence.count()).toBe(0);
    expect(await prisma.athleteMemoryEvent.count()).toBe(0);
    expect(await prisma.aiCoachMemoryExtractionJob.count()).toBe(0);
    expect(await prisma.aiCoachMessage.count()).toBe(1);
  });

  it('does not correct a historical node and restores it when the active replacement is deleted', async () => {
    const first = await source('athlete-a', '-original');
    await store.applyOperations({
      jobId: first.job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: first.message.id,
      sourceHash: 'a'.repeat(64),
      assertedAt: first.message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [createOperation] },
      operations: [createOperation],
    });
    const original = await prisma.athleteMemoryFact.findFirstOrThrow({
      where: { userId: 'athlete-a' },
    });
    const second = await source('athlete-a', '-replacement');
    const supersede: MemoryOperation = {
      operation: 'SUPERSEDE',
      targetFactId: original.id,
      replacement: {
        ...createOperation,
        claim: '用户后来确认昨晚睡眠质量良好',
      },
      reasonCode: 'USER_CORRECTION',
    };
    await store.applyOperations({
      jobId: second.job.id,
      leaseOwner: 'test-worker',
      userId: 'athlete-a',
      sourceMessageId: second.message.id,
      sourceHash: 'b'.repeat(64),
      assertedAt: second.message.createdAt,
      timezone: 'Asia/Shanghai',
      model: 'test-model',
      policyVersion: 'athlete-memory-v1',
      decision: { operations: [supersede] },
      operations: [supersede],
    });
    const replacement = await prisma.athleteMemoryFact.findFirstOrThrow({
      where: { userId: 'athlete-a', id: { not: original.id } },
    });

    await expect(
      store.correctFact({
        userId: 'athlete-a',
        factId: original.id,
        expectedVersion: 2,
        claim: '不能直接复活历史节点',
      }),
    ).rejects.toThrow('Only active memory facts');
    await expect(
      store.deleteFact({ userId: 'athlete-a', factId: replacement.id }),
    ).resolves.toBe(true);

    expect(
      await prisma.athleteMemoryFact.findUniqueOrThrow({
        where: { id: original.id },
        select: { status: true, supersededById: true, version: true },
      }),
    ).toEqual({ status: 'ACTIVE', supersededById: null, version: 3 });
    expect(
      await prisma.athleteMemoryEvent.count({
        where: {
          factId: original.id,
          operation: 'REACTIVATE',
          reasonCode: 'USER_DELETED_SUPERSEDING_FACT',
        },
      }),
    ).toBe(1);
    expect(await prisma.aiCoachMemoryExtractionJob.count()).toBe(1);
  });
});
