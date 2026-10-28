/**
 * 进程内串行任务队列：家用规模足够，且避免 SQLite 并发写。
 * 后续要换成真正的队列时，只需替换 enqueue 实现。
 */
type Job = () => Promise<void>;

const queue: Job[] = [];
let running = false;

export function enqueue(job: Job): void {
  queue.push(job);
  void drain();
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      try {
        await job();
      } catch {
        /* 任务内部自行记录错误，这里保证队列继续 */
      }
    }
  } finally {
    running = false;
  }
}

export function pendingJobs(): number {
  return queue.length;
}
