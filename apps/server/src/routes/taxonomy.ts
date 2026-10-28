import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { eventTypeInputSchema, tagInputSchema } from '@growth/shared';
import type { AppEnv } from '../auth/middleware.js';
import { requireUser } from '../auth/middleware.js';
import { tags } from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/validate.js';
import { requireProfileAccess } from '../services/permissions.js';
import {
  createEventType,
  deleteEventType,
  listEventTypes,
  renameEventType,
} from '../services/eventTypes.js';
import { getTag, listProfileTags, listProfileTagsDetailed, tagNameTaken } from '../services/tags.js';

/**
 * 档案的「分类」：事件类型与标签。
 * 两者都是用户自己维护的词表，事件的记录里存名称本身。
 */
export const taxonomyRoutes = new Hono<AppEnv>();

// ---------- 事件类型 ----------

taxonomyRoutes.get('/profiles/:id/event-types', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'view');
  return c.json({ items: listEventTypes(client, profile.id) });
});

taxonomyRoutes.post('/profiles/:id/event-types', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'edit');
  const input = await parseJson(c, eventTypeInputSchema);
  const item = createEventType(client, profile.id, input.label);
  return c.json({ item }, 201);
});

taxonomyRoutes.patch('/profiles/:id/event-types/:typeId', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'edit');
  const input = await parseJson(c, eventTypeInputSchema);
  const item = renameEventType(client, profile.id, c.req.param('typeId'), input.label);
  return c.json({ item });
});

taxonomyRoutes.delete('/profiles/:id/event-types/:typeId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'edit');
  const result = deleteEventType(client, profile.id, c.req.param('typeId'));
  return c.json({ ok: true, ...result });
});

// ---------- 标签 ----------

taxonomyRoutes.get('/profiles/:id/tags', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'view');
  // 默认只给被用到的标签（筛选器用）；管理页传 all=1 拿到全部
  const items =
    c.req.query('all') === 'true'
      ? listProfileTagsDetailed(client, profile.id)
      : listProfileTags(client, profile.id);
  return c.json({ items });
});

taxonomyRoutes.post('/profiles/:id/tags', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'edit');
  const input = await parseJson(c, tagInputSchema);
  const name = input.name.trim();
  if (tagNameTaken(client, profile.id, name)) throw conflict('已经有同名的标签了');
  const id = crypto.randomUUID();
  client.db.insert(tags).values({ id, profileId: profile.id, name }).run();
  return c.json({ item: { id, name, count: 0 } }, 201);
});

taxonomyRoutes.patch('/profiles/:id/tags/:tagId', async (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'edit');
  const input = await parseJson(c, tagInputSchema);
  const tagId = c.req.param('tagId');
  const tag = getTag(client, profile.id, tagId);
  if (!tag) throw notFound('标签不存在');
  const name = input.name.trim();
  if (tagNameTaken(client, profile.id, name, tagId)) throw conflict('已经有同名的标签了');
  client.db.update(tags).set({ name }).where(eq(tags.id, tagId)).run();
  return c.json({ ok: true });
});

taxonomyRoutes.delete('/profiles/:id/tags/:tagId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'edit');
  const tagId = c.req.param('tagId');
  const tag = getTag(client, profile.id, tagId);
  if (!tag) throw notFound('标签不存在');
  // event_tags 外键 onDelete: cascade，事件本身不受影响
  client.db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.profileId, profile.id))).run();
  return c.json({ ok: true });
});
