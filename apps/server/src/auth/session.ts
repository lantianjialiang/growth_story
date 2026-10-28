import crypto from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../config.js';
import type { DbClient } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

export type UserRole = 'admin' | 'user';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  role: UserRole;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createSession(
  client: DbClient,
  userId: string,
  userAgent?: string | null,
): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionTtlDays * 24 * 3600 * 1000);
  client.db
    .insert(sessions)
    .values({
      tokenHash: sha256(token),
      userId,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      userAgent: userAgent ?? null,
    })
    .run();
  return { token, expiresAt: expires.toISOString() };
}

export function resolveSession(client: DbClient, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = client.db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      locale: users.locale,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        gt(sessions.expiresAt, new Date().toISOString()),
        // 被停用的账号，旧 Cookie 立刻失效
        isNull(users.deletedAt),
      ),
    )
    .get();
  if (!row) return null;
  return {
    ...row,
    role: row.role === 'admin' ? 'admin' : 'user',
  } as SessionUser;
}

export function destroySession(client: DbClient, token: string | undefined): void {
  if (!token) return;
  client.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token))).run();
}

export function destroyAllSessions(client: DbClient, userId: string): void {
  client.db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function setSessionCookie(c: Context, token: string, expiresAt: string): void {
  setCookie(c, config.cookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.cookieSecure,
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, config.cookieName, { path: '/' });
}

export function readSessionToken(c: Context): string | undefined {
  return getCookie(c, config.cookieName);
}
