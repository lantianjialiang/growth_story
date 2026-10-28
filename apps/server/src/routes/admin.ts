import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { AdminUserDTO } from '@growth/shared';
import type { AppEnv } from '../auth/middleware.js';
import { requireAdmin } from '../auth/middleware.js';
import { hashPassword } from '../auth/password.js';
import { destroyAllSessions } from '../auth/session.js';
import type { DbClient } from '../db/client.js';
import { profileMembers, profiles, sessions, users } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/validate.js';

/**
 * 账号管理（仅 admin）。
 * 普通账号只能改自己（/auth/me）；这里是「加人、改人、停用、恢复」。
 */
export const adminRoutes = new Hono<AppEnv>();

const roleSchema = z.enum(['admin', 'user']);

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('请输入有效邮箱'),
  password: z.string().min(8, '密码至少 8 位').max(200),
  displayName: z.string().trim().min(1, '请填写昵称').max(60),
  role: roleSchema.default('user'),
});

const updateUserSchema = z.object({
  displayName: z.string().trim().min(1, '请填写昵称').max(60).optional(),
  locale: z.enum(['zh-CN', 'en']).optional(),
  role: roleSchema.optional(),
  /** 管理员直接重置密码，不需要知道旧密码 */
  password: z.string().min(8, '密码至少 8 位').max(200).optional(),
});

function activeAdmins(client: DbClient): number {
  return client.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.deletedAt)))
    .all().length;
}

function ownedProfiles(client: DbClient, userId: string): number {
  return client.db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.ownerId, userId), isNull(profiles.deletedAt)))
    .all().length;
}

function toAdminUser(row: typeof users.$inferSelect, selfId: string, profileCount: number): AdminUserDTO {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    locale: row.locale,
    role: row.role === 'admin' ? 'admin' : 'user',
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
    profileCount,
    disabled: Boolean(row.deletedAt),
    isSelf: row.id === selfId,
  };
}

function getUser(client: DbClient, userId: string) {
  const row = client.db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) throw notFound('账号不存在');
  return row;
}

adminRoutes.get('/admin/users', (c) => {
  const self = requireAdmin(c);
  const client = c.get('client');
  const rows = client.db.select().from(users).all();
  const items = rows
    .map((row) => toAdminUser(row, self.id, ownedProfiles(client, row.id)))
    // 正常账号在前，停用的沉底；同类按创建时间排队
    .sort((a, b) => {
      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  return c.json({ items });
});

adminRoutes.post('/admin/users', async (c) => {
  const self = requireAdmin(c);
  const client = c.get('client');
  const input = await parseJson(c, createUserSchema);

  const existing = client.db.select().from(users).where(eq(users.email, input.email)).get();
  if (existing) {
    throw conflict(
      existing.deletedAt ? '该邮箱属于一个已停用的账号，可在列表里恢复它' : '该邮箱已注册',
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  client.db
    .insert(users)
    .values({
      id,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName,
      locale: 'zh-CN',
      role: input.role,
      createdAt: now,
    })
    .run();

  const row = getUser(client, id);
  return c.json({ user: toAdminUser(row, self.id, 0) }, 201);
});

adminRoutes.patch('/admin/users/:userId', async (c) => {
  const self = requireAdmin(c);
  const client = c.get('client');
  const userId = c.req.param('userId');
  const target = getUser(client, userId);
  const input = await parseJson(c, updateUserSchema);

  if (input.role === 'user' && target.role === 'admin' && activeAdmins(client) <= 1) {
    throw conflict('至少保留一个管理员');
  }

  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.locale !== undefined) patch.locale = input.locale;
  if (input.role !== undefined) patch.role = input.role;
  if (input.password !== undefined) {
    patch.passwordHash = await hashPassword(input.password);
    // 改别人的密码 → 让对方所有设备下线；改自己的密码保留当前会话
    if (target.id !== self.id) destroyAllSessions(client, target.id);
  }
  if (Object.keys(patch).length === 0) throw badRequest('没有需要修改的内容');

  client.db.update(users).set(patch).where(eq(users.id, target.id)).run();
  const row = getUser(client, target.id);
  return c.json({ user: toAdminUser(row, self.id, ownedProfiles(client, row.id)) });
});

adminRoutes.delete('/admin/users/:userId', (c) => {
  const self = requireAdmin(c);
  const client = c.get('client');
  const userId = c.req.param('userId');
  const target = getUser(client, userId);

  if (target.id === self.id) throw conflict('不能停用当前登录的账号');
  if (target.role === 'admin' && activeAdmins(client) <= 1) throw conflict('至少保留一个管理员');

  const owned = ownedProfiles(client, target.id);
  if (owned > 0) {
    throw conflict(`该账号名下还有 ${owned} 个档案，请先处理这些档案`);
  }

  // ?purge=true：从库里彻底删除（只允许删已经停用的账号，留一道缓冲）
  if (c.req.query('purge') === 'true') {
    if (!target.deletedAt) throw conflict('请先停用账号，再彻底删除');
    client.db.delete(sessions).where(eq(sessions.userId, target.id)).run();
    client.db.delete(profileMembers).where(eq(profileMembers.userId, target.id)).run();
    client.db.delete(users).where(eq(users.id, target.id)).run();
    return c.json({ ok: true, purged: true });
  }

  if (target.deletedAt) return c.json({ ok: true, already: true });

  client.db
    .update(users)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(users.id, target.id))
    .run();
  // 立即踢掉该账号的所有会话，并把它的成员身份清掉，避免出现在别人的成员列表里
  destroyAllSessions(client, target.id);
  client.db.delete(profileMembers).where(eq(profileMembers.userId, target.id)).run();

  return c.json({ ok: true });
});

adminRoutes.post('/admin/users/:userId/restore', (c) => {
  const self = requireAdmin(c);
  const client = c.get('client');
  const target = getUser(client, c.req.param('userId'));
  if (!target.deletedAt) return c.json({ ok: true, already: true });

  client.db.update(users).set({ deletedAt: null }).where(eq(users.id, target.id)).run();
  const row = getUser(client, target.id);
  return c.json({ user: toAdminUser(row, self.id, ownedProfiles(client, row.id)) });
});
