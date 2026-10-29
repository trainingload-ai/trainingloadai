import { describe, expect, it } from '@jest/globals';
import { forEachWithConcurrency } from '../async-concurrency.util';

describe('forEachWithConcurrency', () => {
  it('preserves indexes while respecting the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const visited: { item: string; index: number }[] = [];

    await forEachWithConcurrency(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      3,
      async (item, index) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, index % 2));
        visited.push({ item, index });
        active -= 1;
      },
    );

    expect(peak).toBe(3);
    expect([...visited].sort((a, b) => a.index - b.index)).toEqual([
      { item: 'a', index: 0 },
      { item: 'b', index: 1 },
      { item: 'c', index: 2 },
      { item: 'd', index: 3 },
      { item: 'e', index: 4 },
      { item: 'f', index: 5 },
    ]);
  });

  it('uses one runner when given a non-positive limit', async () => {
    let active = 0;
    let peak = 0;

    await forEachWithConcurrency([1, 2, 3], 0, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
    });

    expect(peak).toBe(1);
  });
});
