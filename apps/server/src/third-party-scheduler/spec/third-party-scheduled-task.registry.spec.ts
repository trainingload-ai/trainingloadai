import { describe, expect, it, jest } from '@jest/globals';

import type {
  ThirdPartyScheduleContext,
  ThirdPartyScheduledTask,
} from '../third-party-scheduled-task';
import { ThirdPartyScheduledTaskRegistry } from '../third-party-scheduled-task.registry';

const context: ThirdPartyScheduleContext = {
  startHourLocal: 2,
  staleStartedMinutes: 60,
  batchSize: 20,
};

function task(
  name: string,
  run: (context: ThirdPartyScheduleContext) => Promise<void>,
) {
  return { name, run } satisfies ThirdPartyScheduledTask;
}

describe('ThirdPartyScheduledTaskRegistry', () => {
  it('dispatches every registered task and isolates provider failures', async () => {
    const coros = task(
      'coros',
      jest.fn(async () => undefined),
    );
    const intervals = task(
      'intervals',
      jest.fn(async () => undefined),
    );
    const suunto = task(
      'suunto',
      jest.fn(async () => Promise.reject('down')),
    );
    const wahoo = task(
      'wahoo',
      jest.fn(async () => undefined),
    );
    const plans = task(
      'plans',
      jest.fn(async () => undefined),
    );
    const registry = new ThirdPartyScheduledTaskRegistry([
      coros,
      intervals,
      suunto,
      wahoo,
      plans,
    ]);

    await expect(registry.runAll(context)).resolves.toEqual([
      { name: 'coros', status: 'SUCCEEDED' },
      { name: 'intervals', status: 'SUCCEEDED' },
      { name: 'suunto', status: 'FAILED', error: 'down' },
      { name: 'wahoo', status: 'SUCCEEDED' },
      { name: 'plans', status: 'SUCCEEDED' },
    ]);
    for (const current of [coros, intervals, suunto, wahoo, plans]) {
      expect(current.run).toHaveBeenCalledWith(context);
    }
  });
});
