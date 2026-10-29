/**
 * 以固定数量的 runner 处理异步集合，既消除串行瀑布，也避免 Promise.all
 * 对大型导入批次瞬间打开过多数据库连接。
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const runnerCount = Math.min(
    items.length,
    Math.max(1, Math.floor(concurrency)),
  );
  let nextIndex = 0;

  const runNext = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: runnerCount }, () => runNext()));
}
