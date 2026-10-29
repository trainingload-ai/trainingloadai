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
import { AthleteStateRepository } from './athlete-state.repository';

describe('Athlete State PostgreSQL invariants', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;

  beforeAll(async () => {
    database = fork(
      resolve(__dirname, './spec/athlete-state-postgres.mjs'),
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
    // A constraint violation closes PGlite Socket's current protocol
    // connection, so every test starts with a fresh Prisma connection.
    await prisma.$disconnect();
    await prisma.$connect();
    await prisma.coachAssessmentCase.deleteMany();
    await prisma.athleteStateAssessment.deleteMany();
    await prisma.aiCoachSession.deleteMany();
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
    await prisma.$executeRawUnsafe(`INSERT INTO t_user(id) VALUES ('athlete')`);
  });

  async function createAssessment(hash = 'evidence-hash') {
    return prisma.athleteStateAssessment.create({
      data: {
        userId: 'athlete',
        asOf: new Date('2026-10-12T01:00:00.000Z'),
        timezone: 'Asia/Shanghai',
        state: 'UNDER_RECOVERED',
        confidence: 0.8,
        decisionReadiness: 'SUFFICIENT',
        evidenceHash: hash,
        policyVersion: 'athlete-state-policy-v1',
        promptVersion: 'athlete-state-assessment-v1',
        evidenceSnapshot: {},
        dimensions: [],
        hypotheses: [],
        evidenceRequests: [],
        safetyFlags: [],
        limitations: [],
        expiresAt: new Date('2026-10-13T01:00:00.000Z'),
      },
    });
  }

  async function createCase(assessmentId: string, status = 'WAITING_FOR_USER') {
    return prisma.coachAssessmentCase.create({
      data: {
        userId: 'athlete',
        status: status as never,
        triggerType: 'TEST',
        asOf: new Date('2026-10-12T01:00:00.000Z'),
        timezone: 'Asia/Shanghai',
        evidenceHash: 'evidence-hash',
        dedupeKey: 'dedupe-key',
        assessmentId,
        expiresAt: new Date('2026-10-14T01:00:00.000Z'),
      },
    });
  }

  it('enforces one active Case per dedupe key but permits resolved history', async () => {
    const assessment = await createAssessment();
    const first = await createCase(assessment.id);
    await expect(createCase(assessment.id)).rejects.toMatchObject({
      code: 'P2002',
    });
    await prisma.$disconnect();
    await prisma.$connect();
    await prisma.coachAssessmentCase.update({
      where: { id: first.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    await expect(createCase(assessment.id)).resolves.toMatchObject({
      dedupeKey: 'dedupe-key',
      status: 'WAITING_FOR_USER',
    });
  });

  it('supports revision-conditional updates for concurrent workers', async () => {
    const assessment = await createAssessment();
    const assessmentCase = await createCase(assessment.id);
    await expect(
      prisma.coachAssessmentCase.updateMany({
        where: { id: assessmentCase.id, revision: 1 },
        data: { status: 'ASSESSING', revision: { increment: 1 } },
      }),
    ).resolves.toEqual({ count: 1 });
    await expect(
      prisma.coachAssessmentCase.updateMany({
        where: { id: assessmentCase.id, revision: 1 },
        data: { status: 'ASSESSING', revision: { increment: 1 } },
      }),
    ).resolves.toEqual({ count: 0 });
  });

  it('idempotently reuses one immutable Assessment for concurrent evidence', async () => {
    const repository = new AthleteStateRepository(prisma as never);
    const evidence = {
      evidenceHash: 'repository-evidence-hash',
      snapshot: {
        asOf: '2026-10-12T01:00:00.000Z',
        timezone: 'Asia/Shanghai',
      },
      modelSnapshot: {},
      latestSourceAt: null,
      expiresAt: new Date('2026-10-13T01:00:00.000Z'),
    };
    const result = {
      state: 'UNDER_RECOVERED',
      confidence: 0.8,
      decisionReadiness: 'SUFFICIENT',
      dimensions: [],
      hypotheses: [],
      evidenceRequests: [],
      safetyFlags: [],
      limitations: [],
    };
    const saved = await Promise.all([
      repository.saveAssessment({
        userId: 'athlete',
        evidence: evidence as never,
        result: result as never,
      }),
      repository.saveAssessment({
        userId: 'athlete',
        evidence: evidence as never,
        result: result as never,
      }),
    ]);
    expect(saved[0].assessment.id).toBe(saved[1].assessment.id);
    await expect(
      prisma.athleteStateAssessment.count({
        where: { evidenceHash: evidence.evidenceHash },
      }),
    ).resolves.toBe(1);
  });

  it('deletes a bound Case when its dedicated Coach session is deleted', async () => {
    const assessment = await createAssessment();
    await prisma.aiCoachSession.create({
      data: { userId: 'athlete', id: 'assessment-session' },
    });
    await prisma.coachAssessmentCase.create({
      data: {
        userId: 'athlete',
        status: 'WAITING_FOR_USER',
        triggerType: 'TEST',
        asOf: new Date('2026-10-12T01:00:00.000Z'),
        timezone: 'Asia/Shanghai',
        evidenceHash: 'evidence-hash',
        dedupeKey: 'session-case',
        assessmentId: assessment.id,
        sessionId: 'assessment-session',
        expiresAt: new Date('2026-10-14T01:00:00.000Z'),
      },
    });
    await prisma.aiCoachSession.delete({
      where: {
        userId_id: { userId: 'athlete', id: 'assessment-session' },
      },
    });
    await expect(prisma.coachAssessmentCase.count()).resolves.toBe(0);
  });
});
