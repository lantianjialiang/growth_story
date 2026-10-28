import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { events, profileMembers, profiles } from '../db/schema.js';
import type { SessionUser } from '../auth/session.js';
import { forbidden, notFound } from '../lib/errors.js';

export type AccessRole = 'owner' | 'editor' | 'viewer';
export type RequiredLevel = 'view' | 'edit' | 'manage';

export type ProfileRow = typeof profiles.$inferSelect;
export type EventRow = typeof events.$inferSelect;

/** 查询用户对某档案的角色；档案不存在（或已删除）返回 null。 */
export function getProfileRole(
  client: DbClient,
  profileId: string,
  userId: string | null | undefined,
  options: { includeDeleted?: boolean } = {},
): AccessRole | null {
  const profile = client.db
    .select({ ownerId: profiles.ownerId, deletedAt: profiles.deletedAt })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .get();
  if (!profile) return null;
  if (profile.deletedAt && !options.includeDeleted) return null;
  if (userId && profile.ownerId === userId) return 'owner';
  if (!userId) return null;
  const member = client.db
    .select({ role: profileMembers.role })
    .from(profileMembers)
    .where(and(eq(profileMembers.profileId, profileId), eq(profileMembers.userId, userId)))
    .get();
  if (!member) return null;
  return member.role === 'editor' ? 'editor' : 'viewer';
}

const LEVEL_RANK: Record<RequiredLevel, number> = { view: 1, edit: 2, manage: 3 };
const ROLE_RANK: Record<AccessRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function roleSatisfies(role: AccessRole | null, level: RequiredLevel): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= LEVEL_RANK[level];
}

/**
 * 服务端权限闸门。任何涉及档案数据的路由都必须先过这里。
 * 对无权访问的档案统一返回 404，避免泄露"这个 id 存在"。
 */
export function requireProfileAccess(
  client: DbClient,
  profileId: string,
  user: SessionUser | null,
  level: RequiredLevel = 'view',
  options: { includeDeleted?: boolean } = {},
): { profile: ProfileRow; role: AccessRole } {
  if (!user) throw notFound('档案不存在');
  const profile = client.db
    .select()
    .from(profiles)
    .where(
      options.includeDeleted
        ? eq(profiles.id, profileId)
        : and(eq(profiles.id, profileId), isNull(profiles.deletedAt)),
    )
    .get();
  if (!profile) throw notFound('档案不存在');

  let role: AccessRole | null;
  if (profile.ownerId === user.id) {
    role = 'owner';
  } else {
    const member = client.db
      .select({ role: profileMembers.role })
      .from(profileMembers)
      .where(and(eq(profileMembers.profileId, profileId), eq(profileMembers.userId, user.id)))
      .get();
    role = member ? (member.role === 'editor' ? 'editor' : 'viewer') : null;
  }

  if (!role) throw notFound('档案不存在');
  if (!roleSatisfies(role, level)) {
    throw forbidden(level === 'manage' ? '只有档案所有者可以执行该操作' : '没有编辑权限');
  }
  return { profile, role };
}

/** 事件级权限：先取事件，再校验档案权限。 */
export function requireEventAccess(
  client: DbClient,
  eventId: string,
  user: SessionUser | null,
  level: RequiredLevel = 'view',
  options: { includeDeleted?: boolean } = {},
): { event: EventRow; role: AccessRole; profile: ProfileRow } {
  const event = client.db.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw notFound('事件不存在');
  if (event.deletedAt && !options.includeDeleted) throw notFound('事件不存在');
  const { profile, role } = requireProfileAccess(client, event.profileId, user, level, options);
  return { event, role, profile };
}
