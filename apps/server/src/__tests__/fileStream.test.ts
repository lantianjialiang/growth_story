import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { streamFileBody } from '../lib/fileStream.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-stream-'));
const bigFile = path.join(dir, 'big.bin');
// 2MB：超过流的默认高水位，会走到 pause/resume 背压分支
const payload = Buffer.alloc(2 * 1024 * 1024);
for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
fs.writeFileSync(bigFile, payload);

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('streamFileBody', () => {
  it('完整读取时字节完全一致', async () => {
    const body = await readAll(streamFileBody(bigFile));
    expect(body.length).toBe(payload.length);
    expect(body.equals(payload)).toBe(true);
  });

  it('提前 cancel 不抛异常，也不产生未处理的 rejection', async () => {
    const stream = streamFileBody(bigFile);
    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    await reader.cancel();
    // 关键回归点：cancel 之后底层文件的 close 事件会再到达一次，
    // 旧实现（Readable.toWeb）在这里二次 close controller，抛出
    // ERR_INVALID_STATE 并杀掉进程。等待事件循环走完，确认没有异常。
    await tick(80);
    expect(stream.locked).toBe(true);
  });

  it('连续两次 cancel 保持幂等', async () => {
    const stream = streamFileBody(bigFile);
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    await reader.cancel();
    await tick(50);
    expect(true).toBe(true);
  });

  it('文件不存在时以 error 结束而不是挂起', async () => {
    const stream = streamFileBody(path.join(dir, 'missing.bin'));
    await expect(readAll(stream)).rejects.toThrow();
  });
});
