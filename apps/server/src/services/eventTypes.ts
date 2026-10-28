import { and, asc, eq } from 'drizzle-orm';
import {
  EVENT_TYPES,
  EVENT_TYPE_MAX_LENGTH,
  isBuiltinEventType,
  type EventTypeDTO,
} from '@growth/shared';
import type { DbClient } from '../db/client.js';
import { eventTypes, events } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

/** 类型名称统一格式：去首尾空白、合并内部空白。 */
export function normalizeTypeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function usageCounts(client: DbClient, profileId: string): Map<string, number> {
  const rows = client.sqlite
    .prepare(
      `SELECT type, COUNT(*) AS n FROM events
        WHERE profile_id = ? AND deleted_at IS NULL
        GROUP BY type`,
    )
    .all(profileId) as { type: string; n: number }[];
  return new Map(rows.map((row) => [row.type, row.n]));
}

/** 内置类型在前，自定义类型按创建时间在后；顺便带上各自被用到的次数。 */
export function listEventTypes(client: DbClient, profileId: string): EventTypeDTO[] {
  const counts = usageCounts(client, profileId);
  const custom = client.db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.profileId, profileId))
    .orderBy(asc(eventTypes.createdAt))
    .all();

  const items: EventTypeDTO[] = EVENT_TYPES.map((type) => ({
    type,
    id: null,
    custom: false,
    usingCount: counts.get(type) ?? 0,
  }));

  for (const row of custom) {
    items.push({ type: row.label, id: row.id, custom: true, usingCount: counts.get(row.label) ?? 0 });
  }

  // 历史数据里可能存在既不是内置、也不在类型表里的名称，兜底列出来，避免筛选不到
  for (const [type, count] of counts) {
    if (!type || items.some((item) => item.type === type)) continue;
    items.push({ type, id: null, custom: true, usingCount: count });
  }
  return items;
}

/** 事件落库前校验类型：必须是内置类型或本档案已创建的自定义类型。 */
export function assertEventType(client: DbClient, profileId: string, raw: string): string {
  const label = normalizeTypeLabel(raw);
  if (isBuiltinEventType(label)) return label;
  if (!label) throw badRequest('请选择类型');
  if (label.length > EVENT_TYPE_MAX_LENGTH) throw badRequest('类型名称过长');
  const row = client.db
    .select({ id: eventTypes.id })
    .from(eventTypes)
    .where(and(eq(eventTypes.profileId, profileId), eq(eventTypes.label, label)))
    .get();
  if (!row) throw badRequest(`「${label}」不是这个档案的类型，请先在「类型与标签」里添加`);
  return label;
}

export function createEventType(client: DbClient, profileId: string, raw: string): EventTypeDTO {
  const label = normalizeTypeLabel(raw);
  if (!label) throw badRequest('请填写类型名称');
  if (label.length > EVENT_TYPE_MAX_LENGTH) throw badRequest(`类型名称最多 ${EVENT_TYPE_MAX_LENGTH} 个字`);
  if (isBuiltinEventType(label)) throw conflict('这是系统内置类型，不需要重复添加');

  const existing = client.db
    .select({ id: eventTypes.id })
    .from(eventTypes)
    .where(and(eq(eventTypes.profileId, profileId), eq(eventTypes.label, label)))
    .get();
  if (existing) throw conflict('已经有同名的类型了');

  const id = crypto.randomUUID();
  client.db
    .insert(eventTypes)
    .values({ id, profileId, label, createdAt: new Date().toISOString() })
    .run();
  return { type: label, id, custom: true, usingCount: 0 };
}

/** 改名会同步改写已有事件上的类型名称，保证筛选和展示一致。 */
export function renameEventType(
  client: DbClient,
  profileId: string,
  typeId: string,
  raw: string,
): EventTypeDTO {
  const label = normalizeTypeLabel(raw);
  if (!label) throw badRequest('请填写类型名称');
  if (label.length > EVENT_TYPE_MAX_LENGTH) throw badRequest(`类型名称最多 ${EVENT_TYPE_MAX_LENGTH} 个字`);
  if (isBuiltinEventType(label)) throw conflict('不能改成系统内置类型的名称');

  const row = client.db
    .select()
    .from(eventTypes)
    .where(and(eq(eventTypes.profileId, profileId), eq(eventTypes.id, typeId)))
    .get();
  if (!row) throw notFound('类型不存在');
  if (row.label === label) return { type: label, id: row.id, custom: true, usingCount: 0 };

  const clash = client.db
    .select({ id: eventTypes.id })
    .from(eventTypes)
    .where(and(eq(eventTypes.profileId, profileId), eq(eventTypes.label, label)))
    .get();
  if (clash) throw conflict('已经有同名的类型了');

  const run = client.sqlite.transaction(() => {
    client.db.update(eventTypes).set({ label }).where(eq(eventTypes.id, row.id)).run();
    client.db
      .update(events)
      .set({ type: label })
      .where(and(eq(events.profileId, profileId), eq(events.type, row.label)))
      .run();
  });
  run();

  return {
    type: label,
    id: row.id,
    custom: true,
    usingCount: usageCounts(client, profileId).get(label) ?? 0,
  };
}

/** 删除类型：用过它的记录回退到「其他」，不删记录本身。 */
export function deleteEventType(client: DbClient, profileId: string, typeId: string): { movedEvents: number } {
  const row = client.db
    .select()
    .from(eventTypes)
    .where(and(eq(eventTypes.profileId, profileId), eq(eventTypes.id, typeId)))
    .get();
  if (!row) throw notFound('类型不存在');

  const moved = client.sqlite
    .prepare('SELECT COUNT(*) AS n FROM events WHERE profile_id = ? AND type = ?')
    .get(profileId, row.label) as { n: number };

  const run = client.sqlite.transaction(() => {
    client.db
      .update(events)
      .set({ type: 'other' })
      .where(and(eq(events.profileId, profileId), eq(events.type, row.label)))
      .run();
    client.db.delete(eventTypes).where(eq(eventTypes.id, row.id)).run();
  });
  run();

  return { movedEvents: moved?.n ?? 0 };
}
