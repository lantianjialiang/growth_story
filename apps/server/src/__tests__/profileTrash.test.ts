import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
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
    fs.rmSync(ctx.uploadDir, { recursive: true, force: true });
    ctx = null;
  }
});

interface DeletedProfile {
  id: string;
  name: string;
  deletedAt: string;
  expiresAt: string;
  eventCount: number;
}

describe('档案回收站', () => {
  it('删除后出现在回收站，恢复后回到档案列表', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);

    const removed = await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}`, {
      cookie: user.cookie,
    });
    expect(removed.status).toBe(200);

    const active = await jsonRequest<{ items: { id: string }[] }>(ctx, 'GET', '/api/v1/profiles', {
      cookie: user.cookie,
    });
    expect(active.body.items.map((item) => item.id)).not.toContain(profile.id);

    const trash = await jsonRequest<{ items: DeletedProfile[]; retentionDays: number }>(
      ctx,
      'GET',
      '/api/v1/profiles?deleted=true',
      { cookie: user.cookie },
    );
    expect(trash.status).toBe(200);
    expect(trash.body.retentionDays).toBe(30);
    const entry = trash.body.items.find((item) => item.id === profile.id);
    expect(entry).toBeTruthy();
    expect(entry!.deletedAt).toBeTruthy();
    // 过期时间 = 删除时间 + 30 天
    const span = new Date(entry!.expiresAt).getTime() - new Date(entry!.deletedAt).getTime();
    expect(Math.round(span / 86_400_000)).toBe(30);

    const restored = await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/restore`, {
      cookie: user.cookie,
    });
    expect(restored.status).toBe(200);

    const after = await jsonRequest<{ items: { id: string }[] }>(ctx, 'GET', '/api/v1/profiles', {
      cookie: user.cookie,
    });
    expect(after.body.items.map((item) => item.id)).toContain(profile.id);

    const trashAfter = await jsonRequest<{ items: DeletedProfile[] }>(
      ctx,
      'GET',
      '/api/v1/profiles?deleted=true',
      { cookie: user.cookie },
    );
    expect(trashAfter.body.items).toHaveLength(0);
  });

  it('彻底删除会清掉档案、事件与照片记录', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);
    await createEvent(ctx, user.cookie, profile.id);

    // 未进回收站时不允许彻底删除，避免误操作
    const tooEarly = await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}/permanent`, {
      cookie: user.cookie,
    });
    expect(tooEarly.status).toBe(400);

    await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}`, { cookie: user.cookie });

    const purged = await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}/permanent`, {
      cookie: user.cookie,
    });
    expect(purged.status).toBe(200);

    const remaining = ctx.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM events WHERE profile_id = ?')
      .get(profile.id) as { n: number };
    expect(remaining.n).toBe(0);

    const profileRow = ctx.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM profiles WHERE id = ?')
      .get(profile.id) as { n: number };
    expect(profileRow.n).toBe(0);

    const trash = await jsonRequest<{ items: DeletedProfile[] }>(
      ctx,
      'GET',
      '/api/v1/profiles?deleted=true',
      { cookie: user.cookie },
    );
    expect(trash.body.items).toHaveLength(0);
  });

  it('看不到也恢复不了他人删除的档案', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx, 'owner@example.com');
    const other = await signup(ctx, 'other@example.com');
    const profile = await createProfile(ctx, owner.cookie);
    await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}`, { cookie: owner.cookie });

    const otherTrash = await jsonRequest<{ items: DeletedProfile[] }>(
      ctx,
      'GET',
      '/api/v1/profiles?deleted=true',
      { cookie: other.cookie },
    );
    expect(otherTrash.body.items).toHaveLength(0);

    const restore = await jsonRequest(ctx, 'POST', `/api/v1/profiles/${profile.id}/restore`, {
      cookie: other.cookie,
    });
    expect(restore.status).toBe(404);

    const purge = await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}/permanent`, {
      cookie: other.cookie,
    });
    expect(purge.status).toBe(404);
  });

  it('回收站需要登录', async () => {
    ctx = createTestContext();
    const anonymous = await jsonRequest(ctx, 'GET', '/api/v1/profiles?deleted=true');
    expect(anonymous.status).toBe(401);
  });
});
