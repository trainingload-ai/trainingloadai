import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { HealthController } from './health.controller';
import type { LivenessResponse, ReadinessResponse } from './health.types';

describe('HealthController', () => {
  const health = {
    liveness: jest.fn<() => LivenessResponse>(),
    readiness: jest.fn<() => Promise<ReadinessResponse>>(),
  };
  const response = {
    status: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    health.liveness.mockReturnValue({
      status: 'OK',
      timestamp: '2026-10-17T00:00:00.000Z',
    });
  });

  it('keeps liveness independent from readiness', () => {
    const controller = new HealthController(health as never);

    expect(controller.live()).toEqual(health.liveness());
    expect(health.readiness).not.toHaveBeenCalled();
  });

  it('returns HTTP 503 when a readiness dependency is unavailable', async () => {
    health.readiness.mockResolvedValue({
      status: 'not_ready',
      timestamp: '2026-10-17T00:00:00.000Z',
      checks: { configuration: 'ready', database: 'unavailable' },
    });
    const controller = new HealthController(health as never);

    await expect(controller.ready(response as never)).resolves.toMatchObject({
      status: 'not_ready',
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });

  it('preserves the default 2xx status when all dependencies are ready', async () => {
    health.readiness.mockResolvedValue({
      status: 'ready',
      timestamp: '2026-10-17T00:00:00.000Z',
      checks: { configuration: 'ready', database: 'ready' },
    });
    const controller = new HealthController(health as never);

    await expect(controller.ready(response as never)).resolves.toMatchObject({
      status: 'ready',
    });
    expect(response.status).not.toHaveBeenCalled();
  });
});
