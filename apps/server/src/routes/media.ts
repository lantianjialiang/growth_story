import { Hono, type Context } from 'hono';
import os from 'node:os';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { mediaRotateSchema, mediaUpdateSchema, type MediaDTO } from '@growth/shared';
import type { AppEnv } from '../auth/middleware.js';
import { currentUser, requireUser } from '../auth/middleware.js';
import { config } from '../config.js';
import { events, media, profiles } from '../db/schema.js';
import { runPool } from '../lib/concurrency.js';
import { badRequest, forbidden, notFound, tooLarge, unprocessable } from '../lib/errors.js';
import { streamFileBody } from '../lib/fileStream.js';
import { parseJson } from '../lib/validate.js';
import {
  dirnameOfKey,
  processImage,
  rotateBuffer,
  sha256,
} from '../media/pipeline.js';
import { requireProfileAccess } from '../services/permissions.js';
import { toMediaDTO } from '../services/serializers.js';
import { getStorage } from '../storage/index.js';

export const mediaRoutes = new Hono<AppEnv>();

const MAX_FILES_PER_REQUEST = 20;
/** 一批照片同时处理几个：sharp 自己也会吃多线程，3 个基本能跑满 CPU 而不互相拖累 */
const UPLOAD_CONCURRENCY = Math.max(1, Math.min(3, os.availableParallelism?.() ?? os.cpus().length));

/** 档案内最近的图片列表（用于选择头像、管理页预览）。 */
mediaRoutes.get('/profiles/:id/media', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'view');
  const limit = Math.min(Number(c.req.query('limit') ?? 60) || 60, 200);
  const rows = client.db
    .select()
    .from(media)
    .where(and(eq(media.profileId, profile.id), isNull(media.deletedAt)))
    .orderBy(sql`${media.takenAt} IS NULL`, sql`${media.takenAt} DESC`, sql`${media.createdAt} DESC`)
    .limit(limit)
    .all();
  return c.json({ items: rows.map((row) => toMediaDTO(row)) });
});

