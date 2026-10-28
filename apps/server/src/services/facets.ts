import type { ProfileFacets, TimelineYear } from '@growth/shared';
import type { DbClient } from '../db/client.js';

/**
 * 筛选器的「候选计数」。
 *
 * 每一维的计数都**排除自己、保留其它筛选条件**（标准的分面搜索语义）：
 * 选了 2020 年之后，标签后面的数字表示「2020 年里有几条」；
 * 选了标签之后，年份后面的数字表示「这个标签在每年有几条」。
 */
export interface FacetFilter {
  year?: number;
  /** 内置类型 key 或档案自定义类型名称 */
  type?: string;
  tag?: string;
  /** 公开链接：只统计 inherit 可见的事件 */
  publicToken?: string;
  /** 公开链接只分享单条记录时，限定在这一条上 */
  onlyEventId?: string;
}


type Skipped = 'year' | 'type' | 'tag';

interface Where {
  clause: string;
  params: (string | number)[];
}

/** 拼一段 `e.*` 上的过滤条件；skip 里列出「这一维不吃自己的筛选」。 */
function buildWhere(
  profileId: string,
  filter: FacetFilter,
  skip: readonly Skipped[] = [],
): Where {
  const parts = ['e.profile_id = ?', 'e.deleted_at IS NULL'];
  const params: (string | number)[] = [profileId];

  if (filter.publicToken) parts.push("e.visibility = 'inherit'");
  if (filter.onlyEventId) {
    parts.push('e.id = ?');
    params.push(filter.onlyEventId);
  }
  if (filter.year !== undefined && !skip.includes('year')) {
    parts.push('substr(e.date, 1, 4) = ?');
    params.push(String(filter.year));
  }
  if (filter.type && !skip.includes('type')) {
    parts.push('e.type = ?');
    params.push(filter.type);
  }
  if (filter.tag && !skip.includes('tag')) {
    parts.push(
      `EXISTS (SELECT 1 FROM event_tags f_et JOIN tags f_t ON f_t.id = f_et.tag_id
               WHERE f_et.event_id = e.id AND f_t.name = ?)`,
    );
    params.push(filter.tag);
  }

  return { clause: parts.join(' AND '), params };
}

function yearFacet(client: DbClient, profileId: string, filter: FacetFilter): TimelineYear[] {
  const { clause, params } = buildWhere(profileId, filter, ['year']);
  const rows = client.sqlite
    .prepare(
      `SELECT CAST(substr(e.date, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS event_count,
              COALESCE(SUM((SELECT COUNT(*) FROM media m
                             WHERE m.event_id = e.id AND m.deleted_at IS NULL)), 0) AS media_count
       FROM events e
       WHERE ${clause}
       GROUP BY year
       ORDER BY year DESC`,
    )
    .all(...params) as { year: number; event_count: number; media_count: number }[];
  return rows.map((row) => ({
    year: row.year,
    eventCount: row.event_count,
    mediaCount: row.media_count,
  }));
}

function tagFacet(client: DbClient, profileId: string, filter: FacetFilter): { name: string; count: number }[] {
  const { clause, params } = buildWhere(profileId, filter, ['tag']);
  const rows = client.sqlite
    .prepare(
      `SELECT t.name AS name, COUNT(*) AS count
       FROM tags t
       JOIN event_tags et ON et.tag_id = t.id
       JOIN events e ON e.id = et.event_id
       WHERE ${clause}
       GROUP BY t.id
       ORDER BY count DESC, t.name`,
    )
    .all(...params) as { name: string; count: number }[];

  // 筛选后没人用的标签也要出现在下拉里（记 0），否则选项会跳来跳去、
  // 已选中的标签也会因为消失而显示成空白。所以先拿全量标签名，再补 0。
  const used = new Set(rows.map((row) => row.name));
  const all = client.sqlite
    .prepare(
      `SELECT DISTINCT t.name AS name
       FROM tags t
       JOIN event_tags et ON et.tag_id = t.id
       JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL
       WHERE t.profile_id = ?
       ORDER BY t.name`,
    )
    .all(profileId) as { name: string }[];

  const items = [...rows];
  for (const row of all) {
    if (used.has(row.name)) continue;
    items.push({ name: row.name, count: 0 });
  }
  return items;
}

export function profileFacets(client: DbClient, profileId: string, filter: FacetFilter = {}): ProfileFacets {
  return {
    years: yearFacet(client, profileId, filter),
    tags: tagFacet(client, profileId, filter),
  };
}
