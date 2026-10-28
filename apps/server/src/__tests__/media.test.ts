import fs from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createProfile,
  createTestContext,
  jsonRequest,
  mediaFolder,
  signup,
  withExifGps,
  type TestContext,
} from './helpers.js';
import { detectImageType, readExif } from '../media/pipeline.js';

let ctx: TestContext | null = null;

// Windows 上 sharp 会缓存文件句柄，关闭缓存避免测试清理时 EBUSY
sharp.cache(false);

afterEach(() => {
  if (ctx) {
    ctx.client.sqlite.close();
    try {
      fs.rmSync(ctx.uploadDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 60 });
    } catch {
      /* 临时目录清理失败不影响测试结论 */
    }
    ctx = null;
  }
});

async function jpegBuffer(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 180, b: 160 } },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
}

describe('媒体流水线', () => {
  it('按文件头识别类型而不是扩展名', async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    expect(detectImageType(png)?.mime).toBe('image/png');
    expect(detectImageType(Buffer.from('not-an-image-at-all'))).toBeNull();
  });

  it('读取 EXIF 拍摄时间（不经过 Date，避免时区漂移）', async () => {
    const buffer = withExifGps(await jpegBuffer(), '2023:11:02 08:15:00');
    const exif = await readExif(buffer);
    expect(exif.takenAt).toBe('2023-11-02T08:15:00');
  });

  it('上传后原图不含 GPS / EXIF，拍摄时间仍入库', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);

    const original = withExifGps(await jpegBuffer(1600, 1200));
    // 先确认样例图确实带 GPS
    expect(await exifr.gps(original)).toBeTruthy();

    const form = new FormData();
    form.append('files', new File([original], 'gps.jpg', { type: 'image/jpeg' }));
    const res = await ctx.app.request(`/api/v1/profiles/${profile.id}/media`, {
      method: 'POST',
      headers: { cookie: user.cookie },
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      items: { id: string; takenAt: string | null; width: number | null; urls: Record<string, string> }[];
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.takenAt).toBe('2024-03-05T10:22:31');
    expect(body.items[0]!.width).toBe(1600);

    const mediaId = body.items[0]!.id;
    const folder = mediaFolder(ctx.uploadDir, mediaId);
    const files = fs.readdirSync(folder).sort();
    expect(files).toEqual(['medium.webp', 'original.jpg', 'thumb.webp']);

    const saved = fs.readFileSync(path.join(folder, 'original.jpg'));
    expect(await exifr.gps(saved)).toBeUndefined();
    expect(await exifr.parse(saved)).toBeUndefined();
    const meta = await sharp(saved).metadata();
    expect(meta.exif).toBeUndefined();
    // 原始 JSON 里也不应残留 GPS 坐标字符串
    expect(saved.includes(Buffer.from('GPS'))).toBe(false);
  });

  it('缩略图按长边缩小且保持比例', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);

    const form = new FormData();
    form.append('files', new File([await jpegBuffer(2400, 1200)], 'wide.jpg', { type: 'image/jpeg' }));
    const res = await ctx.app.request(`/api/v1/profiles/${profile.id}/media`, {
      method: 'POST',
      headers: { cookie: user.cookie },
      body: form,
    });
    const body = (await res.json()) as { items: { id: string }[] };
    const folder = mediaFolder(ctx.uploadDir, body.items[0]!.id);
    const thumb = await sharp(path.join(folder, 'thumb.webp')).metadata();
    const medium = await sharp(path.join(folder, 'medium.webp')).metadata();
    expect(thumb.width).toBeLessThanOrEqual(480);
    expect(medium.width).toBeLessThanOrEqual(1600);
    expect(Math.abs((thumb.width ?? 0) / (thumb.height ?? 1) - 2)).toBeLessThan(0.05);
  });

  it('照片按「档案名-年月-原文件名」落到可读目录', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);

    const form = new FormData();
    form.append('files', new File([await jpegBuffer()], 'IMG 2041.JPG', { type: 'image/jpeg' }));
    const res = await ctx.app.request(`/api/v1/profiles/${profile.id}/media`, {
      method: 'POST',
      headers: { cookie: user.cookie },
      body: form,
    });
    const body = (await res.json()) as { items: { id: string }[] };
    const mediaId = body.items[0]!.id;
    const folder = mediaFolder(ctx.uploadDir, mediaId);
    const relative = path.relative(ctx.uploadDir, folder).replaceAll('\\', '/');
    // 小满-<档案id8>/<YYYY-MM>/IMG-2041-<媒体id8>
    expect(relative).toMatch(/^小满-[0-9a-f]{8}\/\d{4}-\d{2}\/IMG-2041-[0-9a-f]{8}$/);
    expect(relative.endsWith(mediaId.slice(0, 8))).toBe(true);
  });

  it('同档案内重复照片按 sha256 去重', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);
    const buffer = await jpegBuffer();

    const upload = async () => {
      const form = new FormData();
      form.append('files', new File([buffer], 'same.jpg', { type: 'image/jpeg' }));
      const res = await ctx!.app.request(`/api/v1/profiles/${profile.id}/media`, {
        method: 'POST',
        headers: { cookie: user.cookie },
        body: form,
      });
      return res;
    };

    expect((await upload()).status).toBe(201);
    const second = await upload();
    // 第二次全部被跳过 → 422 + 明确原因
    expect(second.status).toBe(422);
    const body = (await second.json()) as { error: { details: { skipped: { reason: string }[] } } };
    expect(body.error.details.skipped[0]!.reason).toContain('重复');
  });

  it('未登录或无权访问时图片返回 404', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const other = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);

    const form = new FormData();
    form.append('files', new File([await jpegBuffer()], 'a.jpg', { type: 'image/jpeg' }));
    const up = await ctx.app.request(`/api/v1/profiles/${profile.id}/media`, {
      method: 'POST',
      headers: { cookie: owner.cookie },
      body: form,
    });
    const { items } = (await up.json()) as { items: { id: string }[] };
    const url = `/api/v1/media/${items[0]!.id}/file?size=thumb`;

    const anonymous = await ctx.app.request(url);
    expect(anonymous.status).toBe(404);
    const stranger = await ctx.app.request(url, { headers: { cookie: other.cookie } });
    expect(stranger.status).toBe(404);
    const ownerRes = await ctx.app.request(url, { headers: { cookie: owner.cookie } });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.headers.get('content-type')).toBe('image/webp');
    // 消费流，避免测试结束时文件句柄仍被占用
    expect((await ownerRes.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('拒绝伪装成图片的文件', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);
    const form = new FormData();
    form.append('files', new File([Buffer.from('<svg onload=alert(1)>')], 'evil.jpg', { type: 'image/jpeg' }));
    const res = await ctx.app.request(`/api/v1/profiles/${profile.id}/media`, {
      method: 'POST',
      headers: { cookie: user.cookie },
      body: form,
    });
    expect(res.status).toBe(422);
  });

  it('媒体归属变更不能跨档案', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const a = await createProfile(ctx, user.cookie, { name: 'A' });
    const b = await createProfile(ctx, user.cookie, { name: 'B' });
    const ev = await jsonRequest<{ event: { id: string } }>(ctx, 'POST', `/api/v1/profiles/${b.id}/events`, {
      cookie: user.cookie,
      body: { title: 'B 事件', date: '2024-01-01', datePrecision: 'day', type: 'daily' },
    });

    const form = new FormData();
    form.append('files', new File([await jpegBuffer()], 'a.jpg', { type: 'image/jpeg' }));
    const up = await ctx.app.request(`/api/v1/profiles/${a.id}/media`, {
      method: 'POST',
      headers: { cookie: user.cookie },
      body: form,
    });
    const { items } = (await up.json()) as { items: { id: string }[] };

    const patch = await jsonRequest(ctx, 'PATCH', `/api/v1/media/${items[0]!.id}`, {
      cookie: user.cookie,
      body: { eventId: ev.body.event.id },
    });
    expect(patch.status).toBe(403);
  });
});

