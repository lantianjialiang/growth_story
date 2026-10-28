import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { paths } from '../config.js';
import type { DbClient } from '../db/client.js';
import { events, media, tags, eventTags, profiles } from '../db/schema.js';
import { getStorage } from '../storage/index.js';
import { parseAnniversaries } from './serializers.js';

function safeSegment(input: string, fallback: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .trim();
  return cleaned || fallback;
}

export interface ExportResult {
  filePath: string;
  sizeBytes: number;
  mediaCount: number;
  eventCount: number;
}

/**
 * 导出为 ZIP：manifest + profile + events（含媒体引用）+ 原图。
 * 流式写入磁盘，避免把整档案塞进内存。
 */
export async function exportProfile(
  client: DbClient,
  profileId: string,
  jobId: string,
): Promise<ExportResult> {
  const profile = client.db.select().from(profiles).where(eq(profiles.id, profileId)).get();
  if (!profile) throw new Error('profile_not_found');

  fs.mkdirSync(paths.exports, { recursive: true });
  const filePath = path.join(paths.exports, `${jobId}.zip`);

  const eventRows = client.db
    .select()
    .from(events)
    .where(and(eq(events.profileId, profileId), isNull(events.deletedAt)))
    .orderBy(asc(events.date), asc(events.id))
    .all();

  const mediaRows = client.db
    .select()
    .from(media)
    .where(and(eq(media.profileId, profileId), isNull(media.deletedAt)))
    .orderBy(asc(media.createdAt))
    .all();

  const tagRows = client.db
    .select({ eventId: eventTags.eventId, name: tags.name })
    .from(eventTags)
    .innerJoin(tags, eq(tags.id, eventTags.tagId))
    .all();
  const tagMap = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagMap.get(row.eventId) ?? [];
    list.push(row.name);
    tagMap.set(row.eventId, list);
  }

  const storage = getStorage();
  const output = fs.createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 6 } });

  const done = new Promise<ExportResult>((resolve, reject) => {
    output.on('close', () =>
      resolve({
        filePath,
        sizeBytes: archive.pointer(),
        mediaCount: mediaRows.length,
        eventCount: eventRows.length,
      }),
    );
    archive.on('error', reject);
    output.on('error', reject);
  });

  archive.pipe(output);

  const exportedAt = new Date().toISOString();
  archive.append(
    JSON.stringify(
      {
        app: 'growth-archive',
        exportVersion: 1,
        exportedAt,
        profileId,
        profileName: profile.name,
        counts: { events: eventRows.length, media: mediaRows.length },
      },
      null,
      2,
    ),
    { name: 'manifest.json' },
  );

  archive.append(
    JSON.stringify(
      {
        id: profile.id,
        kind: profile.kind,
        name: profile.name,
        birthDate: profile.birthDate,
        birthPrecision: profile.birthPrecision,
        deathDate: profile.deathDate,
        deathPrecision: profile.deathPrecision,
        anniversaries: parseAnniversaries(profile.anniversaries),
        attributes: JSON.parse(profile.attributes || '{}'),
        note: profile.note,
        createdAt: profile.createdAt,
      },
      null,
      2,
    ),
    { name: 'profile.json' },
  );

  const mediaByEvent = new Map<string, typeof mediaRows>();
  for (const row of mediaRows) {
    if (!row.eventId) continue;
    const list = mediaByEvent.get(row.eventId) ?? [];
    list.push(row);
    mediaByEvent.set(row.eventId, list);
  }

  // 文件名：日期 + 标题 + id 前 8 位，脱离系统也能读懂
  const mediaFileNames = new Map<string, string>();
  for (const row of mediaRows) {
    const relatedEvent = eventRows.find((e) => e.id === row.eventId);
    const date = relatedEvent?.date ?? (row.takenAt ? row.takenAt.slice(0, 10) : 'unknown');
    const [year = 'unknown', month = '00'] = date.split('-');
    const ext = path.extname(row.originalPath) || '.jpg';
    const title = safeSegment(relatedEvent?.title ?? 'photo', 'photo');
    mediaFileNames.set(row.id, `media/${year}/${month}/${date}-${title}-${row.id.slice(0, 8)}${ext}`);
  }

  const eventsOut = eventRows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    date: row.date,
    datePrecision: row.datePrecision,
    placeText: row.placeText,
    type: row.type,
    visibility: row.visibility,
    tags: tagMap.get(row.id) ?? [],
    createdAt: row.createdAt,
    media: (mediaByEvent.get(row.id) ?? []).map((m) => ({
      id: m.id,
      file: mediaFileNames.get(m.id),
      mime: m.mime,
      width: m.width,
      height: m.height,
      takenAt: m.takenAt,
      altText: m.altText,
    })),
  }));

  archive.append(JSON.stringify(eventsOut, null, 2), { name: 'events.json' });
  archive.append(JSON.stringify([], null, 2), { name: 'measurements.json' });
  archive.append(
    [
      '成长档案导出说明',
      '================',
      '',
      `导出时间：${exportedAt}`,
      `档案：${profile.name}`,
      '',
      '目录结构：',
      '- manifest.json       导出元信息（版本、时间、条目数）',
      '- profile.json        档案基本信息与扩展属性',
      '- events.json         全部事件（含标签、媒体引用）',
      '- measurements.json   成长数据（MVP 阶段为空数组）',
      '- media/YYYY/MM/      原图，文件名包含日期与事件标题',
      '',
      '说明：所有照片在上传时已清除 EXIF 中的 GPS 等定位信息。',
      '本导出为开放格式，不依赖本站即可长期保存与阅读。',
      '',
    ].join('\n'),
    { name: 'README.txt' },
  );

  for (const row of mediaRows) {
    const abs = storage.resolve(row.originalPath);
    const name = mediaFileNames.get(row.id)!;
    if (fs.existsSync(abs)) archive.file(abs, { name });
  }

  await archive.finalize();
  return done;
}
