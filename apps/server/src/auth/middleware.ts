import type { Context, MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import type { DbClient } from '../db/client.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { readSessionToken, resolveSession, type SessionUser } from './session.js';

export interface AppEnv {
  Variables: {
    user: SessionUser | null;
    client: DbClient;
  };
}

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionUser | null;
    client: DbClient;
  }
}

/** 注入 client + 解析可选会话（不强制登录）。 */
export function contextMiddleware(client: DbClient): MiddlewareHandler {
  return async (c, next) => {
    c.set('client', client);
    c.set('user', resolveSession(client, readSessionToken(c)));
    await next();
  };
}

export function currentUser(c: Context): SessionUser | null {
  return c.get('user') ?? null;
}

export function requireUser(c: Context): SessionUser {
  const user = currentUser(c);
  if (!user) throw unauthorized();
  return user;
}

/** 账号管理只对 admin 开放。 */
export function requireAdmin(c: Context): SessionUser {
  const user = requireUser(c);
  if (user.role !== 'admin') throw forbidden('仅管理员可以管理账号');
  return user;
}

/**
 * CSRF：SameSite=Lax 已挡住大多数跨站表单提交；
 * 这里再加一道 Origin 校验，挡掉同站 but 跨域的写请求。
 */
export function originGuard(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      await next();
      return;
    }
    const origin = c.req.header('origin');
    if (origin) {
      const allowed = new Set<string>();
      if (config.trustOrigin) allowed.add(new URL(config.trustOrigin).origin);
      const host = c.req.header('host');
      if (host) {
        allowed.add(`http://${host}`);
        allowed.add(`https://${host}`);
      }
      if (!allowed.has(origin)) {
        throw forbidden('跨站请求被拒绝');
      }
    }
    await next();
  };
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
