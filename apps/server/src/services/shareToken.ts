import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { profiles, shareLinks } from '../db/schema.js';
import { notFound } from '../lib/errors.js';

export interface ResolvedShare {
  link: typeof shareLinks.$inferSelect;
  profile: typeof profiles.$inferSelect;
}

/** 校验公开链接：存在、未撤销、未过期、档案未删除。任何失败都返回 404。 */
export function resolveShareToken(client: DbClient, token: string): ResolvedShare {
  if (!token || token.length < 20) throw notFound('链接无效');
  const link = client.db.select().from(shareLinks).where(eq(shareLinks.token, token)).get();
  if (!link) throw notFound('链接无效或已被撤销');
  if (link.revokedAt) throw notFound('链接已被撤销');
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    throw notFound('链接已过期');
  }
  const profile = client.db.select().from(profiles).where(eq(profiles.id, link.profileId)).get();
  if (!profile || profile.deletedAt) throw notFound('链接无效或已被撤销');
  return { link, profile };
}
