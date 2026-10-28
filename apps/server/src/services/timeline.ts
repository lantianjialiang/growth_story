import { and, asc, desc, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { EventDTO, TimelineYear } from '@growth/shared';
import type { DbClient } from '../db/client.js';
import { eventTags, events, media, tags } from '../db/schema.js';
import { badRequest } from '../lib/errors.js';
import { toEventDTO, type MediaRow } from './serializers.js';
import { tagsForEvents } from './tags.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function encodeCursor(date: string, id: string): string {
  return Buffer.from(`${date}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { date: string; id: string } {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [date, id] = decoded.split('|');
    if (!date || !id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad');
    return { date, id };
  } catch {
    throw badRequest('分页游标不合法');
  }
}

export interface TimelineQuery {
  profileId: string;
  year?: number;
  /** 内置类型 key 或档案自定义类型名称 */
  type?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
  /** 公开链接：过滤 private 事件并改写媒体 URL */
  publicToken?: string;
  order?: 'desc' | 'asc';
}

export interface TimelineResult {
  items: EventDTO[];
  nextCursor: string | null;
}

/** 时间轴的筛选条件（不含分页游标），列表与计数共用。 */
function filterConditions(query: TimelineQuery): (SQL | undefined)[] {
  const conds: (SQL | undefined)[] = [eq(events.profileId, query.profileId), isNull(events.deletedAt)];

  if (query.publicToken) {
    conds.push(eq(events.visibility, 'inherit'));
  }
  if (query.year !== undefined) {
    conds.push(sql`substr(${events.date}, 1, 4) = ${String(query.year)}`);
  }
  if (query.type) {
    conds.push(eq(events.type, query.type));
  }
  if (query.tag) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM event_tags et JOIN tags t ON t.id = et.tag_id WHERE et.event_id = ${events.id} AND t.name = ${query.tag})`,
    );
  }
  return conds;
}

export function listTimeline(client: DbClient, query: TimelineQuery): TimelineResult {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const descOrder = (query.order ?? 'desc') === 'desc';

  const conds = filterConditions(query);

  if (query.cursor) {
    const { date, id } = decodeCursor(query.cursor);
    conds.push(
      descOrder
        ? or(lt(events.date, date), and(eq(events.date, date), lt(events.id, id)))
        : sql`(${events.date} > ${date} OR (${events.date} = ${date} AND ${events.id} > ${id}))`,
    );
  }

  const rows = client.db
    .select()
    .from(events)
    .where(and(...conds))
    .orderBy(descOrder ? desc(events.date) : asc(events.date), descOrder ? desc(events.id) : asc(events.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const ids = pageRows.map((r) => r.id);

  const tagMap = tagsForEvents(client, ids);
  const mediaMap = new Map<string, MediaRow[]>();
  if (ids.length > 0) {
    const mediaRows = client.db
      .select()
      .from(media)
      .where(and(inArray(media.eventId, ids), isNull(media.deletedAt)))
      .orderBy(asc(media.sortOrder), asc(media.createdAt))
      .all();
    for (const row of mediaRows) {
      if (!row.eventId) continue;
      const list = mediaMap.get(row.eventId) ?? [];
      list.push(row);
      mediaMap.set(row.eventId, list);
    }
  }

  const items = pageRows.map((row) =>
    toEventDTO(row, tagMap.get(row.id) ?? [], mediaMap.get(row.id) ?? [], query.publicToken),
  );

  const last = pageRows.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.date, last.id) : null,
  };
}

export function timelineYears(client: DbClient, profileId: string, publicToken?: string): TimelineYear[] {
  const visibility = publicToken ? `AND e.visibility = 'inherit'` : '';
  const rows = client.sqlite
    .prepare(
      `SELECT CAST(substr(e.date, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS event_count,
              (SELECT COUNT(*) FROM media m WHERE m.event_id = e.id AND m.deleted_at IS NULL) AS media_count
       FROM events e
       WHERE e.profile_id = ? AND e.deleted_at IS NULL ${visibility}
       GROUP BY year
       ORDER BY year DESC`,
    )
    .all(profileId) as { year: number; event_count: number; media_count: number }[];
  return rows.map((r) => ({ year: r.year, eventCount: r.event_count, mediaCount: r.media_count }));
}

export function countEvents(client: DbClient, profileId: string, publicToken?: string): number {
  const visibility = publicToken ? 'AND visibility = \'inherit\'' : '';
  const row = client.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE profile_id = ? AND deleted_at IS NULL ${visibility}`)
    .get(profileId) as { n: number };
  return row?.n ?? 0;
}

/** 当前筛选条件下的记录数（不含分页），用于「已经到底了」这类文案。 */
export function countTimeline(client: DbClient, query: TimelineQuery): number {
  const row = client.db
    .select({ n: sql<number>`COUNT(*)` })
    .from(events)
    .where(and(...filterConditions(query)))
    .get();
  return Number(row?.n ?? 0);
}

export { eventTags, tags };
