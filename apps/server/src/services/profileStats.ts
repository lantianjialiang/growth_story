import type { DbClient } from '../db/client.js';

export interface ProfileStats {
  eventCount: number;
  mediaCount: number;
  lastEventDate: string | null;
}

export function statsForProfile(client: DbClient, profileId: string): ProfileStats {
  const eventCount =
    client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM events WHERE profile_id = ? AND deleted_at IS NULL')
      .get(profileId) as { n: number };
  const mediaCount =
    client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM media WHERE profile_id = ? AND deleted_at IS NULL')
      .get(profileId) as { n: number };
  const last =
    client.sqlite
      .prepare(
        'SELECT MAX(date) AS d FROM events WHERE profile_id = ? AND deleted_at IS NULL',
      )
      .get(profileId) as { d: string | null };
  return {
    eventCount: eventCount?.n ?? 0,
    mediaCount: mediaCount?.n ?? 0,
    lastEventDate: last?.d ?? null,
  };
}

/** 档案列表用：一次查询拿到全部统计，避免 N+1。 */
export function statsForProfiles(
  client: DbClient,
  profileIds: string[],
): Map<string, ProfileStats> {
  const map = new Map<string, ProfileStats>();
  if (profileIds.length === 0) return map;
  const rows = client.sqlite
    .prepare(
      `SELECT p.id AS id,
        (SELECT COUNT(*) FROM events e WHERE e.profile_id = p.id AND e.deleted_at IS NULL) AS event_count,
        (SELECT COUNT(*) FROM media m WHERE m.profile_id = p.id AND m.deleted_at IS NULL) AS media_count,
        (SELECT MAX(e.date) FROM events e WHERE e.profile_id = p.id AND e.deleted_at IS NULL) AS last_event_date
       FROM profiles p
       WHERE p.id IN (${profileIds.map(() => '?').join(',')})`,
    )
    .all(...profileIds) as { id: string; event_count: number; media_count: number; last_event_date: string | null }[];
  for (const row of rows) {
    map.set(row.id, {
      eventCount: row.event_count,
      mediaCount: row.media_count,
      lastEventDate: row.last_event_date,
    });
  }
  return map;
}

/** 时间轴年份索引：按年聚合事件数与照片数。 */
export function yearsIndex(
  client: DbClient,
  profileId: string,
): { year: number; eventCount: number; mediaCount: number }[] {
  const rows = client.sqlite
    .prepare(
      `SELECT CAST(substr(e.date, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS event_count,
              (SELECT COUNT(*) FROM media m WHERE m.event_id = e.id AND m.deleted_at IS NULL) AS media_count
       FROM events e
       WHERE e.profile_id = ? AND e.deleted_at IS NULL
       GROUP BY year
       ORDER BY year DESC`,
    )
    .all(profileId) as { year: number; event_count: number; media_count: number }[];
  return rows.map((r) => ({ year: r.year, eventCount: r.event_count, mediaCount: r.media_count }));
}

export function deletedMediaCount(client: DbClient, profileId: string): number {
  const row = client.sqlite
    .prepare('SELECT COUNT(*) AS n FROM media WHERE profile_id = ? AND deleted_at IS NOT NULL')
    .get(profileId) as { n: number };
  return row?.n ?? 0;
}
