import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import type { AppEnv } from '../auth/middleware.js';
import { events, media } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { countEvents, countTimeline, listTimeline, timelineYears } from '../services/timeline.js';
import { profileFacets } from '../services/facets.js';
import { tagsForEvents } from '../services/tags.js';
import { toEventDTO, toMediaDTO, toProfileDTO } from '../services/serializers.js';
import { resolveShareToken } from '../services/shareToken.js';
import { serveMedia } from './media.js';

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/public/:token', (c) => {
  const client = c.get('client');
  const { link, profile } = resolveShareToken(client, c.req.param('token'));
  const token = link.token;

  const yearRaw = c.req.query('year');
  const typeRaw = c.req.query('type');
  const year = yearRaw ? Number(yearRaw) : undefined;
  const type = typeRaw ? typeRaw.slice(0, 24) : undefined;

  const page = listTimeline(client, {
    profileId: profile.id,
    year: Number.isFinite(year) ? year : undefined,
    type,
    tag: c.req.query('tag') || undefined,
    cursor: c.req.query('cursor') || undefined,
    limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
    publicToken: token,
  });

  const filtered = link.scope === 'event'
    ? page.items.filter((item) => item.id === link.eventId)
    : page.items;

  return c.json({
    share: { scope: link.scope, eventId: link.eventId, expiresAt: link.expiresAt },
    profile: toProfileDTO(
      profile,
      'viewer',
      { eventCount: countEvents(client, profile.id, token), mediaCount: 0, lastEventDate: null },
      profile.avatarMediaId ? `/api/v1/public/${token}/media/${profile.avatarMediaId}/file?size=thumb` : null,
    ),
    items: filtered,
    nextCursor: link.scope === 'event' ? null : page.nextCursor,
    years: link.scope === 'event' ? [] : timelineYears(client, profile.id, token),
    total: link.scope === 'event' ? (link.eventId ? 1 : 0) : countEvents(client, profile.id, token),
    filteredTotal: link.scope === 'event' ? (link.eventId ? 1 : 0) : countTimeline(client, {
      profileId: profile.id,
      year: Number.isFinite(year) ? year : undefined,
      type,
      tag: c.req.query('tag') || undefined,
      publicToken: token,
    }),
  });
});

/** 公开链接的筛选计数：只统计对访客可见的（inherit）记录。 */
publicRoutes.get('/public/:token/facets', (c) => {
  const client = c.get('client');
  const { link, profile } = resolveShareToken(client, c.req.param('token'));

  const yearRaw = c.req.query('year');
  const year = yearRaw ? Number(yearRaw) : undefined;

  return c.json(
    profileFacets(client, profile.id, {
      year: Number.isFinite(year) ? year : undefined,
      type: c.req.query('type') || undefined,
      tag: c.req.query('tag') || undefined,
      publicToken: link.token,
      onlyEventId: link.scope === 'event' ? link.eventId ?? '__none__' : undefined,
    }),
  );
});

publicRoutes.get('/public/:token/events/:eventId', (c) => {
  const client = c.get('client');
  const { link, profile } = resolveShareToken(client, c.req.param('token'));
  const eventId = c.req.param('eventId');

  if (link.scope === 'event' && link.eventId !== eventId) throw notFound('事件不存在');

  const row = client.db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt), eq(events.visibility, 'inherit')))
    .get();
  if (!row || row.profileId !== profile.id) throw notFound('事件不存在');

  const mediaRows = client.db
    .select()
    .from(media)
    .where(and(eq(media.eventId, row.id), isNull(media.deletedAt)))
    .orderBy(media.sortOrder)
    .all();
  const tagMap = tagsForEvents(client, [row.id]);

  return c.json({
    event: toEventDTO(row, tagMap.get(row.id) ?? [], mediaRows, link.token),
    profile: {
      id: profile.id,
      name: profile.name,
      birthDate: profile.birthDate,
      birthPrecision: profile.birthPrecision,
      deathDate: profile.deathDate,
    },
    share: { scope: link.scope, eventId: link.eventId },
  });
});

publicRoutes.get('/public/:token/media/:mediaId/file', (c) => {
  const client = c.get('client');
  const { link, profile } = resolveShareToken(client, c.req.param('token'));

  const row = client.db.select().from(media).where(eq(media.id, c.req.param('mediaId'))).get();
  if (!row || row.deletedAt || row.profileId !== profile.id) throw notFound('图片不存在');

  // private 事件的媒体不出现在公开链接里
  if (row.eventId) {
    const ev = client.db.select({ visibility: events.visibility }).from(events).where(eq(events.id, row.eventId)).get();
    if (!ev || ev.visibility !== 'inherit') throw notFound('图片不存在');
  }
  if (link.scope === 'event' && row.eventId !== link.eventId) throw notFound('图片不存在');

  return serveMedia(c, row);
});

publicRoutes.get('/public/:token/media/:mediaId', (c) => {
  const client = c.get('client');
  const { profile } = resolveShareToken(client, c.req.param('token'));
  const row = client.db.select().from(media).where(eq(media.id, c.req.param('mediaId'))).get();
  if (!row || row.deletedAt || row.profileId !== profile.id) throw notFound('图片不存在');
  return c.json({ media: toMediaDTO(row, c.req.param('token')) });
});
