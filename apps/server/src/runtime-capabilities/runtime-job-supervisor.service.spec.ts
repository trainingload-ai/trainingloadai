import { describe, expect, it, jest } from '@jest/globals';

import { RuntimeCapabilityService } from './runtime-capability.service';
import { RuntimeJobSupervisor } from './runtime-job-supervisor.service';

describe('RuntimeJobSupervisor', () => {
  it('starts and stops a job when its persisted capability changes', () => {
    const capabilities = new RuntimeCapabilityService();
    const supervisor = new RuntimeJobSupervisor(capabilities);
    let enabled = false;
    const start = jest.fn();
    const stop = jest.fn();

    supervisor.onModuleInit();
    const unregister = supervisor.register({
      id: 'ai-test',
      enabled: () => enabled,
      start,
      stop,
    });
    expect(start).not.toHaveBeenCalled();

    enabled = true;
    capabilities.notifyChanged();
    capabilities.notifyChanged();
    expect(start).toHaveBeenCalledTimes(1);

    enabled = false;
    capabilities.notifyChanged();
    expect(stop).toHaveBeenCalledTimes(1);

    unregister();
    supervisor.onModuleDestroy();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate job identifiers', () => {
    const supervisor = new RuntimeJobSupervisor(new RuntimeCapabilityService());
    const descriptor = {
      id: 'maps-test',
      enabled: () => false,
      start: jest.fn(),
      stop: jest.fn(),
    };
    supervisor.register(descriptor);
    expect(() => supervisor.register(descriptor)).toThrow(
      'Runtime job already registered: maps-test',
    );
  });
});
