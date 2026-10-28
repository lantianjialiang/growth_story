import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEvent,
  createProfile,
  createTestContext,
  jsonRequest,
  signup,
  type TestContext,
} from './helpers.js';

let ctx: TestContext | null = null;

afterEach(() => {
  if (ctx) {
    ctx.client.sqlite.close();
    try {
      fs.rmSync(ctx.uploadDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 60 });
    } catch {
      /* ignore */
    }
    ctx = null;
  }
});

async function setup() {
  const context = createTestContext();
  ctx = context;
  const owner = await signup(context, 'owner@example.com');
  const editor = await signup(context, 'editor@example.com');
  const viewer = await signup(context, 'viewer@example.com');
  const stranger = await signup(context, 'stranger@example.com');
  const profile = await createProfile(context, owner.cookie);
  const event = await createEvent(context, owner.cookie, profile.id);

  await jsonRequest(context, 'POST', `/api/v1/profiles/${profile.id}/members`, {
    cookie: owner.cookie,
    body: { email: editor.email, role: 'editor' },
  });
  await jsonRequest(context, 'POST', `/api/v1/profiles/${profile.id}/members`, {
    cookie: owner.cookie,
    body: { email: viewer.email, role: 'viewer' },
  });

  return { context, owner, editor, viewer, stranger, profile, event };
}

