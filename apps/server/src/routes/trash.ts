import { Hono } from 'hono';
import { and, desc, eq, isNotNull, lt } from 'drizzle-orm';
import type { TrashItemDTO } from '@growth/shared';
import type { AppEnv } from '../auth/middleware.js';
import { requireUser } from '../auth/middleware.js';
import { config } from '../config.js';
import type { DbClient } from '../db/client.js';
import { events, media, profiles } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { requireProfileAccess } from '../services/permissions.js';
import { getStorage } from '../storage/index.js';

export const trashRoutes = new Hono<AppEnv>();

function expiryOf(deletedAt: string): string {
  return new Date(
    new Date(deletedAt).getTime() + config.trashRetentionDays * 24 * 3600 * 1000,
  ).toISOString();
}

trashRoutes.get('/profiles/:id/trash', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'view');

  const eventRows = client.db
    .select()
    .from(events)
    .where(and(eq(events.profileId, profile.id), isNotNull(events.deletedAt)))
    .orderBy(desc(events.deletedAt))
    .all();

  const mediaRows = client.db
    .select()
    .from(media)
    .where(and(eq(media.profileId, profile.id), isNotNull(media.deletedAt)))
    .orderBy(desc(media.deletedAt))
    .all();

  const items: TrashItemDTO[] = [
    ...eventRows.map((row) => ({
      kind: 'event' as const,
      id: row.id,
      profileId: row.profileId,
      title: row.title,
      deletedAt: row.deletedAt!,
      thumbUrl: null,
      expiresAt: expiryOf(row.deletedAt!),
    })),
    ...mediaRows.map((row) => ({
      kind: 'media' as const,
      id: row.id,
      profileId: row.profileId,
      title: row.altText || '照片',
      deletedAt: row.deletedAt!,
      thumbUrl: `/api/v1/media/${row.id}/file?size=thumb`,
      expiresAt: expiryOf(row.deletedAt!),
    })),
  ];

  return c.json({ items });
});

/** 彻底删除单条回收站内容（仅所有者，不可恢复）。 */
trashRoutes.delete('/profiles/:id/trash/:kind/:itemId', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');
  const kind = c.req.param('kind');
  const itemId = c.req.param('itemId');

  if (kind === 'event') {
    const row = client.db.select().from(events).where(eq(events.id, itemId)).get();
    if (!row || row.profileId !== profile.id) throw notFound('内容不存在');
    client.db.delete(events).where(eq(events.id, itemId)).run();
    return c.json({ ok: true });
  }
  if (kind === 'media') {
    const row = client.db.select().from(media).where(eq(media.id, itemId)).get();
    if (!row || row.profileId !== profile.id) throw notFound('内容不存在');
    // 先删磁盘再删行：否则上传目录里会留下永远没人引用的孤儿文件
    const storage = getStorage();
    let variants: Record<string, string> = {};
    try {
      variants = JSON.parse(row.variants) as Record<string, string>;
    } catch {
      variants = {};
    }
    await storage.remove(row.originalPath);
    for (const key of Object.values(variants)) await storage.remove(key);
    await storage.pruneEmptyDirs(row.originalPath);
    client.db.delete(media).where(eq(media.id, itemId)).run();
    return c.json({ ok: true });
  }
  throw notFound('类型不存在');
});

/**
 * 清理任务：删除超过保留期（默认 30 天）的回收站内容，并删掉磁盘文件。
 * 服务启动时跑一次，之后每 6 小时一次。
 */
export async function purgeExpiredTrash(client: DbClient, retentionDays: number) {
  const db = client;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
  const storage = getStorage();

  const expiredMedia = db.db
    .select()
    .from(media)
    .where(and(isNotNull(media.deletedAt), lt(media.deletedAt, cutoff)))
    .all();

  for (const row of expiredMedia) {
    let variants: Record<string, string> = {};
    try {
      variants = JSON.parse(row.variants) as Record<string, string>;
    } catch {
      variants = {};
    }
    await storage.remove(row.originalPath);
    for (const key of Object.values(variants)) await storage.remove(key);
    await storage.pruneEmptyDirs(row.originalPath);
    db.db.delete(media).where(eq(media.id, row.id)).run();
  }

  const expiredEvents = db.db
    .select({ id: events.id })
    .from(events)
    .where(and(isNotNull(events.deletedAt), lt(events.deletedAt, cutoff)))
    .all();
  for (const row of expiredEvents) {
    db.db.delete(events).where(eq(events.id, row.id)).run();
  }

  // 已软删除的档案同样在保留期后彻底删除
  const expiredProfiles = db.db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(isNotNull(profiles.deletedAt), lt(profiles.deletedAt, cutoff)))
    .all();
  for (const row of expiredProfiles) {
    db.db.delete(profiles).where(eq(profiles.id, row.id)).run();
  }

  return { media: expiredMedia.length, events: expiredEvents.length, profiles: expiredProfiles.length };
}

trashRoutes.get('/profiles/:id/trash/summary', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'view');
  const e = client.sqlite
    .prepare('SELECT COUNT(*) AS n FROM events WHERE profile_id = ? AND deleted_at IS NOT NULL')
    .get(profile.id) as { n: number };
  const m = client.sqlite
    .prepare('SELECT COUNT(*) AS n FROM media WHERE profile_id = ? AND deleted_at IS NOT NULL')
    .get(profile.id) as { n: number };
  return c.json({ events: e.n, media: m.n, retentionDays: config.trashRetentionDays });
});