describe('照片旋转', () => {
  async function uploadOne(ctx: TestContext, cookie: string, profileId: string) {
    const form = new FormData();
    // 800x600 的横图，转 90° 之后应变成 600x800
    form.append('files', new File([await jpegBuffer(800, 600)], 'r.jpg', { type: 'image/jpeg' }));
    const res = await ctx.app.request(`/api/v1/profiles/${profileId}/media`, {
      method: 'POST',
      headers: { cookie },
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      items: { id: string; width: number; height: number; urls: { medium: string } }[];
    };
    return body.items[0]!;
  }

  it('旋转后宽高互换、各尺寸重新生成，网址带上新版本号', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);
    const media = await uploadOne(ctx, user.cookie, profile.id);

    expect([media.width, media.height]).toEqual([800, 600]);
    expect(media.urls.medium).toContain('&v=');

    const rotate = await jsonRequest<{ media: { width: number; height: number; urls: { medium: string } } }>(
      ctx,
      'POST',
      `/api/v1/media/${media.id}/rotate`,
      { cookie: user.cookie, body: { degrees: 90 } },
    );
    expect(rotate.status).toBe(200);
    expect([rotate.body.media.width, rotate.body.media.height]).toEqual([600, 800]);
    expect(rotate.body.media.urls.medium).not.toBe(media.urls.medium);

    // 中图也真的转过来了（尺寸即证据，不用比对像素）
    const file = await ctx.app.request(rotate.body.media.urls.medium, { headers: { cookie: user.cookie } });
    expect(file.status).toBe(200);
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([600, 800]);
  });

  it('转两次 180° 等于没转，反复旋转从原图重算不累积损失', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);
    const media = await uploadOne(ctx, user.cookie, profile.id);

    for (const degrees of [180, 180]) {
      const res = await jsonRequest(ctx, 'POST', `/api/v1/media/${media.id}/rotate`, {
        cookie: user.cookie,
        body: { degrees },
      });
      expect(res.status).toBe(200);
    }
    const detail = await ctx.app.request(`/api/v1/media/${media.id}`, { headers: { cookie: user.cookie } });
    const body = (await detail.json()) as { media: { width: number; height: number } };
    expect([body.media.width, body.media.height]).toEqual([800, 600]);
  });

  it('非编辑者不能旋转，非法角度被拒绝', async () => {
    ctx = createTestContext();
    const owner = await signup(ctx);
    const other = await signup(ctx);
    const profile = await createProfile(ctx, owner.cookie);
    const media = await uploadOne(ctx, owner.cookie, profile.id);

    const stranger = await jsonRequest(ctx, 'POST', `/api/v1/media/${media.id}/rotate`, {
      cookie: other.cookie,
      body: { degrees: 90 },
    });
    expect([403, 404]).toContain(stranger.status);

    const invalid = await jsonRequest(ctx, 'POST', `/api/v1/media/${media.id}/rotate`, {
      cookie: owner.cookie,
      body: { degrees: 45 },
    });
    expect(invalid.status).toBe(422);
  });
});

describe('回收站里的照片', () => {
  it('彻底删除时连磁盘文件一起清掉，不留孤儿目录', async () => {
    ctx = createTestContext();
    const user = await signup(ctx);
    const profile = await createProfile(ctx, user.cookie);

    const form = new FormData();
    form.append('files', new File([await jpegBuffer(800, 600)], 'r.jpg', { type: 'image/jpeg' }));
    const uploaded = await ctx.app.request(`/api/v1/profiles/${profile.id}/media`, {
      method: 'POST',
      headers: { cookie: user.cookie },
      body: form,
    });
    expect(uploaded.status).toBe(201);
    const { items } = (await uploaded.json()) as { items: { id: string }[] };
    const mediaId = items[0]!.id;

    const folder = mediaFolder(ctx.uploadDir, mediaId);
    expect(fs.existsSync(folder)).toBe(true);

    await jsonRequest(ctx, 'DELETE', `/api/v1/media/${mediaId}`, { cookie: user.cookie });
    const purged = await jsonRequest(ctx, 'DELETE', `/api/v1/profiles/${profile.id}/trash/media/${mediaId}`, {
      cookie: user.cookie,
    });
    expect(purged.status).toBe(200);
    expect(fs.existsSync(folder)).toBe(false);
  });
});
