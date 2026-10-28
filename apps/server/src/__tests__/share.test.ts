import fs from 'node:fs';
import sharp from 'sharp';
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

sharp.cache(false);

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

async function uploadPhoto(context: TestContext, cookie: string, profileId: string, eventId: string) {
  const jpeg = await sharp({
    create: { width: 120, height: 90, channels: 3, background: { r: 120, g: 130, b: 140 } },
  })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append('files', new File([jpeg], 'x.jpg', { type: 'image/jpeg' }));
  form.append('eventId', eventId);
  const res = await context.app.request(`/api/v1/profiles/${profileId}/media`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  const body = (await res.json()) as { items: { id: string }[] };
  return body.items[0]!.id;
}

describe('公开链接', () => {
  it('未登录可读，但过滤掉 private 事件', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    const publicEvent = await createEvent(ctx, owner.cookie, profile.id, { title: '公开事件' });
    const privateEvent = await createEvent(ctx, owner.cookie, profile.id, {
      title: '仅成员可见',
      visibility: 'private',
      date: '2022-05-05',
    });

    const link = await jsonRequest<{ link: { token: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie, body: { scope: 'profile' } },
    );
    const token = link.body.link.token;
    expect(token.length).toBeGreaterThanOrEqual(40);

    const feed = await jsonRequest<{ items: { id: string; title: string }[]; total: number }>(
      ctx,
      'GET',
      `/api/v1/public/${token}`,
    );
    expect(feed.status).toBe(200);
    expect(feed.body.items.map((i) => i.title)).toEqual(['公开事件']);
    expect(feed.body.items.some((i) => i.id === privateEvent.id)).toBe(false);
    expect(feed.body.total).toBe(1);

    const privateDetail = await jsonRequest(ctx, 'GET', `/api/v1/public/${token}/events/${privateEvent.id}`);
    expect(privateDetail.status).toBe(404);

    const publicDetail = await jsonRequest(
      ctx,
      'GET',
      `/api/v1/public/${token}/events/${publicEvent.id}`,
    );
    expect(publicDetail.status).toBe(200);
  });

  it('撤销链接后立即失效', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    await createEvent(ctx, owner.cookie, profile.id);

    const created = await jsonRequest<{ link: { id: string; token: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie, body: { scope: 'profile' } },
    );
    const { id, token } = created.body.link;
    expect((await jsonRequest(ctx, 'GET', `/api/v1/public/${token}`)).status).toBe(200);

    await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}/share-links/${id}`, {
      cookie: owner.cookie,
    });
    expect((await jsonRequest(ctx, 'GET', `/api/v1/public/${token}`)).status).toBe(404);
  });

  it('过期链接失效', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    const created = await jsonRequest<{ link: { token: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie, body: { scope: 'profile', expiresInDays: 1 } },
    );
    const token = created.body.link.token;
    // 直接把过期时间改到过去（模拟时间流逝）
    ctx.client.sqlite
      .prepare('UPDATE share_links SET expires_at = ? WHERE token = ?')
      .run('2020-01-01T00:00:00.000Z', token);
    expect((await jsonRequest(ctx, 'GET', `/api/v1/public/${token}`)).status).toBe(404);
  });

  it('随机 token 不可猜测：错误 token 返回 404', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    await createProfile(ctx, owner.cookie);
    expect(
      (await jsonRequest(ctx, 'GET', `/api/v1/public/${'a'.repeat(43)}`)).status,
    ).toBe(404);
  });

  it('private 事件的照片不能通过公开链接读取', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    const privateEvent = await createEvent(ctx, owner.cookie, profile.id, {
      visibility: 'private',
      title: '私密',
    });
    const mediaId = await uploadPhoto(ctx, owner.cookie, profile.id, privateEvent.id);

    const created = await jsonRequest<{ link: { token: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie, body: { scope: 'profile' } },
    );
    const token = created.body.link.token;

    const res = await ctx.app.request(`/api/v1/public/${token}/media/${mediaId}/file?size=thumb`);
    expect(res.status).toBe(404);
  });

  it('单条事件链接只包含该事件', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    const a = await createEvent(ctx, owner.cookie, profile.id, { title: 'A', date: '2023-01-01' });
    await createEvent(ctx, owner.cookie, profile.id, { title: 'B', date: '2023-02-01' });

    const created = await jsonRequest<{ link: { token: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie, body: { scope: 'event', eventId: a.id } },
    );
    const token = created.body.link.token;

    const feed = await jsonRequest<{ items: { title: string }[] }>(ctx, 'GET', `/api/v1/public/${token}`);
    expect(feed.body.items.map((i) => i.title)).toEqual(['A']);
  });

  it('档案被删除后链接失效', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    const created = await jsonRequest<{ link: { token: string } }>(
      ctx,
      'POST',
      `/api/v1/profiles/${profile.id}/share-links`,
      { cookie: owner.cookie, body: { scope: 'profile' } },
    );
    await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}`, { cookie: owner.cookie });
    expect((await jsonRequest(ctx, 'GET', `/api/v1/public/${created.body.link.token}`)).status).toBe(404);
  });
});

describe('成员邀请', () => {
  it('未注册邮箱返回 404，重复邀请返回 409', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const guest = await signup(ctx, 'guest@example.com');
    const profile = await createProfile(ctx, owner.cookie);

    const missing = await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/members`, {
      cookie: owner.cookie,
      body: { email: 'nobody@example.com', role: 'viewer' },
    });
    expect(missing.status).toBe(404);

    const ok = await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/members`, {
      cookie: owner.cookie,
      body: { email: guest.email, role: 'viewer' },
    });
    expect(ok.status).toBe(201);

    const dup = await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/members`, {
      cookie: owner.cookie,
      body: { email: guest.email, role: 'editor' },
    });
    expect(dup.status).toBe(409);
  });

  it('候选账号列表排除所有者、自己和已在成员里的人', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const guest = await signup(ctx, 'guest@example.com');
    const outsider = await signup(ctx, 'outsider@example.com');
    const profile = await createProfile(ctx, owner.cookie);

    const before = await jsonRequest<{ items: { id: string; email: string }[] }>(
      ctx,
      'GET',
      `/api/v1/profiles/${profile.id}/member-candidates`,
      { cookie: owner.cookie },
    );
    expect(before.status).toBe(200);
    expect(before.body.items.map((u) => u.id).sort()).toEqual([guest.id, outsider.id].sort());

    await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/members`, {
      cookie: owner.cookie,
      body: { email: guest.email, role: 'viewer' },
    });
    const after = await jsonRequest<{ items: { id: string }[] }>(
      ctx,
      'GET',
      `/api/v1/profiles/${profile.id}/member-candidates`,
      { cookie: owner.cookie },
    );
    expect(after.body.items.map((u) => u.id)).toEqual([outsider.id]);

    // 没有 manage 权限的人看不到候选列表（对外一律 404，不暴露档案是否存在）
    const denied = await jsonRequest(ctx, 'GET', `/api/v1/profiles/${profile.id}/member-candidates`, {
      cookie: outsider.cookie,
    });
    expect(denied.status).toBe(404);
  });
});
