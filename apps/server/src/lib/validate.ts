import type { Context } from 'hono';
import type { z } from 'zod';
import { badRequest, unprocessable } from './errors.js';

export async function parseJson<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest('请求体不是合法 JSON');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw unprocessable('参数校验失败', parsed.error.flatten());
  }
  return parsed.data as z.infer<S>;
}

export function parseQuery<S extends z.ZodTypeAny>(c: Context, schema: S): z.infer<S> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(c.req.query())) {
    if (value !== undefined && value !== '') raw[key] = value;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw unprocessable('查询参数不合法', parsed.error.flatten());
  }
  return parsed.data as z.infer<S>;
}

export function intParam(c: Context, name: string): number {
  const value = Number(c.req.param(name));
  if (!Number.isFinite(value)) throw badRequest(`${name} 必须是数字`);
  return value;
}
