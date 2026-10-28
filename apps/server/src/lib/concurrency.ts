/**
 * 有上限的并发执行：一次最多跑 limit 个任务，返回时全部结束。
 * 多张照片一起上传时用它，比一张张串行快得多，又不会把 CPU 打满。
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const size = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}
