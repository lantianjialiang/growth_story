import { afterEach, describe, expect, it } from 'vitest';
import type { AdminUserDTO } from '@growth/shared';
import {
  createProfile,
  createTestContext,
  jsonRequest,
  signup,
  type TestContext,
  type TestUser,
} from './helpers.js';

let ctx: TestContext;

afterEach(() => {
  ctx?.client.sqlite.close();
});

async function login(ctx: TestContext, email: string, password: string) {
  const res = await ctx.app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  return { status: res.status, cookie };
}

async function listUsers(cookie: string) {
  const res = await jsonRequest<{ items: AdminUserDTO[] }>(ctx, 'GET', '/api/v1/admin/users', { cookie });
  return res;
}

describe('账号管理', () => {
  it('第一个注册的账号是管理员，之后注册的是普通成员', async () => {
    ctx = createTestContext();
    const first = await signup(ctx, 'owner@example.com');
    const second = await signup(ctx, 'member@example.com');

    const me = await jsonRequest<{ user: { role: string } }>(ctx, 'GET', '/api/v1/auth/me', {
      cookie: first.cookie,
    });
    expect(me.body.user.role).toBe('admin');

    const me2 = await jsonRequest<{ user: { role: string } }>(ctx, 'GET', '/api/v1/auth/me', {
      cookie: second.cookie,
    });
    expect(me2.body.user.role).toBe('user');

    const list = await listUsers(first.cookie);
    expect(list.status).toBe(200);
    expect(list.body.items.map((u) => u.email)).toEqual(['owner@example.com', 'member@example.com']);
    expect(list.body.items[0].isSelf).toBe(true);
  });

  it('非管理员访问账号列表被拒绝', async () => {
    ctx = createTestContext();
    await signup(ctx, 'owner@example.com');
    const member = await signup(ctx, 'member@example.com');

    const list = await listUsers(member.cookie);
    expect(list.status).toBe(403);
  });

  it('管理员可以新建账号，新账号可以直接登录', async () => {
    ctx = createTestContext();
    const admin = await signup(ctx, 'owner@example.com');

    const created = await jsonRequest<{ user: AdminUserDTO }>(ctx, 'POST', '/api/v1/admin/users', {
      cookie: admin.cookie,
      body: { displayName: '奶奶', email: 'Nana@Example.com', password: 'password123', role: 'user' },
    });
    expect(created.status).toBe(201);
    // 邮箱统一小写
    expect(created.body.user.email).toBe('nana@example.com');
    expect(created.body.user.role).toBe('user');

    const session = await login(ctx, 'nana@example.com', 'password123');
    expect(session.status).toBe(200);

    const duplicated = await jsonRequest(ctx, 'POST', '/api/v1/admin/users', {
      cookie: admin.cookie,
      body: { displayName: '重复', email: 'nana@example.com', password: 'password123' },
    });
    expect(duplicated.status).toBe(409);
  });

  it('可以改昵称与角色，但至少保留一个管理员', async () => {
    ctx = createTestContext();
    const admin = await signup(ctx, 'owner@example.com');
    const member = await signup(ctx, 'member@example.com');

    const promoted = await jsonRequest<{ user: AdminUserDTO }>(
      ctx,
      'PATCH',
      `/api/v1/admin/users/${member.id}`,
      { cookie: admin.cookie, body: { displayName: '妈妈', role: 'admin' } },
    );
    expect(promoted.status).toBe(200);
    expect(promoted.body.user.displayName).toBe('妈妈');
    expect(promoted.body.user.role).toBe('admin');

    // 把自己降级成功（还有另一个管理员）
    const demoted = await jsonRequest<{ user: AdminUserDTO }>(
      ctx,
      'PATCH',
      `/api/v1/admin/users/${admin.id}`,
      { cookie: admin.cookie, body: { role: 'user' } },
    );
    expect(demoted.status).toBe(200);
    expect(demoted.body.user.role).toBe('user');

    // 现在只剩妈妈一个管理员，不能再降级
    const last = await jsonRequest<{ user: AdminUserDTO }>(
      ctx,
      'PATCH',
      `/api/v1/admin/users/${member.id}`,
      { cookie: member.cookie, body: { role: 'user' } },
    );
    expect(last.status).toBe(409);
  });

  it('重置密码会让旧密码失效、旧会话下线', async () => {
    ctx = createTestContext();
    const admin = await signup(ctx, 'owner@example.com');
    const member = await signup(ctx, 'member@example.com');

    const reset = await jsonRequest(ctx, 'PATCH', `/api/v1/admin/users/${member.id}`, {
      cookie: admin.cookie,
      body: { password: 'newpassword123' },
    });
    expect(reset.status).toBe(200);

    expect((await login(ctx, member.email, 'password123')).status).toBe(401);
    expect((await login(ctx, member.email, 'newpassword123')).status).toBe(200);

    // 原来的 Cookie 已经被销毁
    const me = await jsonRequest(ctx, 'GET', '/api/v1/auth/me', { cookie: member.cookie });
    expect(me.status).toBe(401);
  });

  it('停用与恢复：不能停用自己，有档案的账号要先处理', async () => {
    ctx = createTestContext();
    const admin = await signup(ctx, 'owner@example.com');
    const member = await signup(ctx, 'member@example.com');

    const self = await jsonRequest(ctx, 'DELETE', `/api/v1/admin/users/${admin.id}`, {
      cookie: admin.cookie,
    });
    expect(self.status).toBe(409);

    // 有档案的账号不能停用
    await createProfile(ctx, member.cookie, { name: '小满' });
    const blocked = await jsonRequest(ctx, 'DELETE', `/api/v1/admin/users/${member.id}`, {
      cookie: admin.cookie,
    });
    expect(blocked.status).toBe(409);

    const stranger = await signup(ctx, 'stranger@example.com');
    const disabled = await jsonRequest(ctx, 'DELETE', `/api/v1/admin/users/${stranger.id}`, {
      cookie: admin.cookie,
    });
    expect(disabled.status).toBe(200);

    // 停用后旧会话立即失效、也登录不了
    const me = await jsonRequest(ctx, 'GET', '/api/v1/auth/me', { cookie: stranger.cookie });
    expect(me.status).toBe(401);
    expect((await login(ctx, stranger.email, 'password123')).status).toBe(401);

    const list = await listUsers(admin.cookie);
    expect(list.body.items.find((u) => u.id === stranger.id)?.disabled).toBe(true);

    const restored = await jsonRequest(ctx, 'POST', `/api/v1/admin/users/${stranger.id}/restore`, {
      cookie: admin.cookie,
    });
    expect(restored.status).toBe(200);
    expect((await login(ctx, stranger.email, 'password123')).status).toBe(200);
  });

  it('彻底删除只能删已停用的账号，删完就查不到了', async () => {
    ctx = createTestContext();
    const admin = await signup(ctx, 'owner@example.com');
    const guest = await signup(ctx, 'guest@example.com');

    const tooEarly = await jsonRequest(ctx, 'DELETE', `/api/v1/admin/users/${guest.id}?purge=true`, {
      cookie: admin.cookie,
    });
    expect(tooEarly.status).toBe(409);

    await jsonRequest(ctx, 'DELETE', `/api/v1/admin/users/${guest.id}`, { cookie: admin.cookie });
    const purged = await jsonRequest(ctx, 'DELETE', `/api/v1/admin/users/${guest.id}?purge=true`, {
      cookie: admin.cookie,
    });
    expect(purged.status).toBe(200);

    const list = await listUsers(admin.cookie);
    expect(list.body.items.find((u) => u.id === guest.id)).toBeUndefined();
    expect((await login(ctx, guest.email, 'password123')).status).toBe(401);
  });

  it('普通成员看不到管理接口', async () => {
    ctx = createTestContext();
    await signup(ctx, 'owner@example.com');
    const member: TestUser = await signup(ctx, 'member@example.com');

    const created = await jsonRequest(ctx, 'POST', '/api/v1/admin/users', {
      cookie: member.cookie,
      body: { displayName: '偷偷建', email: 'x@example.com', password: 'password123' },
    });
    expect(created.status).toBe(403);
  });
});
