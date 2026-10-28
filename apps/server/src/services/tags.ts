import { and, eq, inArray } from 'drizzle-orm';
import type { TagDTO } from '@growth/shared';
import type { DbClient } from '../db/client.js';
import { eventTags, tags } from '../db/schema.js';

export function setEventTags(
  client: DbClient,
  profileId: string,
  eventId: string,
  names: string[],
): void {
  const clean = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 24)),
  ).slice(0, 12);

  client.db.delete(eventTags).where(eq(eventTags.eventId, eventId)).run();
  if (clean.length === 0) return;

  for (const name of clean) {
    let tag = client.db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.profileId, profileId), eq(tags.name, name)))
      .get();
    if (!tag) {
      const id = crypto.randomUUID();
      client.db.insert(tags).values({ id, profileId, name }).run();
      tag = { id };
    }
    client.db.insert(eventTags).values({ eventId, tagId: tag.id }).onConflictDoNothing().run();
  }
}

export function tagsForEvents(client: DbClient, eventIds: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (eventIds.length === 0) return map;
  const rows = client.db
    .select({ eventId: eventTags.eventId, name: tags.name })
    .from(eventTags)
    .innerJoin(tags, eq(tags.id, eventTags.tagId))
    .where(inArray(eventTags.eventId, eventIds))
    .orderBy(tags.name)
    .all();
  for (const row of rows) {
    const list = map.get(row.eventId) ?? [];
    list.push(row.name);
    map.set(row.eventId, list);
  }
  return map;
}

export function listProfileTags(client: DbClient, profileId: string): { name: string; count: number }[] {
  return client.sqlite
    .prepare(
      `SELECT t.name AS name, COUNT(et.event_id) AS count
       FROM tags t
       JOIN event_tags et ON et.tag_id = t.id
       JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL
       WHERE t.profile_id = ?
       GROUP BY t.id
       ORDER BY count DESC, t.name`,
    )
    .all(profileId) as { name: string; count: number }[];
}

/** 管理页用：带上 id，并把还没被用到的标签也列出来（count = 0）。 */
export function listProfileTagsDetailed(client: DbClient, profileId: string): TagDTO[] {
  return client.sqlite
    .prepare(
      `SELECT t.id AS id, t.name AS name,
              (SELECT COUNT(*) FROM event_tags et
                 JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL
                WHERE et.tag_id = t.id) AS count
       FROM tags t
       WHERE t.profile_id = ?
       ORDER BY count DESC, t.name`,
    )
    .all(profileId) as TagDTO[];
}

export function getTag(client: DbClient, profileId: string, tagId: string) {
  return client.db
    .select()
    .from(tags)
    .where(and(eq(tags.profileId, profileId), eq(tags.id, tagId)))
    .get();
}

export function tagNameTaken(client: DbClient, profileId: string, name: string, exceptId?: string): boolean {
  const row = client.db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.profileId, profileId), eq(tags.name, name)))
    .get();
  return Boolean(row && row.id !== exceptId);
}