describe('权限矩阵（规格第 4 节）', () => {
  it('未登录访问需要登录的接口返回 401', async () => {
    ctx = createTestContext();
    expect((await jsonRequest(ctx, 'GET', '/api/v1/profiles')).status).toBe(401);
    expect((await jsonRequest(ctx, 'GET', '/api/v1/profiles/whatever')).status).toBe(401);
  });

  it('陌生人看不到档案（统一 404，不泄露存在性）', async () => {
    const { context, stranger, profile, event } = await setup();
    const r1 = await jsonRequest(context, 'GET', `/api/v1/profiles/${profile.id}`, {
      cookie: stranger.cookie,
    });
    expect(r1.status).toBe(404);
    const r2 = await jsonRequest(context, 'GET', `/api/v1/events/${event.id}`, {
      cookie: stranger.cookie,
    });
    expect(r2.status).toBe(404);
    const r3 = await jsonRequest(context, 'POST', `/api/v1/profiles/${profile.id}/events`, {
      cookie: stranger.cookie,
      body: { title: 'x', date: '2024-01-01', datePrecision: 'day', type: 'daily' },
    });
    expect(r3.status).toBe(404);
    const list = await jsonRequest<{ items: unknown[] }>(context, 'GET', '/api/v1/profiles', {
      cookie: stranger.cookie,
    });
    expect(list.body.items).toHaveLength(0);
  });

  it('查看者只能读，不能写', async () => {
    const { context, viewer, profile, event } = await setup();
    const read = await jsonRequest(context, 'GET', `/api/v1/profiles/${profile.id}`, {
      cookie: viewer.cookie,
    });
    expect(read.status).toBe(200);

    const listEvents = await jsonRequest<{ items: unknown[] }>(
      context,
      'GET',
      `/api/v1/profiles/${profile.id}/events`,
      { cookie: viewer.cookie },
    );
    expect(listEvents.status).toBe(200);
    expect(listEvents.body.items).toHaveLength(1);

    const createDenied = await jsonRequest(context, 'POST', `/api/v1/profiles/${profile.id}/events`, {
      cookie: viewer.cookie,
      body: { title: 'x', date: '2024-01-01', datePrecision: 'day', type: 'daily' },
    });
    expect(createDenied.status).toBe(403);

    const patchDenied = await jsonRequest(context, 'PATCH', `/api/v1/events/${event.id}`, {
      cookie: viewer.cookie,
      body: { title: 'hacked' },
    });
    expect(patchDenied.status).toBe(403);

    const deleteDenied = await jsonRequest(context, 'DELETE', `/api/v1/events/${event.id}`, {
      cookie: viewer.cookie,
    });
    expect(deleteDenied.status).toBe(403);

    const members = await jsonRequest(context, 'GET', `/api/v1/profiles/${profile.id}/members`, {
      cookie: viewer.cookie,
    });
    expect(members.status).toBe(403);

    const exportDenied = await jsonRequest(context, 'POST', `/api/v1/profiles/${profile.id}/export`, {
      cookie: viewer.cookie,
    });
    expect(exportDenied.status).toBe(403);

    const deleteProfile = await jsonRequest(context, 'DELETE', `/api/v1/profiles/${profile.id}`, {
      cookie: viewer.cookie,
    });
    expect(deleteProfile.status).toBe(403);
  });

  it('编辑者可以增改事件和照片，但不能管理成员/导出/删档案', async () => {
    const { context, editor, profile, event } = await setup();

    const created = await jsonRequest<{ event: { id: string } }>(
      context,
      'POST',
      `/api/v1/profiles/${profile.id}/events`,
      {
        cookie: editor.cookie,
        body: { title: '编辑者新增', date: '2024-02-02', datePrecision: 'day', type: 'daily' },
      },
    );
    expect(created.status).toBe(201);

    const patched = await jsonRequest(context, 'PATCH', `/api/v1/events/${event.id}`, {
      cookie: editor.cookie,
      body: { title: '编辑者改过' },
    });
    expect(patched.status).toBe(200);

    const deleted = await jsonRequest(context, 'DELETE', `/api/v1/events/${created.body.event.id}`, {
      cookie: editor.cookie,
    });
    expect(deleted.status).toBe(200);

    const members = await jsonRequest(context, 'GET', `/api/v1/profiles/${profile.id}/members`, {
      cookie: editor.cookie,
    });
    expect(members.status).toBe(403);

    const profilePatch = await jsonRequest(context, 'PATCH', `/api/v1/profiles/${profile.id}`, {
      cookie: editor.cookie,
      body: { name: 'rename' },
    });
    expect(profilePatch.status).toBe(403);

    const exportDenied = await jsonRequest(context, 'POST', `/api/v1/profiles/${profile.id}/export`, {
      cookie: editor.cookie,
    });
    expect(exportDenied.status).toBe(403);
  });

  it('所有者拥有全部权限', async () => {
    const { context, owner, profile } = await setup();
    const patch = await jsonRequest(context, 'PATCH', `/api/v1/profiles/${profile.id}`, {
      cookie: owner.cookie,
      body: { name: '小满满', note: '喜欢恐龙' },
    });
    expect(patch.status).toBe(200);
    const members = await jsonRequest(context, 'GET', `/api/v1/profiles/${profile.id}/members`, {
      cookie: owner.cookie,
    });
    expect(members.status).toBe(200);
    const exportRes = await jsonRequest(context, 'POST', `/api/v1/profiles/${profile.id}/export`, {
      cookie: owner.cookie,
    });
    expect(exportRes.status).toBe(202);
  });

  it('归档后的档案不出现在默认列表，加参数才可见', async () => {
    const { context, owner, profile } = await setup();
    await jsonRequest(context, 'PATCH', `/api/v1/profiles/${profile.id}`, {
      cookie: owner.cookie,
      body: { archived: true },
    });
    const normal = await jsonRequest<{ items: unknown[] }>(context, 'GET', '/api/v1/profiles', {
      cookie: owner.cookie,
    });
    expect(normal.body.items).toHaveLength(0);
    const withArchived = await jsonRequest<{ items: unknown[] }>(
      context,
      'GET',
      '/api/v1/profiles?archived=true',
      { cookie: owner.cookie },
    );
    expect(withArchived.body.items).toHaveLength(1);
  });

  it('软删除后档案立即不可见，回收站可恢复', async () => {
    const { context, owner, profile } = await setup();
    await jsonRequest(context, 'DELETE', `/api/v1/profiles/${profile.id}`, { cookie: owner.cookie });
    expect(
      (await jsonRequest(context, 'GET', `/api/v1/profiles/${profile.id}`, { cookie: owner.cookie }))
        .status,
    ).toBe(404);
    await jsonRequest(context, 'POST', `/api/v1/profiles/${profile.id}/restore`, {
      cookie: owner.cookie,
    });
    expect(
      (await jsonRequest(context, 'GET', `/api/v1/profiles/${profile.id}`, { cookie: owner.cookie }))
        .status,
    ).toBe(200);
  });
});

