import { Hono } from 'hono';
import { and, desc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { normalizeByPrecision, type AnniversaryInput, type DatePrecision } from '@growth/shared';
import type { AppEnv } from '../auth/middleware.js';
import { requireUser } from '../auth/middleware.js';
import { config } from '../config.js';
import { media, profileMembers, profiles } from '../db/schema.js';
import { notFound, badRequest } from '../lib/errors.js';
import { parseJson } from '../lib/validate.js';
import { profileCreateSchema, profileUpdateSchema } from '@growth/shared';
import { requireProfileAccess } from '../services/permissions.js';
import { statsForProfile, statsForProfiles, yearsIndex } from '../services/profileStats.js';
import { toProfileDTO } from '../services/serializers.js';
import { getStorage } from '../storage/index.js';

export const profileRoutes = new Hono<AppEnv>();

function avatarUrl(mediaId: string | null): string | null {
  return mediaId ? `/api/v1/media/${mediaId}/file?size=thumb` : null;
}

/** 统一整理纪念日：补齐 id、按精度规范化日期、去掉空行。 */
function serializeAnniversaries(list: AnniversaryInput[] | undefined): string {
  const items = (list ?? [])
    .filter((item) => item.label.trim() && item.date)
    .map((item) => ({
      id: item.id ?? crypto.randomUUID(),
      label: item.label.trim(),
      date: normalizeByPrecision(item.date, item.precision as DatePrecision),
      precision: item.precision,
    }));
  return JSON.stringify(items);
}

profileRoutes.get('/profiles', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const includeArchived = c.req.query('archived') === 'true';

  // 回收站视图：只返回自己名下、已软删除的档案（成员关系不参与，避免泄露）
  if (c.req.query('deleted') === 'true') {
    const rows = client.db
      .select()
      .from(profiles)
      .where(and(eq(profiles.ownerId, user.id), isNotNull(profiles.deletedAt)))
      .orderBy(desc(profiles.deletedAt))
      .all();
    const stats = statsForProfiles(client, rows.map((r) => r.id));
    const items = rows.map((row) => ({
      // 已删除档案的头像文件不可访问，统一回退到首字母
      ...toProfileDTO(
        row,
        'owner',
        stats.get(row.id) ?? { eventCount: 0, mediaCount: 0, lastEventDate: null },
        null,
      ),
      deletedAt: row.deletedAt!,
      expiresAt: new Date(
        new Date(row.deletedAt!).getTime() + config.trashRetentionDays * 24 * 3600 * 1000,
      ).toISOString(),
    }));
    return c.json({ items, retentionDays: config.trashRetentionDays });
  }

  const memberIds = client.db
    .select({ id: profileMembers.profileId })
    .from(profileMembers)
    .where(eq(profileMembers.userId, user.id));

  const rows = client.db
    .select()
    .from(profiles)
    .where(
      and(
        isNull(profiles.deletedAt),
        includeArchived ? undefined : isNull(profiles.archivedAt),
        or(eq(profiles.ownerId, user.id), inArray(profiles.id, memberIds)),
      ),
    )
    .orderBy(desc(profiles.updatedAt))
    .all();

  const stats = statsForProfiles(client, rows.map((r) => r.id));
  const myMemberships = new Map(
    client.db
      .select({ profileId: profileMembers.profileId, role: profileMembers.role })
      .from(profileMembers)
      .where(eq(profileMembers.userId, user.id))
      .all()
      .map((m) => [m.profileId, m.role] as const),
  );

  const items = rows.map((row) => {
    const role = row.ownerId === user.id ? 'owner' : (myMemberships.get(row.id) ?? 'viewer');
    return toProfileDTO(
      row,
      role as 'owner' | 'editor' | 'viewer',
      stats.get(row.id) ?? { eventCount: 0, mediaCount: 0, lastEventDate: null },
      avatarUrl(row.avatarMediaId),
    );
  });

  return c.json({ items });
});

