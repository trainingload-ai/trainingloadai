import { Logger } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

import { ThirdPartySchedulerService } from '../third-party-scheduler.service';

describe('ThirdPartySchedulerService', () => {
  function createService() {
    const values: Record<string, unknown> = {
      'thirdPartyScheduler.cron': '*/10 * * * *',
      'thirdPartyScheduler.startHourLocal': 3,
      'thirdPartyScheduler.staleStartedMinutes': 45,
      'thirdPartyScheduler.batchSize': 25,
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    };
    const scheduler = {
      addCronJob: jest.fn(),
      getCronJob: jest.fn(),
      deleteCronJob: jest.fn(),
    };
    const tasks = {
      taskNames: jest.fn(() => ['coros', 'suunto']),
      runAll: jest.fn<() => Promise<unknown[]>>(),
    };
    return {
      config,
      scheduler,
      tasks,
      service: new ThirdPartySchedulerService(
        config as never,
        scheduler as never,
        tasks as never,
      ),
    };
  }

  it('registers exactly one cron job for every third-party task', () => {
    const { scheduler, service } = createService();

    service.onModuleInit();

    expect(scheduler.addCronJob).toHaveBeenCalledTimes(1);
    expect(scheduler.addCronJob).toHaveBeenCalledWith(
      'third-party-scheduler',
      expect.anything(),
    );
    const job = scheduler.addCronJob.mock.calls[0]?.[1] as
      | { stop(): void }
      | undefined;
    job?.stop();
  });

  it('prevents overlapping dispatches and releases the lock afterward', async () => {
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const { service, tasks } = createService();
    let release!: (value: unknown[]) => void;
    tasks.runAll.mockReturnValueOnce(
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
    );

    try {
      const first = service.runOnce();
      await expect(service.runOnce()).resolves.toEqual([]);
      expect(tasks.runAll).toHaveBeenCalledTimes(1);
      expect(tasks.runAll).toHaveBeenCalledWith({
        startHourLocal: 3,
        staleStartedMinutes: 45,
        batchSize: 25,
      });

      release([{ name: 'coros', status: 'SUCCEEDED' }]);
      await first;
      tasks.runAll.mockResolvedValueOnce([]);
      await service.runOnce();
      expect(tasks.runAll).toHaveBeenCalledTimes(2);
      expect(debug).toHaveBeenCalledWith(
        '[third-party-scheduler] 已经在运行中，跳过重叠调度',
      );
    } finally {
      debug.mockRestore();
    }
  });
});
