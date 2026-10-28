import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProfileFacets } from '@growth/shared';
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

interface FacetPayload extends ProfileFacets {}

interface TimelinePayload {
  items: { id: string }[];
  total: number;
  filteredTotal: number;
}

/** 三种年份 / 两种类型 / 两个标签的样本，方便验证「计数跟着其它筛选走」。 */
async function seed() {
  ctx = createTestContext();
  const owner = await signup(ctx);
  const profile = await createProfile(ctx, owner.cookie);

  await createEvent(ctx, owner.cookie, profile.id, {
    title: '第一次站起来',
    date: '2021-03-12',
    type: 'milestone',
    tags: ['里程碑'],
  });
  await createEvent(ctx, owner.cookie, profile.id, {
    title: '去海边',
    date: '2021-06-01',
    type: 'travel',
    tags: ['里程碑', '旅行'],
  });
  await createEvent(ctx, owner.cookie, profile.id, {
    title: '搬家',
    date: '2022-01-05',
    type: 'travel',
    tags: ['旅行'],
  });

  return { owner, profile };
}

function facetsOf(payload: FacetPayload) {
  return {
    years: payload.years.map((item) => [item.year, item.eventCount]),
    tags: Object.fromEntries(payload.tags.map((item) => [item.name, item.count])),
  };
}

describe('筛选器计数（facets）', () => {
  it('不加筛选时就是全档统计', async () => {
    const { owner, profile } = await seed();
    const res = await jsonRequest<FacetPayload>(
      ctx!,
      'GET',
      `/api/v1/profiles/${profile.id}/facets`,
      { cookie: owner.cookie },
    );

    expect(res.status).toBe(200);
    expect(facetsOf(res.body)).toEqual({
      years: [
        [2022, 1],
        [2021, 2],
      ],
      tags: { 里程碑: 2, 旅行: 2 },
    });
  });

  it('选了年份之后，标签的数字变成这一年的条数，没人用的标签记 0', async () => {
    const { owner, profile } = await seed();
    const res = await jsonRequest<FacetPayload>(
      ctx!,
      'GET',
      `/api/v1/profiles/${profile.id}/facets?year=2021`,
      { cookie: owner.cookie },
    );

    // 年份下拉仍然要列出所有年份（每年各有多少条），不被 year 自己筛掉
    expect(facetsOf(res.body).years).toEqual([
      [2022, 1],
      [2021, 2],
    ]);
    // 标签只统计 2021 年：旅行在 2022 年才用过，这里记 0
    expect(facetsOf(res.body).tags).toEqual({ 里程碑: 2, 旅行: 1 });
  });

  it('选了标签之后，年份的数字变成这个标签的条数', async () => {
    const { owner, profile } = await seed();
    const res = await jsonRequest<FacetPayload>(
      ctx!,
      'GET',
      `/api/v1/profiles/${profile.id}/facets?tag=${encodeURIComponent('旅行')}`,
      { cookie: owner.cookie },
    );

    expect(facetsOf(res.body).years).toEqual([
      [2022, 1],
      [2021, 1],
    ]);
    // 标签维度不吃自己的筛选，所以两个标签的计数仍按其它条件算
    expect(facetsOf(res.body).tags).toEqual({ 旅行: 2, 里程碑: 2 });
  });

  it('年份 + 类型同时筛时，标签计数只算这两者交集', async () => {
    const { owner, profile } = await seed();
    const res = await jsonRequest<FacetPayload>(
      ctx!,
      'GET',
      `/api/v1/profiles/${profile.id}/facets?year=2021&type=travel`,
      { cookie: owner.cookie },
    );

    expect(facetsOf(res.body).tags).toEqual({ 里程碑: 1, 旅行: 1 });
  });

  it('筛选后的记录数单独给出，不影响档案总数', async () => {
    const { owner, profile } = await seed();

    const filtered = await jsonRequest<TimelinePayload>(
      ctx!,
      'GET',
      `/api/v1/profiles/${profile.id}/events?year=2021&type=travel`,
      { cookie: owner.cookie },
    );
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.filteredTotal).toBe(1);
    expect(filtered.body.total).toBe(3);

    const plain = await jsonRequest<TimelinePayload>(
      ctx!,
      'GET',
      `/api/v1/profiles/${profile.id}/events`,
      { cookie: owner.cookie },
    );
    expect(plain.body.filteredTotal).toBe(3);
  });

  it('没有访问权限的人拿不到计数', async () => {
    const { profile } = await seed();
    const outsider = await signup(ctx!);
    const res = await jsonRequest(ctx!, 'GET', `/api/v1/profiles/${profile.id}/facets`, {
      cookie: outsider.cookie,
    });
    // 非成员看不到这个档案的存在，统一按 404 处理（与其它接口一致）
    expect(res.status).toBe(404);
  });

  it('公开链接只统计对访客可见的记录', async () => {
    const { owner, profile } = await seed();
    await createEvent(ctx!, owner.cookie, profile.id, {
      title: '不想公开的',
      date: '2021-08-08',
      type: 'travel',
      tags: ['旅行'],
      visibility: 'private',
    });

    const link = await jsonRequest<{ link: { token: string } }>(
      ctx!,
      'POST',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie, body: { scope: 'profile' } },
    );

    const res = await jsonRequest<FacetPayload>(
      ctx!,
      'GET',
      `/api/v1/public/${link.body.link.token}/facets`,
    );
    expect(facetsOf(res.body)).toEqual({
      years: [
        [2022, 1],
        [2021, 2],
      ],
      tags: { 里程碑: 2, 旅行: 2 },
    });

    const feed = await jsonRequest<TimelinePayload>(
      ctx!,
      'GET',
      `/api/v1/public/${link.body.link.token}`,
    );
    expect(feed.body.filteredTotal).toBe(3);
  });
});
