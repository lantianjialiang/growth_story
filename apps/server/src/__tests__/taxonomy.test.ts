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

interface ProfilePayload {
  profile: {
    id: string;
    anniversaries: { id: string; label: string; date: string; precision: string }[];
  };
}

describe('档案纪念日', () => {
  it('新建时保存多个纪念日，并按精度规范化日期', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie, {
      anniversaries: [
        { label: '结婚纪念日', date: '2018-05-20', precision: 'day' },
        { label: '入园日', date: '2023-09-01', precision: 'month' },
        { label: '养猫纪念日', date: '2021-07-07', precision: 'year' },
      ],
    });

    const detail = await jsonRequest<ProfilePayload>(ctx, 'GET', `/api/v1/profiles/${profile.id}`, {
      cookie: owner.cookie,
    });
    const list = detail.body.profile.anniversaries;
    expect(list).toHaveLength(3);
    expect(list[0]?.label).toBe('结婚纪念日');
    expect(list[0]?.date).toBe('2018-05-20');
    // 只记得月份 / 年份时，缺失部分补 01
    expect(list[1]?.date).toBe('2023-09-01');
    expect(list[2]?.date).toBe('2021-01-01');
    expect(list[0]?.id).toBeTruthy();
  });

  it('编辑时整表替换，并且可以清空', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie, {
      anniversaries: [{ label: '结婚纪念日', date: '2018-05-20', precision: 'day' }],
    });

    const updated = await jsonRequest<ProfilePayload>(ctx, 'PATCH', `/api/v1/profiles/${profile.id}`, {
      cookie: owner.cookie,
      body: {
        anniversaries: [
          { label: '结婚纪念日', date: '2018-05-20', precision: 'day' },
          { label: '认识纪念日', date: '2017-11-11', precision: 'day' },
        ],
      },
    });
    expect(updated.body.profile.anniversaries.map((item) => item.label)).toEqual([
      '结婚纪念日',
      '认识纪念日',
    ]);

    const cleared = await jsonRequest<ProfilePayload>(ctx, 'PATCH', `/api/v1/profiles/${profile.id}`, {
      cookie: owner.cookie,
      body: { anniversaries: [] },
    });
    expect(cleared.body.profile.anniversaries).toEqual([]);
  });
});

interface TypeListPayload {
  items: { type: string; id: string | null; custom: boolean; usingCount: number }[];
}

describe('事件类型', () => {
  it('自定义类型可新增、可改名、可删除，已有记录跟着走', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);

    const created = await jsonRequest<{ item: { type: string; id: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/event-types`,
      { cookie: owner.cookie, body: { label: '喂养' } },
    );
    expect(created.status).toBe(201);
    expect(created.body.item.type).toBe('喂养');

    const event = await createEvent(ctx, owner.cookie, profile.id, { type: '喂养', title: '第一次吃辅食' });
    const listed = await jsonRequest<TypeListPayload>(
      ctx,
      'GET',
      `/api/v1/profiles/${profile.id}/event-types`,
      { cookie: owner.cookie },
    );
    expect(listed.body.items.some((item) => item.type === '喂养' && item.usingCount === 1)).toBe(true);
    // 内置类型也在列表里
    expect(listed.body.items.some((item) => item.type === 'travel' && !item.custom)).toBe(true);

    // 改名：记录上的类型同步变更
    const renamed = await jsonRequest<{ item: { type: string } }>(
      ctx,
      'PATCH',
      `/api/v1/profiles/${profile.id}/event-types/${created.body.item.id}`,
      { cookie: owner.cookie, body: { label: '辅食' } },
    );
    expect(renamed.status).toBe(200);
    const eventAfter = await jsonRequest<{ event: { type: string } }>(ctx, 'GET', `/api/v1/events/${event.id}`, {
      cookie: owner.cookie,
    });
    expect(eventAfter.body.event.type).toBe('辅食');

    // 删除：使用它的记录回退到 other
    const removed = await jsonRequest<{ ok: boolean; movedEvents: number }>(
      ctx,
      'DELETE',
      `/api/v1/profiles/${profile.id}/event-types/${created.body.item.id}`,
      { cookie: owner.cookie },
    );
    expect(removed.body.movedEvents).toBe(1);
    const eventFinal = await jsonRequest<{ event: { type: string } }>(ctx, 'GET', `/api/v1/events/${event.id}`, {
      cookie: owner.cookie,
    });
    expect(eventFinal.body.event.type).toBe('other');
  });

  it('未创建的类型不能被记录使用，内置类型不能重复创建', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);

    const bad = await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/events`, {
      cookie: owner.cookie,
      body: { title: '随便写', date: '2024-01-01', datePrecision: 'day', type: '不存在的类型' },
    });
    expect(bad.status).toBe(400);

    const dup = await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/event-types`, {
      cookie: owner.cookie,
      body: { label: 'travel' },
    });
    expect(dup.status).toBe(409);
  });

  it('按自定义类型筛选时间轴', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/event-types`, {
      cookie: owner.cookie,
      body: { label: '疫苗' },
    });
    await createEvent(ctx, owner.cookie, profile.id, { type: '疫苗', title: '第一针' });
    await createEvent(ctx, owner.cookie, profile.id, { type: 'travel', title: '出去玩', date: '2023-05-01' });

    const filtered = await jsonRequest<{ items: { title: string }[] }>(
      ctx,
      'GET',
      `/api/v1/profiles/${profile.id}/events?type=${encodeURIComponent('疫苗')}`,
      { cookie: owner.cookie },
    );
    expect(filtered.body.items.map((item) => item.title)).toEqual(['第一针']);
  });
});

