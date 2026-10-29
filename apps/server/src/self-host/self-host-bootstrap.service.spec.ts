import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { SelfHostInitializationState } from '@prisma/client';
import { SelfHostBootstrapService } from './self-host-bootstrap.service';
import { readBootstrapTokenFile } from './self-host-token-file';
import { SelfHostBootstrapError } from './self-host-bootstrap.types';
import { NUMERIC_ADVISORY_XACT_LOCK_SQL } from '@/prisma/numeric-advisory-lock';

type Instance = {
  id: number;
  state: SelfHostInitializationState;
  bootstrapTokenHash: string | null;
  bootstrapTokenExpiresAt: Date | null;
  ownerUserId: string | null;
  initializedAt: Date | null;
};

describe('SelfHostBootstrapService', () => {
  let operationsRoot: string;
  let instance: Instance | null;
  const createdUsers: Array<Record<string, unknown>> = [];
  const tx = {
    $executeRawUnsafe: jest.fn(async () => 1),
    selfHostInstance: {
      findUnique: jest.fn(async () => instance),
      upsert: jest.fn(async (args: Record<string, any>) => {
        const data = instance ? args.update : args.create;
        instance = {
          id: 1,
          state: data.state,
          bootstrapTokenHash: data.bootstrapTokenHash ?? null,
          bootstrapTokenExpiresAt: data.bootstrapTokenExpiresAt ?? null,
          ownerUserId: data.ownerUserId ?? null,
          initializedAt: data.initializedAt ?? null,
        };
        return instance;
      }),
      update: jest.fn(async (args: Record<string, any>) => {
        instance = { ...instance!, ...args.data };
        return instance;
      }),
    },
    t_user: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        createdUsers.push(args.data);
        return args.data;
      }),
    },
    t_user_accounts: { create: jest.fn(async () => ({})) },
    userFitnessMetric: { create: jest.fn(async () => ({})) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
    selfHostInstance: { findUnique: jest.fn(async () => instance) },
  };
  const runtime = {
    snapshot: jest.fn(() => ({ deployment: 'self-host' })),
    isEnabled: jest.fn(() => false),
  };
  const users = {
    users: (client = tx) => client.t_user,
    fitnessMetrics: (client = tx) => client.userFitnessMetric,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    createdUsers.length = 0;
    instance = null;
    operationsRoot = await fs.mkdtemp('/tmp/trainingload-selfhost-bootstrap-');
    process.env.SELF_HOST_OPERATIONS_PATH = operationsRoot;
  });

  afterEach(async () => {
    delete process.env.SELF_HOST_OPERATIONS_PATH;
    delete process.env.SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS;
    delete process.env.SELF_HOST_MODE;
    delete process.env.SELF_HOST_HTTP_BIND;
    delete process.env.NEXT_PUBLIC_APP_URL;
    await fs.rm(operationsRoot, { recursive: true, force: true });
  });

  it('creates one persisted token, reuses it, and never returns it from status', async () => {
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );
    const first = await service.ensureBootstrapToken();
    const firstToken = await readBootstrapTokenFile();
    const second = await service.ensureBootstrapToken();
    const secondToken = await readBootstrapTokenFile();

    expect(first).toMatchObject({
      schemaVersion: 1,
      state: 'PENDING',
      bootstrapRequired: true,
      mailRecoveryAvailable: false,
    });
    expect(second).toEqual(first);
    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondToken).toBe(firstToken);
    expect(JSON.stringify(first)).not.toContain(firstToken!);
    expect(instance?.bootstrapTokenHash).toBe(
      createHash('sha256').update(firstToken!).digest('hex'),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      NUMERIC_ADVISORY_XACT_LOCK_SQL,
      7_257_209_788_430_862,
    );
  });

  it('atomically creates a verified credential owner and closes bootstrap', async () => {
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );
    await service.ensureBootstrapToken();
    const token = await readBootstrapTokenFile();

    await expect(
      service.bootstrapOwner({
        token: token!,
        email: 'Owner@Example.com',
        password: 'strong-pass-123',
        name: 'Local Owner',
      }),
    ).resolves.toMatchObject({
      schemaVersion: 1,
      state: 'READY',
      owner: { email: 'owner@example.com', name: 'Local Owner' },
    });

    expect(instance).toMatchObject({
      state: SelfHostInitializationState.READY,
      bootstrapTokenHash: null,
      bootstrapTokenExpiresAt: null,
    });
    expect(createdUsers[0]).toMatchObject({
      email: 'owner@example.com',
      emailVerified: true,
    });
    await expect(readBootstrapTokenFile()).resolves.toBeNull();

    await expect(
      service.bootstrapOwner({
        token: token!,
        email: 'attacker@example.com',
        password: 'strong-pass-123',
        name: 'Attacker',
      }),
    ).rejects.toMatchObject({ code: 'SELF_HOST_ALREADY_INITIALIZED' });
    expect(createdUsers).toHaveLength(1);
  });

  it('creates a passwordless local Owner without an email credential', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    process.env.SELF_HOST_HTTP_BIND = '127.0.0.1';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:43210';
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );
    await service.ensureBootstrapToken();

    await expect(
      service.bootstrapLocalOwner({ name: 'Victor' }),
    ).resolves.toMatchObject({
      schemaVersion: 1,
      state: 'READY',
      accessMode: 'local-owner',
      owner: { name: 'Victor' },
    });

    expect(instance).toMatchObject({
      state: SelfHostInitializationState.READY,
      bootstrapTokenHash: null,
      bootstrapTokenExpiresAt: null,
    });
    expect(createdUsers[0]).toMatchObject({
      name: 'Victor',
      emailVerified: true,
      registrationMethod: 'UNKNOWN',
    });
    expect(createdUsers[0]?.email).toMatch(
      /^owner-[0-9a-f-]+@self-host\.invalid$/,
    );
    expect(tx.t_user_accounts.create).not.toHaveBeenCalled();
    await expect(readBootstrapTokenFile()).resolves.toBeNull();
  });

  it('disables sign-out but allows local Owner reset through account deletion', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    process.env.SELF_HOST_HTTP_BIND = '127.0.0.1';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:43210';
    instance = {
      id: 1,
      state: SelfHostInitializationState.READY,
      bootstrapTokenHash: null,
      bootstrapTokenExpiresAt: null,
      ownerUserId: 'owner-1',
      initializedAt: new Date(),
    };
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );

    await expect(service.getSessionPolicy('owner-1')).resolves.toEqual({
      schemaVersion: 1,
      accessMode: 'local-owner',
      isOwner: true,
      canSignOut: false,
      canDeleteAccount: true,
    });
  });

  it('returns the local instance to pending before deleting its Owner', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    process.env.SELF_HOST_HTTP_BIND = '127.0.0.1';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:43210';
    instance = {
      id: 1,
      state: SelfHostInitializationState.READY,
      bootstrapTokenHash: null,
      bootstrapTokenExpiresAt: null,
      ownerUserId: 'owner-1',
      initializedAt: new Date(),
    };
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );

    await expect(
      service.resetForLocalOwnerDeletion(tx as never, 'owner-1'),
    ).resolves.toBe(true);
    expect(instance).toMatchObject({
      state: SelfHostInitializationState.PENDING,
      ownerUserId: null,
      initializedAt: null,
    });
    expect(instance?.bootstrapTokenHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(readBootstrapTokenFile()).resolves.toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it('keeps credential sign-out and allows only non-owners to delete themselves', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    process.env.SELF_HOST_HTTP_BIND = '0.0.0.0';
    process.env.NEXT_PUBLIC_APP_URL = 'https://training.example.com';
    instance = {
      id: 1,
      state: SelfHostInitializationState.READY,
      bootstrapTokenHash: null,
      bootstrapTokenExpiresAt: null,
      ownerUserId: 'owner-1',
      initializedAt: new Date(),
    };
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );

    await expect(service.getSessionPolicy('owner-1')).resolves.toMatchObject({
      accessMode: 'credentials',
      isOwner: true,
      canSignOut: true,
      canDeleteAccount: false,
    });
    await expect(service.getSessionPolicy('member-1')).resolves.toMatchObject({
      accessMode: 'credentials',
      isOwner: false,
      canSignOut: true,
      canDeleteAccount: true,
    });
  });

  it('refuses passwordless local initialization outside loopback mode', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    process.env.SELF_HOST_HTTP_BIND = '0.0.0.0';
    process.env.NEXT_PUBLIC_APP_URL = 'http://192.168.1.20:43210';
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );

    await expect(
      service.bootstrapLocalOwner({ name: 'Victor' }),
    ).rejects.toMatchObject({ code: 'SELF_HOST_LOCAL_ACCESS_DISABLED' });
    expect(createdUsers).toHaveLength(0);
  });

  it('rejects invalid, expired, and malformed claims without creating a user', async () => {
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );
    await service.ensureBootstrapToken();
    const token = await readBootstrapTokenFile();

    await expect(
      service.bootstrapOwner({
        token: 'x'.repeat(43),
        email: 'owner@example.com',
        password: 'strong-pass-123',
        name: 'Local Owner',
      }),
    ).rejects.toMatchObject({ code: 'SELF_HOST_BOOTSTRAP_TOKEN_INVALID' });

    instance!.bootstrapTokenExpiresAt = new Date(Date.now() - 1);
    await expect(
      service.bootstrapOwner({
        token: token!,
        email: 'owner@example.com',
        password: 'strong-pass-123',
        name: 'Local Owner',
      }),
    ).rejects.toMatchObject({ code: 'SELF_HOST_BOOTSTRAP_TOKEN_EXPIRED' });

    await expect(
      service.bootstrapOwner({
        token: token!,
        email: 'not-an-email',
        password: 'weak',
        name: '<script>',
      }),
    ).rejects.toBeInstanceOf(SelfHostBootstrapError);
    await expect(
      service.bootstrapOwner({
        token: 'x'.repeat(42),
        email: 'owner@example.com',
        password: 'strong-pass-123',
        name: 'Local Owner',
      }),
    ).rejects.toMatchObject({ code: 'SELF_HOST_BOOTSTRAP_INPUT_INVALID' });
    expect(createdUsers).toHaveLength(0);
  });

  it('does not expose the bootstrap surface in managed deployments', async () => {
    runtime.snapshot.mockReturnValueOnce({ deployment: 'managed' });
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );
    await expect(service.ensureBootstrapToken()).rejects.toMatchObject({
      code: 'SELF_HOST_ONLY',
    });
  });

  it('rejects an unsafe token lifetime instead of silently coercing it', async () => {
    process.env.SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS = '999999999';
    const service = new SelfHostBootstrapService(
      prisma as never,
      runtime as never,
      users as never,
    );

    await expect(service.ensureBootstrapToken()).rejects.toThrow(
      'SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS',
    );
    await expect(readBootstrapTokenFile()).resolves.toBeNull();
  });
});
