import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import type { AppEnv } from '../auth/middleware.js';
import { currentUser, requireUser } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  readSessionToken,
  setSessionCookie,
} from '../auth/session.js';
import { users } from '../db/schema.js';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors.js';
import { clientIp, rateLimit } from '../lib/ratelimit.js';
import { parseJson } from '../lib/validate.js';

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('请输入有效邮箱'),
  password: z.string().min(8, '密码至少 8 位').max(200),
  displayName: z.string().trim().min(1, '请填写昵称').max(60),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('请输入有效邮箱'),
  password: z.string().min(1, '请输入密码'),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/register', async (c) => {
  const ip = clientIp(c.req.raw.headers);
  rateLimit(`register:${ip}`, 10, 60 * 60 * 1000);

  const client = c.get('client');
  // 空库里第一个账号永远是管理员：否则关掉注册后就再也没人能进管理页
  const userCount = client.db.select({ id: users.id }).from(users).all().length;
  if (!config.allowRegistration && userCount > 0) throw forbidden('本站已关闭注册');

  const input = await parseJson(c, registerSchema);
  const existing = client.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get();
  if (existing) throw conflict('该邮箱已注册');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const role = userCount === 0 ? 'admin' : 'user';
  const passwordHash = await hashPassword(input.password);
  client.db
    .insert(users)
    .values({
      id,
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      locale: 'zh-CN',
      role,
      lastLoginAt: now,
      createdAt: now,
    })
    .run();

  const { token, expiresAt } = createSession(client, id, c.req.header('user-agent'));
  setSessionCookie(c, token, expiresAt);

  return c.json(
    { user: { id, email: input.email, displayName: input.displayName, locale: 'zh-CN', role } },
    201,
  );
});

authRoutes.post('/login', async (c) => {
  const ip = clientIp(c.req.raw.headers);
  rateLimit(`login:${ip}`, 15, 15 * 60 * 1000);

  const input = await parseJson(c, loginSchema);
  const client = c.get('client');
  const user = client.db.select().from(users).where(eq(users.email, input.email)).get();
  if (!user || user.deletedAt) {
    // 统一错误信息，避免邮箱枚举
    throw unauthorized('邮箱或密码不正确');
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw unauthorized('邮箱或密码不正确');

  const { token, expiresAt } = createSession(client, user.id, c.req.header('user-agent'));
  setSessionCookie(c, token, expiresAt);

  client.db
    .update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id))
    .run();

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      role: user.role === 'admin' ? 'admin' : 'user',
    },
  });
});

authRoutes.post('/logout', (c) => {
  const client = c.get('client');
  destroySession(client, readSessionToken(c));
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', (c) => {
  const user = currentUser(c);
  if (!user) throw unauthorized('未登录');
  return c.json({ user });
});

authRoutes.post('/password', async (c) => {
  const user = requireUser(c);
  const input = await parseJson(
    c,
    z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, '密码至少 8 位').max(200) }),
  );
  const client = c.get('client');
  const row = client.db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row) throw unauthorized();
  const ok = await verifyPassword(row.passwordHash, input.currentPassword);
  if (!ok) throw badRequest('当前密码不正确');
  if (input.newPassword === input.currentPassword) throw badRequest('新密码不能与当前密码相同');

  client.db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword) })
    .where(eq(users.id, user.id))
    .run();
  return c.json({ ok: true });
});

authRoutes.patch('/me', async (c) => {
  const user = requireUser(c);
  const input = await parseJson(
    c,
    z.object({
      displayName: z.string().trim().min(1).max(60).optional(),
      locale: z.enum(['zh-CN', 'en']).optional(),
    }),
  );
  const client = c.get('client');
  client.db.update(users).set(input).where(eq(users.id, user.id)).run();
  const updated = client.db.select().from(users).where(eq(users.id, user.id)).get()!;
  return c.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      locale: updated.locale,
      role: updated.role === 'admin' ? 'admin' : 'user',
    },
  });
});
