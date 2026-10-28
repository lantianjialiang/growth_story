import { Hono } from 'hono';
import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import {
  eventCreateSchema,
  eventUpdateSchema,
  normalizeByPrecision,
  type DatePrecision,
} from '@growth/shared';
import type { AppEnv } from '../auth/middleware.js';
import { requireUser } from '../auth/middleware.js';
import { events, media, profiles } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { parseJson } from '../lib/validate.js';
import { requireEventAccess, requireProfileAccess } from '../services/permissions.js';
import { setEventTags, tagsForEvents } from '../services/tags.js';
import { assertEventType } from '../services/eventTypes.js';
import { countEvents, countTimeline, listTimeline, timelineYears } from '../services/timeline.js';
import { profileFacets } from '../services/facets.js';
import { toEventDTO } from '../services/serializers.js';

export const eventRoutes = new Hono<AppEnv>();

function touchProfile(client: ReturnType<typeof Object>, profileId: string) {
  return client;
}

eventRoutes.get('/profiles/:id/events', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'view');

  const yearRaw = c.req.query('year');
  const typeRaw = c.req.query('type');
  const year = yearRaw ? Number(yearRaw) : undefined;
  // 类型既可能是内置 key，也可能是档案自定义的名称，因此不再做枚举校验
  const type = typeRaw ? typeRaw.slice(0, 24) : undefined;

  const result = listTimeline(client, {
    profileId: profile.id,
    year: Number.isFinite(year) ? year : undefined,
    type,
    tag: c.req.query('tag') || undefined,
    cursor: c.req.query('cursor') || undefined,
    limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
    order: c.req.query('order') === 'asc' ? 'asc' : 'desc',
  });

  return c.json({
    ...result,
    years: timelineYears(client, profile.id),
    total: countEvents(client, profile.id),
    filteredTotal: countTimeline(client, {
      profileId: profile.id,
      year: Number.isFinite(year) ? year : undefined,
      type,
      tag: c.req.query('tag') || undefined,
    }),
  });
});

/** 筛选器各维度的计数（标签/年份后面的数字）。 */
eventRoutes.get('/profiles/:id/facets', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'view');

  const yearRaw = c.req.query('year');
  const year = yearRaw ? Number(yearRaw) : undefined;

  return c.json(
    profileFacets(client, profile.id, {
      year: Number.isFinite(year) ? year : undefined,
      type: c.req.query('type') || undefined,
      tag: c.req.query('tag') || undefined,
    }),
  );
});

eventRoutes.post('/profiles/:id/events', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'edit');
  const input = await parseJson(c, eventCreateSchema);
  const type = assertEventType(client, profile.id, input.type);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const date = normalizeByPrecision(input.date, input.datePrecision as DatePrecision);

  client.db
    .insert(events)
    .values({
      id,
      profileId: profile.id,
      title: input.title,
      body: input.body ?? null,
      date,
      datePrecision: input.datePrecision,
      placeText: input.placeText ?? null,
      type,
      visibility: input.visibility,
      coverMediaId: input.coverMediaId ?? null,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  setEventTags(client, profile.id, id, input.tags);
  client.db.update(profiles).set({ updatedAt: now }).where(eq(profiles.id, profile.id)).run();

  const row = client.db.select().from(events).where(eq(events.id, id)).get()!;
  return c.json({ event: toEventDTO(row, input.tags, []) }, 201);
});

eventRoutes.get('/events/:eventId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { event, profile } = requireEventAccess(client, c.req.param('eventId'), user, 'view');

  const row = client.db.select().from(events).where(eq(events.id, event.id)).get()!;
  const mediaRows = client.db
    .select()
    .from(media)
    .where(and(eq(media.eventId, event.id), isNull(media.deletedAt)))
    .orderBy(asc(media.sortOrder), asc(media.createdAt))
    .all();
  const tagMap = tagsForEvents(client, [event.id]);

  const next = client.db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.profileId, event.profileId),
        isNull(events.deletedAt),
        or(sql`${events.date} > ${event.date}`, and(eq(events.date, event.date), sql`${events.id} > ${event.id}`)),
      ),
    )
    .orderBy(asc(events.date), asc(events.id))
    .limit(1)
    .get();

  const prev = client.db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.profileId, event.profileId),
        isNull(events.deletedAt),
        lt(events.date, event.date),
      ),
    )
    .orderBy(desc(events.date), desc(events.id))
    .limit(1)
    .get();

  return c.json({
    event: toEventDTO(row, tagMap.get(event.id) ?? [], mediaRows),
    profile: { id: profile.id, name: profile.name, birthDate: profile.birthDate, birthPrecision: profile.birthPrecision, deathDate: profile.deathDate },
    neighbors: { prevId: prev?.id ?? null, nextId: next?.id ?? null },
  });
});

eventRoutes.patch('/events/:eventId', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { event, profile } = requireEventAccess(client, c.req.param('eventId'), user, 'edit');
  const input = await parseJson(c, eventUpdateSchema);

  const patch: Partial<typeof events.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body ?? null;
  if (input.placeText !== undefined) patch.placeText = input.placeText ?? null;
  if (input.type !== undefined) patch.type = assertEventType(client, profile.id, input.type);
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.coverMediaId !== undefined) patch.coverMediaId = input.coverMediaId ?? null;
  if (input.date !== undefined) {
    const precision = (input.datePrecision ?? event.datePrecision) as DatePrecision;
    patch.date = normalizeByPrecision(input.date, precision);
    patch.datePrecision = precision;
  } else if (input.datePrecision !== undefined) {
    patch.datePrecision = input.datePrecision;
    patch.date = normalizeByPrecision(event.date, input.datePrecision as DatePrecision);
  }

  client.db.update(events).set(patch).where(eq(events.id, event.id)).run();
  if (input.tags !== undefined) setEventTags(client, profile.id, event.id, input.tags);

  const row = client.db.select().from(events).where(eq(events.id, event.id)).get()!;
  const tagMap = tagsForEvents(client, [event.id]);
  const mediaRows = client.db
    .select()
    .from(media)
    .where(and(eq(media.eventId, event.id), isNull(media.deletedAt)))
    .orderBy(asc(media.sortOrder), asc(media.createdAt))
    .all();
  return c.json({ event: toEventDTO(row, tagMap.get(event.id) ?? [], mediaRows) });
});

eventRoutes.delete('/events/:eventId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { event } = requireEventAccess(client, c.req.param('eventId'), user, 'edit');
  client.db
    .update(events)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(events.id, event.id))
    .run();
  return c.json({ ok: true });
});

eventRoutes.post('/events/:eventId/restore', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { event } = requireEventAccess(client, c.req.param('eventId'), user, 'edit', { includeDeleted: true });
  if (!event.deletedAt) throw notFound('该事件不在回收站');
  client.db.update(events).set({ deletedAt: null }).where(eq(events.id, event.id)).run();
  return c.json({ ok: true });
});

export { touchProfile };