describe('事件与时间轴', () => {
  it('日期按精度规范化后落库', async () => {
    const { context, owner, profile } = await setup();
    const yearEvent = await jsonRequest<{ event: { date: string } }>(
      context,
      'POST',
      `/api/v1/profiles/${profile.id}/events`,
      {
        cookie: owner.cookie,
        body: { title: '只记得年份', date: '2019-07-15', datePrecision: 'year', type: 'daily' },
      },
    );
    expect(yearEvent.body.event.date).toBe('2019-01-01');

    const monthEvent = await jsonRequest<{ event: { date: string } }>(
      context,
      'POST',
      `/api/v1/profiles/${profile.id}/events`,
      {
        cookie: owner.cookie,
        body: { title: '只记得月份', date: '2019-07-15', datePrecision: 'month', type: 'daily' },
      },
    );
    expect(monthEvent.body.event.date).toBe('2019-07-01');
  });

  it('按年份/类型/标签筛选，游标分页不重复', async () => {
    const { context, owner, profile } = await setup();
    for (let i = 1; i <= 25; i += 1) {
      await createEvent(context, owner.cookie, profile.id, {
        title: `事件 ${i}`,
        date: `${2000 + (i % 3)}-0${(i % 9) + 1}-1${i % 9}`,
        type: i % 2 === 0 ? 'travel' : 'daily',
        tags: i % 5 === 0 ? ['旅行'] : [],
      });
    }

    const first = await jsonRequest<{ items: { id: string }[]; nextCursor: string | null; total: number }>(
      context,
      'GET',
      `/api/v1/profiles/${profile.id}/events?limit=10`,
      { cookie: owner.cookie },
    );
    expect(first.body.items).toHaveLength(10);
    expect(first.body.nextCursor).toBeTruthy();
    expect(first.body.total).toBe(26);

    const second = await jsonRequest<{ items: { id: string }[] }>(
      context,
      'GET',
      `/api/v1/profiles/${profile.id}/events?limit=10&cursor=${first.body.nextCursor}`,
      { cookie: owner.cookie },
    );
    const overlap = second.body.items.filter((item) =>
      first.body.items.some((prev) => prev.id === item.id),
    );
    expect(overlap).toHaveLength(0);

    const byType = await jsonRequest<{ items: { type: string }[] }>(
      context,
      'GET',
      `/api/v1/profiles/${profile.id}/events?type=travel&limit=50`,
      { cookie: owner.cookie },
    );
    expect(byType.body.items.every((item) => item.type === 'travel')).toBe(true);

    const byTag = await jsonRequest<{ items: { tags: string[] }[] }>(
      context,
      'GET',
      `/api/v1/profiles/${profile.id}/events?tag=${encodeURIComponent('旅行')}&limit=50`,
      { cookie: owner.cookie },
    );
    expect(byTag.body.items.length).toBeGreaterThan(0);
    expect(byTag.body.items.every((item) => item.tags.includes('旅行'))).toBe(true);

    const byYear = await jsonRequest<{ items: { date: string }[] }>(
      context,
      'GET',
      `/api/v1/profiles/${profile.id}/events?year=2001&limit=50`,
      { cookie: owner.cookie },
    );
    expect(byYear.body.items.every((item) => item.date.startsWith('2001'))).toBe(true);
  });

  it('非法游标返回 400', async () => {
    const { context, owner, profile } = await setup();
    const res = await jsonRequest(context, 'GET', `/api/v1/profiles/${profile.id}/events?cursor=bad`, {
      cookie: owner.cookie,
    });
    expect(res.status).toBe(400);
  });
});