describe('标签', () => {
  it('新增、改名、删除，删除后从记录上消失但记录还在', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    const event = await createEvent(ctx, owner.cookie, profile.id, { tags: ['第一次'] });

    const listed = await jsonRequest<{ items: { id: string; name: string; count: number }[] }>(
      ctx,
      'GET',
      `/api/v1/profiles/${profile.id}/tags?all=true`,
      { cookie: owner.cookie },
    );
    const tag = listed.body.items.find((item) => item.name === '第一次')!;
    expect(tag.count).toBe(1);

    const renamed = await jsonRequest(ctx, 'PATCH', `/api/v1/profiles/${profile.id}/tags/${tag.id}`, {
      cookie: owner.cookie,
      body: { name: '初次' },
    });
    expect(renamed.status).toBe(200);

    const afterRename = await jsonRequest<{ items: { name: string }[] }>(
      ctx,
      'GET',
      `/api/v1/profiles/${profile.id}/tags`,
      { cookie: owner.cookie },
    );
    expect(afterRename.body.items.map((item) => item.name)).toEqual(['初次']);

    const created = await jsonRequest<{ item: { id: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/tags`,
      { cookie: owner.cookie, body: { name: '备用标签' } },
    );
    expect(created.status).toBe(201);

    const deleted = await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}/tags/${tag.id}`, {
      cookie: owner.cookie,
    });
    expect(deleted.status).toBe(200);

    const eventAfter = await jsonRequest<{ event: { tags: string[] } }>(ctx, 'GET', `/api/v1/events/${event.id}`, {
      cookie: owner.cookie,
    });
    expect(eventAfter.body.event.tags).toEqual([]);
  });
});

describe('分享链接', () => {
  it('purge=true 会从列表里彻底删除', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);

    const created = await jsonRequest<{ link: { id: string; token: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie, body: { scope: 'profile' } },
    );

    // 普通 DELETE 只是撤销，记录仍在
    await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}/share-links/${created.body.link.id}`, {
      cookie: owner.cookie,
    });
    const listed = await jsonRequest<{ items: { id: string; revokedAt: string | null }[] }>(
      ctx,
      'GET',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie },
    );
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]?.revokedAt).toBeTruthy();

    const purged = await jsonRequest<{ ok: boolean; purged: boolean }>(
      ctx,
      'DELETE',
      `/api/v1/profiles/${profile.id}/share-links/${created.body.link.id}?purge=true`,
      { cookie: owner.cookie },
    );
    expect(purged.body.purged).toBe(true);

    const after = await jsonRequest<{ items: unknown[] }>(
      ctx,
      'GET',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie },
    );
    expect(after.body.items).toHaveLength(0);

    // 链接本身也已失效
    const pub = await jsonRequest(ctx, 'GET', `/api/v1/public/${created.body.link.token}`);
    expect(pub.status).toBe(404);
  });
});