mediaRoutes.post('/profiles/:id/media', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'edit');

  let body: Record<string, unknown>;
  try {
    body = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    throw badRequest('上传内容无法解析');
  }

  const rawFiles: unknown[] = [];
  for (const key of ['files', 'file', 'files[]']) {
    const value = body[key];
    if (!value) continue;
    if (Array.isArray(value)) rawFiles.push(...value);
    else rawFiles.push(value);
  }
  const files = rawFiles.filter((f): f is File => f instanceof File);
  if (files.length === 0) throw badRequest('没有收到文件');
  if (files.length > MAX_FILES_PER_REQUEST) throw tooLarge(`单次最多上传 ${MAX_FILES_PER_REQUEST} 个文件`);

  const eventIdRaw = body.eventId;
  const eventId = typeof eventIdRaw === 'string' && eventIdRaw ? eventIdRaw : null;
  if (eventId) {
    const ev = client.db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).get();
    if (!ev) throw notFound('目标事件不存在');
  }

  const storage = getStorage();
  const created: MediaDTO[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const taken = new Set<string>();

  const duplicateOf = (hash: string) =>
    client.db
      .select()
      .from(media)
      .where(and(eq(media.profileId, profile.id), eq(media.sha256, hash), isNull(media.deletedAt)))
      .get();

  const handleOne = async (file: File) => {
    const name = file.name || 'upload';
    if (file.size > config.maxUploadBytes) {
      skipped.push({ name, reason: `超过 ${Math.round(config.maxUploadBytes / 1024 / 1024)}MB 限制` });
      return;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      skipped.push({ name, reason: '空文件' });
      return;
    }

    // 先算指纹再处理：重复照片不必走解码 / 编码这一大圈
    const hash = sha256(buffer);
    if (taken.has(hash) || duplicateOf(hash)) {
      skipped.push({ name, reason: '重复照片，已自动跳过' });
      return;
    }
    taken.add(hash);

    const id = crypto.randomUUID();
    let processed;
    try {
      processed = await processImage(buffer, {
        keyInput: {
          profileName: profile.name,
          profileId: profile.id,
          mediaId: id,
          fileName: name,
        },
        storage,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      skipped.push({
        name,
        reason: code === 'unsupported_media_type' ? '不支持的图片格式（MVP 仅支持图片）' : '图片处理失败',
      });
      return;
    }

    // 并发处理时同批次的相同照片可能同时到达，落库前再确认一次
    if (duplicateOf(processed.sha256)) {
      await storage.remove(processed.originalKey);
      await storage.remove(processed.variants.thumb);
      await storage.remove(processed.variants.medium);
      skipped.push({ name, reason: '重复照片，已自动跳过' });
      return;
    }

    const now = new Date().toISOString();
    client.db
      .insert(media)
      .values({
        id,
        profileId: profile.id,
        eventId,
        kind: 'image',
        originalPath: processed.originalKey,
        originalName: name,
        mime: processed.mime,
        sizeBytes: processed.sizeBytes,
        width: processed.width,
        height: processed.height,
        takenAt: processed.takenAt,
        takenTzOffset: processed.takenTzOffset,
        sha256: processed.sha256,
        variants: JSON.stringify(processed.variants),
        status: 'ready',
        uploadedBy: user.id,
        createdAt: now,
      })
      .run();

    const row = client.db.select().from(media).where(eq(media.id, id)).get()!;
    created.push(toMediaDTO(row));
  };

  // 多张照片并行处理（sharp 本身也吃多线程，3 个刚好不互相拖累）
  await runPool(files, UPLOAD_CONCURRENCY, handleOne);

  client.db.update(profiles).set({ updatedAt: new Date().toISOString() }).where(eq(profiles.id, profile.id)).run();

  if (created.length === 0 && skipped.length > 0) {
    throw unprocessable(skipped[0]!.reason, { skipped });
  }
  return c.json({ items: created, skipped }, 201);
});

mediaRoutes.get('/media/:mediaId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const row = client.db.select().from(media).where(eq(media.id, c.req.param('mediaId'))).get();
  if (!row || row.deletedAt) throw notFound('图片不存在');
  requireProfileAccess(client, row.profileId, user, 'view');
  return c.json({ media: toMediaDTO(row) });
});

/** 鉴权后的文件读取：未登录 / 无权限一律 404，避免猜测。 */
mediaRoutes.get('/media/:mediaId/file', (c) => {
  const client = c.get('client');
  const row = client.db.select().from(media).where(eq(media.id, c.req.param('mediaId'))).get();
  if (!row || row.deletedAt) throw notFound('图片不存在');

  const user = currentUser(c);
  try {
    requireProfileAccess(client, row.profileId, user, 'view');
  } catch {
    throw notFound('图片不存在');
  }

  return serveMedia(c, row);
});

export function serveMedia(c: Context, row: typeof media.$inferSelect) {
  const size = c.req.query('size') ?? 'medium';
  if (size !== 'thumb' && size !== 'medium' && size !== 'original') {
    throw badRequest('size 只能是 thumb / medium / original');
  }

  let variants: Record<string, string> = {};
  try {
    variants = JSON.parse(row.variants) as Record<string, string>;
  } catch {
    variants = {};
  }
  const key = size === 'original' ? row.originalPath : (variants[size] ?? row.originalPath);
  const storage = getStorage();
  if (!storage.exists(key)) throw notFound('文件已丢失');

  const stat = storage.stat(key);
  const etag = `"${row.id}-${size}-${stat.size}"`;
  if (c.req.header('if-none-match') === etag) {
    return c.body(null, 304);
  }

  const mime = size === 'original' ? row.mime : 'image/webp';
  c.header('Content-Type', mime);
  c.header('Content-Length', String(stat.size));
  c.header('Cache-Control', 'private, max-age=31536000, immutable');
  c.header('ETag', etag);
  c.header('Content-Disposition', `inline; filename="${size}.${mime.split('/')[1] ?? 'bin'}"`);
  c.header('X-Content-Type-Options', 'nosniff');

  return c.body(streamFileBody(storage.resolve(key)));
}