profileRoutes.post('/profiles', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const input = await parseJson(c, profileCreateSchema);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const birthDate = input.birthDate
    ? normalizeByPrecision(input.birthDate, input.birthPrecision as DatePrecision)
    : null;
  const deathDate = input.deathDate
    ? normalizeByPrecision(input.deathDate, input.deathPrecision as DatePrecision)
    : null;

  client.db
    .insert(profiles)
    .values({
      id,
      ownerId: user.id,
      kind: input.kind,
      name: input.name,
      birthDate,
      birthPrecision: input.birthPrecision,
      deathDate,
      deathPrecision: input.deathPrecision,
      anniversaries: serializeAnniversaries(input.anniversaries),
      attributes: JSON.stringify(input.attributes ?? {}),
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const row = client.db.select().from(profiles).where(eq(profiles.id, id)).get()!;
  return c.json(
    {
      profile: toProfileDTO(
        row,
        'owner',
        { eventCount: 0, mediaCount: 0, lastEventDate: null },
        null,
      ),
    },
    201,
  );
});

profileRoutes.get('/profiles/:id', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile, role } = requireProfileAccess(client, c.req.param('id'), user, 'view');
  return c.json({
    profile: toProfileDTO(profile, role, statsForProfile(client, profile.id), avatarUrl(profile.avatarMediaId)),
    years: yearsIndex(client, profile.id),
  });
});

profileRoutes.patch('/profiles/:id', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');
  const input = await parseJson(c, profileUpdateSchema);

  const patch: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.note !== undefined) patch.note = input.note ?? null;
  if (input.attributes !== undefined) patch.attributes = JSON.stringify(input.attributes);
  if (input.anniversaries !== undefined) patch.anniversaries = serializeAnniversaries(input.anniversaries);
  if (input.avatarMediaId !== undefined) patch.avatarMediaId = input.avatarMediaId ?? null;
  if (input.archived !== undefined) {
    patch.archivedAt = input.archived ? new Date().toISOString() : null;
  }
  if (input.birthDate !== undefined) {
    patch.birthDate = input.birthDate
      ? normalizeByPrecision(input.birthDate, (input.birthPrecision ?? profile.birthPrecision) as DatePrecision)
      : null;
    patch.birthPrecision = input.birthPrecision ?? profile.birthPrecision;
  } else if (input.birthPrecision !== undefined) {
    patch.birthPrecision = input.birthPrecision;
    if (profile.birthDate) patch.birthDate = normalizeByPrecision(profile.birthDate, input.birthPrecision as DatePrecision);
  }
  if (input.deathDate !== undefined) {
    patch.deathDate = input.deathDate
      ? normalizeByPrecision(input.deathDate, (input.deathPrecision ?? profile.deathPrecision) as DatePrecision)
      : null;
    patch.deathPrecision = input.deathPrecision ?? profile.deathPrecision;
  } else if (input.deathPrecision !== undefined) {
    patch.deathPrecision = input.deathPrecision;
    if (profile.deathDate) patch.deathDate = normalizeByPrecision(profile.deathDate, input.deathPrecision as DatePrecision);
  }

  client.db.update(profiles).set(patch).where(eq(profiles.id, profile.id)).run();
  const updated = client.db.select().from(profiles).where(eq(profiles.id, profile.id)).get()!;
  return c.json({
    profile: toProfileDTO(
      updated,
      'owner',
      statsForProfile(client, profile.id),
      avatarUrl(updated.avatarMediaId),
    ),
  });
});

profileRoutes.delete('/profiles/:id', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');
  client.db
    .update(profiles)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(profiles.id, profile.id))
    .run();
  return c.json({ ok: true });
});

profileRoutes.post('/profiles/:id/restore', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const profile = client.db.select().from(profiles).where(eq(profiles.id, c.req.param('id'))).get();
  if (!profile || profile.ownerId !== user.id) throw notFound('档案不存在');
  client.db.update(profiles).set({ deletedAt: null }).where(eq(profiles.id, profile.id)).run();
  return c.json({ ok: true });
});

/** 从回收站彻底删除：档案、事件、照片记录与磁盘文件一起清掉，不可恢复。 */
profileRoutes.delete('/profiles/:id/permanent', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const profile = client.db.select().from(profiles).where(eq(profiles.id, c.req.param('id'))).get();
  if (!profile || profile.ownerId !== user.id) throw notFound('档案不存在');
  if (!profile.deletedAt) throw badRequest('请先把档案移入回收站');

  const storage = getStorage();
  const rows = client.db.select().from(media).where(eq(media.profileId, profile.id)).all();
  for (const row of rows) {
    await storage.remove(row.originalPath);
    try {
      const variants = JSON.parse(row.variants) as Record<string, string>;
      for (const key of Object.values(variants)) await storage.remove(key);
    } catch {
      // variants 解析失败时忽略，至少原图已删除
    }
    await storage.pruneEmptyDirs(row.originalPath);
  }

  // 外键均带 onDelete: cascade，删除档案会连带清理成员、分享、事件、标签与照片记录
  client.db.delete(profiles).where(eq(profiles.id, profile.id)).run();
  return c.json({ ok: true });
});
