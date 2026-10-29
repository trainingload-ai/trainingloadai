import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = {
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const runtimeCapabilities = {
    snapshot: jest.fn<() => { ready: boolean }>(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    runtimeCapabilities.snapshot.mockReturnValue({ ready: true });
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('reports liveness without consulting external dependencies', () => {
    const service = new HealthService(
      prisma as never,
      runtimeCapabilities as never,
    );

    expect(service.liveness()).toMatchObject({ status: 'OK' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(runtimeCapabilities.snapshot).not.toHaveBeenCalled();
  });

  it('is ready only when configuration and database checks pass', async () => {
    const service = new HealthService(
      prisma as never,
      runtimeCapabilities as never,
    );

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'ready',
      checks: { configuration: 'ready', database: 'ready' },
    });
  });

  it('redacts database errors and reports not_ready', async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('password=operator-secret host=private-database'),
    );
    const service = new HealthService(
      prisma as never,
      runtimeCapabilities as never,
    );

    const result = await service.readiness();

    expect(result).toMatchObject({
      status: 'not_ready',
      checks: { configuration: 'ready', database: 'unavailable' },
    });
    expect(JSON.stringify(result)).not.toContain('operator-secret');
    expect(JSON.stringify(result)).not.toContain('private-database');
  });

  it('reports an invalid runtime configuration independently from database state', async () => {
    runtimeCapabilities.snapshot.mockReturnValue({ ready: false });
    const service = new HealthService(
      prisma as never,
      runtimeCapabilities as never,
    );

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'not_ready',
      checks: { configuration: 'unavailable', database: 'ready' },
    });
  });
});