/**
 * 旋转已上传的照片：从原图重新算一遍（原图 + 各尺寸），
 * 这样反复旋转也不会累积画质损失。
 */
mediaRoutes.post('/media/:mediaId/rotate', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const row = client.db.select().from(media).where(eq(media.id, c.req.param('mediaId'))).get();
  if (!row || row.deletedAt) throw notFound('图片不存在');
  requireProfileAccess(client, row.profileId, user, 'edit');
  const input = await parseJson(c, mediaRotateSchema);

  const storage = getStorage();
  if (!storage.exists(row.originalPath)) throw notFound('文件已丢失');

  const rotated = await rotateBuffer(await storage.read(row.originalPath), input.degrees);
  // 原地重写：沿用原来的目录，不因为旋转把文件挪走
  const processed = await processImage(rotated, {
    keyPrefix: dirnameOfKey(row.originalPath),
    storage,
  });
  // 格式不变时路径一致；万一变了就清掉旧文件，避免留孤儿
  if (processed.originalKey !== row.originalPath) await storage.remove(row.originalPath);

  client.db
    .update(media)
    .set({
      originalPath: processed.originalKey,
      mime: processed.mime,
      sizeBytes: processed.sizeBytes,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      variants: JSON.stringify(processed.variants),
    })
    .where(eq(media.id, row.id))
    .run();

  const updated = client.db.select().from(media).where(eq(media.id, row.id)).get()!;
  return c.json({ media: toMediaDTO(updated) });
});

mediaRoutes.patch('/media/:mediaId', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const row = client.db.select().from(media).where(eq(media.id, c.req.param('mediaId'))).get();
  if (!row || row.deletedAt) throw notFound('图片不存在');
  requireProfileAccess(client, row.profileId, user, 'edit');
  const input = await parseJson(c, mediaUpdateSchema);

  const patch: Partial<typeof media.$inferInsert> = {};
  if (input.altText !== undefined) patch.altText = input.altText ?? null;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.eventId !== undefined) {
    if (input.eventId) {
      const ev = client.db.select({ id: events.id, profileId: events.profileId }).from(events).where(eq(events.id, input.eventId)).get();
      if (!ev || ev.profileId !== row.profileId) throw forbidden('不能把图片移动到其他档案的事件');
    }
    patch.eventId = input.eventId ?? null;
  }

  if (Object.keys(patch).length > 0) {
    client.db.update(media).set(patch).where(eq(media.id, row.id)).run();
  }
  const updated = client.db.select().from(media).where(eq(media.id, row.id)).get()!;
  return c.json({ media: toMediaDTO(updated) });
});

mediaRoutes.delete('/media/:mediaId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const row = client.db.select().from(media).where(eq(media.id, c.req.param('mediaId'))).get();
  if (!row || row.deletedAt) throw notFound('图片不存在');
  requireProfileAccess(client, row.profileId, user, 'edit');
  client.db.update(media).set({ deletedAt: new Date().toISOString() }).where(eq(media.id, row.id)).run();
  // 封面引用清空
  client.db
    .update(events)
    .set({ coverMediaId: null })
    .where(and(eq(events.coverMediaId, row.id)))
    .run();
  return c.json({ ok: true });
});

mediaRoutes.post('/media/:mediaId/restore', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const row = client.db.select().from(media).where(eq(media.id, c.req.param('mediaId'))).get();
  if (!row) throw notFound('图片不存在');
  requireProfileAccess(client, row.profileId, user, 'edit');
  if (!row.deletedAt) throw notFound('该图片不在回收站');
  client.db.update(media).set({ deletedAt: null }).where(eq(media.id, row.id)).run();
  return c.json({ ok: true });
});
