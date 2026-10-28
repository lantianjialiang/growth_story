import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Hono } from 'hono';
import { createApp } from '../app.js';
import { createClient, type DbClient } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { resetRateLimits } from '../lib/ratelimit.js';
import { LocalDriver, setStorage } from '../storage/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../drizzle');

export interface TestContext {
  app: Hono;
  client: DbClient;
  uploadDir: string;
}

export function createTestContext(): TestContext {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-uploads-'));
  setStorage(new LocalDriver(uploadDir));
  // 测试都来自同一 IP，需要清空限流桶，否则会误命中登录/注册限流
  resetRateLimits();

  const client = createClient(':memory:');
  migrate(client.sqlite, migrationsDir);
  const app = createApp(client);
  return { app, client, uploadDir };
}

export interface TestUser {
  id: string;
  email: string;
  cookie: string;
}

export async function signup(
  ctx: TestContext,
  email = `user-${Math.random().toString(36).slice(2, 8)}@example.com`,
): Promise<TestUser> {
  const res = await ctx.app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', displayName: '测试用户' }),
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return { id: body.user.id, email, cookie };
}

export async function jsonRequest<T = unknown>(
  ctx: TestContext,
  method: string,
  url: string,
  options: { cookie?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  const res = await ctx.app.request(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

export async function createProfile(
  ctx: TestContext,
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const res = await jsonRequest<{ profile: { id: string; name: string } }>(ctx, 'POST', '/api/v1/profiles', {
    cookie,
    body: { kind: 'child', name: '小满', birthDate: '2020-06-01', birthPrecision: 'day', ...overrides },
  });
  if (res.status !== 201) throw new Error(`profile create failed: ${JSON.stringify(res.body)}`);
  return res.body.profile;
}

export async function createEvent(
  ctx: TestContext,
  cookie: string,
  profileId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; title: string }> {
  const res = await jsonRequest<{ event: { id: string; title: string } }>(
    ctx,
    'POST',
    `/api/v1/profiles/${profileId}/events`,
    {
      cookie,
      body: {
        title: '第一次站起来',
        body: '扶着沙发松手了',
        date: '2021-03-12',
        datePrecision: 'day',
        type: 'milestone',
        tags: ['里程碑'],
        ...overrides,
      },
    },
  );
  if (res.status !== 201) throw new Error(`event create failed: ${JSON.stringify(res.body)}`);
  return res.body.event;
}

// ---------- JPEG + EXIF 构造（用于验证 GPS 清除） ----------

function asciiEntry(tag: number, value: string): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt16LE(tag, 0);
  buf.writeUInt16LE(2, 2); // ASCII
  buf.writeUInt32LE(value.length, 4);
  buf.writeUInt32LE(0, 8); // 由调用方填写偏移
  return buf;
}

function rationalEntry(tag: number, offset: number, count = 3): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt16LE(tag, 0);
  buf.writeUInt16LE(5, 2); // RATIONAL
  buf.writeUInt32LE(count, 4);
  buf.writeUInt32LE(offset, 8);
  return buf;
}

function longEntry(tag: number, value: number): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt16LE(tag, 0);
  buf.writeUInt16LE(4, 2); // LONG
  buf.writeUInt32LE(1, 4);
  buf.writeUInt32LE(value, 8);
  return buf;
}

function rationalTriplet(values: [number, number][]): Buffer {
  const buf = Buffer.alloc(values.length * 8);
  values.forEach(([num, den], i) => {
    buf.writeUInt32LE(num, i * 8);
    buf.writeUInt32LE(den, i * 8 + 4);
  });
  return buf;
}

/** 构造一段含 GPS + DateTimeOriginal 的 TIFF/EXIF（little-endian）。 */
export function buildExifTiff(dateTime = '2024:03:05 10:22:31'): Buffer {
  const ifd0Offset = 8;
  const exifIfdOffset = 44;
  const dateOffset = 62;
  const gpsIfdOffset = 84;
  const latRefOffset = 138;
  const latOffset = 140;
  const lngRefOffset = 164;
  const lngOffset = 166;
  const total = 190;

  const buf = Buffer.alloc(total);
  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(0x002a, 2);
  buf.writeUInt32LE(8, 4);

  // IFD0：两个指针
  buf.writeUInt16LE(2, ifd0Offset);
  longEntry(0x8769, exifIfdOffset).copy(buf, ifd0Offset + 2);
  longEntry(0x8825, gpsIfdOffset).copy(buf, ifd0Offset + 14);
  buf.writeUInt32LE(0, ifd0Offset + 26);

  // Exif 子 IFD：DateTimeOriginal
  buf.writeUInt16LE(1, exifIfdOffset);
  const dt = `${dateTime}\0`;
  const dtEntry = Buffer.alloc(12);
  dtEntry.writeUInt16LE(0x9003, 0);
  dtEntry.writeUInt16LE(2, 2);
  dtEntry.writeUInt32LE(dt.length, 4);
  dtEntry.writeUInt32LE(dateOffset, 8);
  dtEntry.copy(buf, exifIfdOffset + 2);
  buf.writeUInt32LE(0, exifIfdOffset + 14);
  buf.write(dt, dateOffset, 'ascii');

  // GPS IFD
  buf.writeUInt16LE(4, gpsIfdOffset);
  asciiEntry(0x0001, 'N\0').copy(buf, gpsIfdOffset + 2);
  rationalEntry(0x0002, latOffset).copy(buf, gpsIfdOffset + 14);
  asciiEntry(0x0003, 'E\0').copy(buf, gpsIfdOffset + 26);
  rationalEntry(0x0004, lngOffset).copy(buf, gpsIfdOffset + 38);
  buf.writeUInt32LE(0, gpsIfdOffset + 50);

  buf.write('N\0', latRefOffset, 'ascii');
  rationalTriplet([
    [31, 1],
    [14, 1],
    [0, 1],
  ]).copy(buf, latOffset);
  buf.write('E\0', lngRefOffset, 'ascii');
  rationalTriplet([
    [121, 1],
    [28, 1],
    [0, 1],
  ]).copy(buf, lngOffset);

  return buf;
}

/** 把 EXIF 作为 APP1 段插到 JPEG 的 SOI 之后。 */
export function withExifGps(jpeg: Buffer, dateTime = '2024:03:05 10:22:31'): Buffer {
  const tiff = buildExifTiff(dateTime);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  const app1 = Buffer.concat([header, payload]);
  if (jpeg.readUInt16BE(0) !== 0xffd8) throw new Error('不是 JPEG');
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/**
 * 按 mediaId 在 uploads 里找到照片目录。
 * 目录是可读命名（`<档案名>-<id8>/<YYYY-MM>/<文件名>-<id8>`），所以按 id 后缀搜。
 */
export function mediaFolder(uploadDir: string, mediaId: string): string {
  const suffix = `-${mediaId.slice(0, 8)}`;
  const stack = [uploadDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name.endsWith(suffix)) return full;
      stack.push(full);
    }
  }
  throw new Error(`找不到媒体目录：${mediaId}`);
}
