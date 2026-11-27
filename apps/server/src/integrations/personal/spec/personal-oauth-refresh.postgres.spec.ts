import { ConfigService } from '@nestjs/config';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { PrismaClient, type Prisma } from '@prisma/client';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type {
  CorosMcpClient,
  CorosCredential,
} from '../../coros-mcp/coros-mcp.client';
import { ExternalProviderCredentialVault } from '../../external-provider/external-provider-credential-vault.service';
import { PersonalConnectionService } from '../personal-connection.service';
import { PersonalProviderError } from '../personal-errors';

describe('Personal COROS refresh / PostgreSQL', () => {
  const native = !!process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN;
  const vault = new ExternalProviderCredentialVault(
    new ConfigService({
      externalProviderCredentialSecret: 'fixture-only-encryption-key',
    }),
  );
  let database: ChildProcess;
  let db: PrismaClient;
  let replica: PrismaClient;
  let userId: string;
  let id: string;

  beforeAll(async () => {
    database = fork(
      resolve(
        __dirname,
        native
          ? '../../../api/plan/spec/plan-sync-native-postgres.mjs'
          : '../../../api/ai/core/spec/coach-run-postgres.mjs',
      ),
      [],
      { execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
    );
    const server = await new Promise<{
      address: string;
      connectionLimit?: number;
    }>((done, reject) => {
      database.once(
        'message',
        (value: { address: string; connectionLimit?: number }) => done(value),
      );
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    const datasourceUrl = `postgresql://postgres:postgres@${server.address}/postgres?connection_limit=${server.connectionLimit ?? 1}&sslmode=disable`;
    db = new PrismaClient({ datasourceUrl });
    replica = new PrismaClient({ datasourceUrl });
    await Promise.all([db.$connect(), replica.$connect()]);
  }, 30_000);

  afterAll(async () => {
    await Promise.all([db?.$disconnect(), replica?.$disconnect()]);
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });

  const replacement = (): CorosCredential => ({
    clientId: 'local-client',
    accessToken: 'fresh-access',
    refreshToken: 'fresh-refresh',
    expiresAt: Date.now() + 3_600_000,
  });

  beforeEach(async () => {
    userId = randomUUID();
    id = randomUUID();
    const now = new Date();
    await db.t_user.create({
      data: {
        id: userId,
        name: 'Test athlete',
        email: `${userId}@example.invalid`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    await db.externalProviderConnection.create({
      data: {
        id,
        userId,
        provider: 'coros',
        credentialFingerprint: 'generation-1',
        metadata: {
          connectionMode: 'mcp',
          authorizationRevision: 'revision-1',
          region: 'us',
        },
        credentialCiphertext: vault.encrypt(
          JSON.stringify({
            ...replacement(),
            accessToken: 'old-access',
            refreshToken: 'old-refresh',
            expiresAt: 0,
          }),
        ),
      },
    });
  });

  afterEach(async () => {
    await db.t_user.deleteMany({ where: { id: userId } });
  });

  function service(
    client: PrismaClient,
    token: CorosMcpClient['token'],
    failWrite = () => false,
  ) {
    const rows = {
      model: (tx?: Prisma.TransactionClient) => {
        const model = (tx ?? client).externalProviderConnection;
        return {
          findUnique: model.findUnique.bind(model),
          updateMany: (
            args: Prisma.ExternalProviderConnectionUpdateManyArgs,
          ) => {
            if (args.data.credentialCiphertext && failWrite())
              throw new Error('Credential write is unavailable');
            return model.updateMany(args);
          },
        };
      },
    };
    return new PersonalConnectionService(
      client as never,
      rows as never,
      {} as never,
      vault,
      {} as never,
      {} as never,
      { token, revoke: async () => true } as never,
    );
  }

  function current() {
    return db.externalProviderConnection.findUniqueOrThrow({ where: { id } });
  }

  it('performs the network request outside any transaction and lets another worker reuse the rotated result', async () => {
    const began = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const token = jest.fn<CorosMcpClient['token']>(
      async (_region, _client, _grant, beforeDispatch) => {
        await beforeDispatch?.();
        began.resolve();
        await release.promise;
        return replacement();
      },
    );
    const original = service(db, token).credential(id);
    await Promise.race([began.promise, original]);
    const follower = service(replica, token).credential(id, true, 'old-access');
    try {
      await sleep(130);
      if (native) {
        const [activity] = await db.$queryRaw<{ open: bigint }[]>`
          SELECT count(*) AS open FROM pg_stat_activity
          WHERE datname = current_database() AND state LIKE 'idle in transaction%'
        `;
        expect(Number(activity.open)).toBe(0);
      }
      expect(token).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      await Promise.all([original, follower]);
    }
    expect((await original).token).toBe('fresh-access');
    expect((await follower).token).toBe('fresh-access');
    expect(
      JSON.parse(vault.decrypt((await current()).credentialCiphertext))
        .refreshToken,
    ).toBe('fresh-refresh');
  });

  it('does not restore credentials after the real disconnect entry point', async () => {
    const began = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const token = jest.fn<CorosMcpClient['token']>(
      async (_region, _client, _grant, beforeDispatch) => {
        await beforeDispatch?.();
        began.resolve();
        await release.promise;
        return replacement();
      },
    );
    const waiting = service(db, token).credential(id);
    const fenced = expect(waiting).rejects.toMatchObject({
      code: 'PROVIDER_CONNECTION_CHANGED',
    });
    await Promise.race([began.promise, fenced]);
    try {
      await expect(
        service(replica, token).disconnect(userId, 'coros'),
      ).resolves.toEqual({
        disconnected: true,
        revoked: true,
      });
    } finally {
      release.resolve();
      await fenced;
    }
    expect(await current()).toMatchObject({
      status: 'DISCONNECTED',
      credentialCiphertext: '',
    });
    expect(token).toHaveBeenCalledTimes(1);
  });

  it('does not replay a dispatched exchange after durable persistence is unavailable', async () => {
    const token = jest.fn<CorosMcpClient['token']>(
      async (_region, _client, _grant, beforeDispatch) => {
        await beforeDispatch?.();
        return replacement();
      },
    );
    await expect(
      service(db, token, () => true).credential(id),
    ).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
    await db.personalOAuthRefresh.update({
      where: { connectionId: id },
      data: { leaseExpiresAt: new Date(0) },
    });
    await expect(service(replica, token).credential(id)).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_REQUIRED',
    });
    expect(await current()).toMatchObject({ status: 'INVALID' });
    expect(token).toHaveBeenCalledTimes(1);
  });

  it('retains the old refresh token only after a confirmed exchange omits a replacement', async () => {
    const token = jest.fn<CorosMcpClient['token']>(
      async (_region, _client, _grant, beforeDispatch) => {
        await beforeDispatch?.();
        return { ...replacement(), refreshToken: undefined };
      },
    );
    await expect(service(db, token).credential(id)).resolves.toMatchObject({
      token: 'fresh-access',
    });
    expect(
      JSON.parse(vault.decrypt((await current()).credentialCiphertext))
        .refreshToken,
    ).toBe('old-refresh');
  });

  it('preserves upstream preflight errors and permits a later retry', async () => {
    const token = jest
      .fn<CorosMcpClient['token']>()
      .mockRejectedValueOnce(new PersonalProviderError('PROVIDER_UNREACHABLE'))
      .mockImplementationOnce(
        async (_region, _client, _grant, beforeDispatch) => {
          await beforeDispatch?.();
          return replacement();
        },
      );
    await expect(service(db, token).credential(id)).rejects.toMatchObject({
      code: 'PROVIDER_UNREACHABLE',
    });
    expect(await current()).toMatchObject({ status: 'ACTIVE' });
    expect(
      await db.personalOAuthRefresh.findUnique({ where: { connectionId: id } }),
    ).toBeNull();
    await expect(service(replica, token).credential(id)).resolves.toMatchObject(
      { token: 'fresh-access' },
    );
  });
});
