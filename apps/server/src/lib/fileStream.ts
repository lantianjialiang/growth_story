import fs from 'node:fs';

/**
 * 把磁盘文件包装成 Web ReadableStream 作为响应体。
 *
 * 不要直接把 `fs.createReadStream()` 塞给 `c.body()`：`@hono/node-server`
 * 会通过 `Readable.toWeb()` 适配，而它在「响应已结束 / 客户端提前断开」时
 * 会先 cancel（destroy 底层流），随后底层流的 close 事件又去 close 一次
 * 已经关闭的 controller，抛出 `ERR_INVALID_STATE: ReadableStream is already closed`。
 * 这个异常发生在微任务里，无法被路由的 try/catch 捕获，会直接杀掉进程。
 *
 * 这里自己实现适配，close/error/cancel 全部幂等，任何时序都不会重复关闭。
 */
export function streamFileBody(filePath: string): ReadableStream<Uint8Array> {
  const file = fs.createReadStream(filePath);
  let settled = false;

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (settled) return;
    settled = true;
    try {
      controller.close();
    } catch {
      /* 已被消费方关闭 */
    }
  };

  const fail = (controller: ReadableStreamDefaultController<Uint8Array>, err: unknown) => {
    if (settled) return;
    settled = true;
    file.destroy();
    try {
      controller.error(err);
    } catch {
      /* 已被消费方关闭 */
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      file.on('data', (chunk) => {
        if (settled) return;
        try {
          controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        } catch {
          settled = true;
          file.destroy();
          return;
        }
        // 消费方不读时暂停读盘，避免整份文件堆进内存
        if ((controller.desiredSize ?? 1) <= 0) file.pause();
      });
      file.on('end', () => finish(controller));
      file.on('error', (err) => fail(controller, err));
      file.on('close', () => {
        if (settled) return;
        // 未读到 end 就被关闭（如文件被删除）按正常结束处理，避免悬挂
        finish(controller);
      });
    },
    pull() {
      if (!settled) file.resume();
    },
    cancel() {
      settled = true;
      file.destroy();
    },
  });
}
