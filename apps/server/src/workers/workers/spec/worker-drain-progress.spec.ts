import { describe, expect, it, jest } from '@jest/globals';
import { WorkerDrainProgress } from '../../worker-drain-progress';

describe('WorkerDrainProgress', () => {
  it('logs a stable drain sequence and refreshed queue snapshots', async () => {
    const snapshots = [
      { remaining: 5, waiting: 4, running: 1 },
      { remaining: 4, waiting: 4, running: 0 },
    ];
    const log = jest.fn();
    const progress = new WorkerDrainProgress(
      { log, warn: jest.fn() },
      '测试队列',
      jest.fn(async () => snapshots.shift()!),
    );

    await progress.run({
      batchPosition: 2,
      batchTotal: 5,
      details: '任务ID=job-1',
      task: jest.fn(async () => undefined),
    });

    expect(log).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '[测试队列][编排] 开始 本轮第=1 当前批次=2/5 队列剩余=5（等待=4，处理中=1）（含当前任务）',
      ),
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        '[测试队列][编排] 结束 本轮第=1 当前批次=2/5 队列剩余=4（等待=4，处理中=0） 执行结果=RETURNED',
      ),
    );
  });

  it('does not block a job when progress counting fails', async () => {
    const task = jest.fn(async () => undefined);
    const warn = jest.fn();
    const progress = new WorkerDrainProgress(
      { log: jest.fn(), warn },
      '测试队列',
      jest.fn(async () => {
        throw new Error('count failed');
      }),
    );

    await expect(
      progress.run({
        batchPosition: 1,
        batchTotal: 1,
        details: '任务ID=job-2',
        task,
      }),
    ).resolves.toBeUndefined();

    expect(task).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('count failed'));
  });
});
