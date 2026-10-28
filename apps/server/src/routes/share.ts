import crypto from 'node:crypto';
import { Hono } from 'hono';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { memberInviteSchema, shareLinkCreateSchema } from '@growth/shared';
import type { AppEnv } from '../auth/middleware.js';
import { requireUser } from '../auth/middleware.js';
import { profileMembers, shareLinks, users } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/validate.js';
import { requireProfileAccess } from '../services/permissions.js';

export const shareRoutes = new Hono<AppEnv>();

// ---------- 成员 ----------

/**
 * 可以拉进来当成员的本站账号：剔除所有者、自己、已在成员列表里的、已停用的。
 * 前端把它渲染成下拉列表，省得靠记邮箱。
 */
shareRoutes.get('/profiles/:id/member-candidates', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');

  const taken = new Set(
    client.db
      .select({ userId: profileMembers.userId })
      .from(profileMembers)
      .where(eq(profileMembers.profileId, profile.id))
      .all()
      .map((row) => row.userId),
  );
  taken.add(profile.ownerId);
  taken.add(user.id);

  const rows = client.db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(asc(users.displayName))
    .all()
    .filter((row) => !taken.has(row.id));

  return c.json({ items: rows });
});

shareRoutes.get('/profiles/:id/members', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');

  const rows = client.db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: profileMembers.role,
      createdAt: profileMembers.createdAt,
    })
    .from(profileMembers)
    .innerJoin(users, eq(users.id, profileMembers.userId))
    .where(eq(profileMembers.profileId, profile.id))
    .orderBy(asc(profileMembers.createdAt))
    .all();

  const owner = client.db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, profile.ownerId))
    .get();

  return c.json({
    owner: owner ? { ...owner, role: 'owner' as const } : null,
    items: rows,
  });
});

shareRoutes.post('/profiles/:id/members', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');
  const input = await parseJson(c, memberInviteSchema);

  const target = client.db
    .select()
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .get();
  if (!target) throw notFound('该邮箱尚未注册本站账号，请让对方先注册');
  if (target.id === profile.ownerId) throw conflict('对方已经是档案所有者');
  if (target.id === user.id) throw conflict('不能邀请自己');

  const existing = client.db
    .select()
    .from(profileMembers)
    .where(and(eq(profileMembers.profileId, profile.id), eq(profileMembers.userId, target.id)))
    .get();
  if (existing) throw conflict('该用户已在成员列表中');

  client.db
    .insert(profileMembers)
    .values({
      profileId: profile.id,
      userId: target.id,
      role: input.role,
      invitedBy: user.id,
      createdAt: new Date().toISOString(),
    })
    .run();

  return c.json(
    {
      member: {
        userId: target.id,
        email: target.email,
        displayName: target.displayName,
        role: input.role,
        createdAt: new Date().toISOString(),
      },
    },
    201,
  );
});

shareRoutes.patch('/profiles/:id/members/:userId', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');
  const input = await parseJson(c, memberInviteSchema.pick({ role: true }));
  const targetId = c.req.param('userId');

  const existing = client.db
    .select()
    .from(profileMembers)
    .where(and(eq(profileMembers.profileId, profile.id), eq(profileMembers.userId, targetId)))
    .get();
  if (!existing) throw notFound('成员不存在');

  client.db
    .update(profileMembers)
    .set({ role: input.role })
    .where(and(eq(profileMembers.profileId, profile.id), eq(profileMembers.userId, targetId)))
    .run();
  return c.json({ ok: true });
});

shareRoutes.delete('/profiles/:id/members/:userId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');
  const targetId = c.req.param('userId');
  if (targetId === profile.ownerId) throw badRequest('不能移除档案所有者');
  client.db
    .delete(profileMembers)
    .where(and(eq(profileMembers.profileId, profile.id), eq(profileMembers.userId, targetId)))
    .run();
  return c.json({ ok: true });
});

// ---------- 公开链接 ----------

shareRoutes.get('/profiles/:id/share-links', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');

  const rows = client.db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.profileId, profile.id))
    .orderBy(asc(shareLinks.createdAt))
    .all();

  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      token: row.token,
      url: `/s/${row.token}`,
      scope: row.scope as 'profile' | 'event',
      eventId: row.eventId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    })),
  });
});

shareRoutes.post('/profiles/:id/share-links', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');
  const input = await parseJson(c, shareLinkCreateSchema);

  if (input.scope === 'event' && !input.eventId) throw badRequest('事件链接必须指定事件');

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url'); // 256 bit，不可猜测
  const now = new Date();
  const expiresAt = input.expiresInDays
    ? new Date(now.getTime() + input.expiresInDays * 24 * 3600 * 1000).toISOString()
    : null;

  client.db
    .insert(shareLinks)
    .values({
      id,
      profileId: profile.id,
      token,
      scope: input.scope,
      eventId: input.scope === 'event' ? (input.eventId ?? null) : null,
      expiresAt,
      createdBy: user.id,
      createdAt: now.toISOString(),
    })
    .run();

  return c.json(
    {
      link: {
        id,
        token,
        url: `/s/${token}`,
        scope: input.scope,
        eventId: input.eventId ?? null,
        expiresAt,
        revokedAt: null,
        createdAt: now.toISOString(),
      },
    },
    201,
  );
});

shareRoutes.delete('/profiles/:id/share-links/:linkId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');
  const link = client.db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, c.req.param('linkId')), eq(shareLinks.profileId, profile.id)))
    .get();
  if (!link) throw notFound('链接不存在');

  // purge=true：从列表里彻底删除这条记录（撤销后也用来清理痕迹）
  if (c.req.query('purge') === 'true') {
    client.db.delete(shareLinks).where(eq(shareLinks.id, link.id)).run();
    return c.json({ ok: true, purged: true });
  }

  client.db
    .update(shareLinks)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(shareLinks.id, link.id))
    .run();
  return c.json({ ok: true });
});
