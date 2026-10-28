/**
 * 演示数据：一个孩子的档案 + 一只猫的档案 + 若干带照片的事件。
 * 用法：npm run seed        （已有数据时不动，除非加 --force 清空重建）
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { config, ensureDirs, paths } from './config.js';
import { createClient } from './db/client.js';
import { migrate } from './db/migrate.js';
import { eventTypes, events, media, profiles, users } from './db/schema.js';
import { hashPassword } from './auth/password.js';
import { processImage } from './media/pipeline.js';
import { setEventTags } from './services/tags.js';
import { LocalDriver } from './storage/index.js';

const DEMO_EMAIL = 'demo@growth.local';
const DEMO_PASSWORD = 'demo1234';

ensureDirs();
const client = createClient(paths.db);
migrate(client.sqlite, path.resolve(import.meta.dirname, '../drizzle'));

const existing = client.db.select({ id: users.id }).from(users).all();
if (existing.length > 0 && !process.argv.includes('--force')) {
  console.log(`数据库已有 ${existing.length} 个用户，跳过 seed。需要重来请加 --force。`);
  process.exit(0);
}

if (process.argv.includes('--force')) {
  client.sqlite.exec(`
    DELETE FROM media; DELETE FROM event_tags; DELETE FROM tags; DELETE FROM events;
    DELETE FROM share_links; DELETE FROM profile_members; DELETE FROM profiles; DELETE FROM sessions; DELETE FROM users;
  `);
  fs.rmSync(paths.uploads, { recursive: true, force: true });
  fs.mkdirSync(paths.uploads, { recursive: true });
}

const storage = new LocalDriver(paths.uploads);
const now = new Date().toISOString();
const userId = crypto.randomUUID();

client.db
  .insert(users)
  .values({
    id: userId,
    email: DEMO_EMAIL,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    displayName: '贾亮',
    locale: 'zh-CN',
    role: 'admin',
    createdAt: now,
  })
  .run();

interface EventSeed {
  title: string;
  date: string;
  precision?: 'day' | 'month' | 'year';
  /** 内置类型 key，或本档案自定义的类型名称 */
  type: string;
  body?: string;
  place?: string;
  tags?: string[];
  photos?: number;
  visibility?: 'inherit' | 'private';
}

const CHILD_EVENTS: EventSeed[] = [
  {
    title: '她来了',
    date: '2020-06-01',
    type: 'milestone',
    body: '凌晨四点二十，六斤二两。护士把她放在我怀里的时候，她睁着眼睛看了我很久，好像在确认这个人是谁。\n\n窗外的天刚开始亮。',
    place: '市妇幼保健院',
    tags: ['出生', '里程碑'],
    photos: 2,
  },
  {
    title: '第一次抬头',
    date: '2020-07-15',
    type: 'milestone',
    body: '趴着的时候把脑袋撑起来了几秒，然后又软软地趴回去。',
    tags: ['里程碑'],
  },
  {
    title: '第一次翻身',
    date: '2020-09-02',
    type: 'milestone',
    body: '从仰卧翻到侧躺，卡住了，哼哼唧唧地求助。',
    tags: ['里程碑'],
  },
  {
    title: '第一颗牙',
    date: '2020-11-20',
    type: 'health',
    body: '下门牙，白白的一点。咬人很疼。',
    tags: ['成长', '健康'],
  },
  {
    title: '第一次去海边',
    date: '2021-05-03',
    type: 'travel',
    body: '看到海的第一反应是往后退，第二反应是蹲下来抓沙子往嘴里塞。\n\n海风很大，她的帽檐一直翻起来。',
    place: '南戴河',
    tags: ['旅行', '第一次'],
    photos: 3,
  },
  {
    title: '一岁生日',
    date: '2021-06-01',
    type: 'birthday',
    body: '抓周抓了一支笔。蛋糕抹了一脸。',
    tags: ['生日'],
    photos: 2,
  },
  {
    title: '学会走路',
    date: '2021-09-18',
    type: 'milestone',
    body: '从沙发走到茶几，四步，然后一头栽进我怀里，笑得很得意。',
    tags: ['里程碑'],
    photos: 1,
  },
  {
    title: '第一次叫妈妈',
    date: '2021-10-07',
    type: 'milestone',
    body: '在超市的货架前，很清楚地喊了两声。旁边阿姨都笑了。',
    tags: ['里程碑'],
  },
  {
    title: '发烧到 39 度',
    date: '2022-01-12',
    type: 'health',
    body: '半夜两点烧起来，整个人烫得吓人。物理降温、退烧药，天亮才退下去。\n\n第一次觉得"健康"这两个字这么重。',
    tags: ['健康'],
  },
  {
    title: '上托班第一天',
    date: '2022-09-01',
    type: 'school',
    body: '送到门口抱着我不撒手，老师接过去的时候哭得撕心裂肺。\n\n下午去接，她在门口的小凳子上坐着，看到我就冲过来。',
    place: '青苗幼儿园',
    tags: ['入园'],
    photos: 1,
  },
  {
    title: '两岁生日',
    date: '2022-06-01',
    type: 'birthday',
    body: '会自己吹蜡烛了，吹了三次才灭。',
    tags: ['生日'],
    photos: 1,
  },
  {
    title: '第一次骑平衡车',
    date: '2023-04-05',
    type: 'milestone',
    body: '在小区里滑了一下午，膝盖磕破了也不肯回家。',
    place: '小区中庭',
    tags: ['运动'],
    photos: 2,
  },
  {
    title: '三岁生日',
    date: '2023-06-01',
    type: 'birthday',
    body: '许愿说想要一只真的会飞的恐龙。',
    tags: ['生日'],
    photos: 1,
  },
  {
    title: '动物园',
    date: '2023-08-12',
    type: 'travel',
    body: '在长颈鹿馆站了四十分钟不肯走。回来路上在推车里睡着了，手里还攥着门票。',
    place: '市动物园',
    tags: ['旅行'],
    photos: 3,
  },
  {
    title: '学会自己穿鞋',
    date: '2024-01-15',
    type: 'milestone',
    body: '左右穿反了，但坚持要自己来。',
    tags: ['自理'],
  },
  {
    title: '四岁生日',
    date: '2024-06-01',
    type: 'birthday',
    body: '请了幼儿园的三个好朋友来家里，把客厅拆了。',
    tags: ['生日'],
    photos: 2,
  },
  {
    title: '国庆回老家',
    date: '2024-10-02',
    type: 'travel',
    body: '在院子里追鸡，被外公抱着去田埂上看日落。\n\n她说："这里的天空比我们家的大。"',
    place: '老家',
    tags: ['旅行', '家人'],
    photos: 2,
  },
  {
    title: '会写自己的名字了',
    date: '2025-02-14',
    type: 'milestone',
    body: '"满"字的三点水写成了一个圈，但她很满意。',
    tags: ['里程碑'],
    photos: 1,
  },
  {
    title: '五岁生日',
    date: '2025-06-01',
    type: 'birthday',
    body: '今年的愿望是"想要长大，但也想一直这样"。',
    tags: ['生日'],
    photos: 1,
  },
  {
    title: '第一次跳绳一百下',
    date: '2026-03-08',
    type: 'milestone',
    body: '数到一百的时候自己喊了一声"耶"，然后把绳子扔了。',
    place: '小区中庭',
    tags: ['运动'],
    photos: 1,
  },
  {
    title: '今天她说',
    date: '2026-09-20',
    type: '童言',
    body: '睡前突然问我："妈妈，你小时候也怕黑吗？"\n\n我说怕。她说："那我们一起怕吧。"',
    tags: ['日常'],
    visibility: 'private',
  },
];

const PET_EVENTS: EventSeed[] = [
  { title: '咪咪来到家里', date: '2019-04-10', type: 'milestone', body: '在楼道里捡到的，很小一只，浑身是灰。', tags: ['第一天'] },
  { title: '第一次打疫苗', date: '2019-06-12', type: 'health', body: '三联第一针，全程缩在角落。', tags: ['健康'] },
  { title: '绝育手术', date: '2020-03-20', type: 'health', body: '手术很顺利，戴了两周伊丽莎白圈，情绪很差。', tags: ['健康'] },
  { title: '学会开门', date: '2022-07-08', type: 'milestone', body: '跳起来压门把手，现在全家的门都得反锁。', tags: ['技能'] },
];

async function makePhoto(title: string, seed: number): Promise<Buffer> {
  const palettes = [
    ['#f3e2d3', '#d9a689'],
    ['#e6ece2', '#9fb29a'],
    ['#f0e6ef', '#b79cba'],
    ['#e8eef4', '#93aec6'],
    ['#f6efd8', '#c9b077'],
  ];
  const [from, to] = palettes[seed % palettes.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="1600" height="1100" fill="url(#g)"/>
    <circle cx="${300 + (seed * 137) % 900}" cy="${260 + (seed * 89) % 500}" r="${180 + (seed * 31) % 220}" fill="#ffffff" opacity="0.22"/>
    <circle cx="${1200 - (seed * 71) % 700}" cy="${720 - (seed * 53) % 400}" r="${120 + (seed * 17) % 160}" fill="#000000" opacity="0.06"/>
    <text x="80" y="1010" font-family="serif" font-size="52" fill="#ffffff" opacity="0.85">${title}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
}

async function addMedia(profileId: string, eventId: string, title: string, count: number, date: string) {
  const ids: string[] = [];
  const owner = client.db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, profileId)).get();
  for (let i = 0; i < count; i += 1) {
    const id = crypto.randomUUID();
    const buffer = await makePhoto(title, i + title.length);
    const fileName = `${title}-${i + 1}.jpg`;
    const processed = await processImage(buffer, {
      keyInput: {
        profileName: owner?.name ?? 'profile',
        profileId,
        mediaId: id,
        fileName,
        uploadedAt: new Date(`${date}T10:00:00`),
      },
      storage,
    });
    client.db
      .insert(media)
      .values({
        id,
        profileId,
        eventId,
        kind: 'image',
        originalPath: processed.originalKey,
        originalName: fileName,
        mime: processed.mime,
        sizeBytes: processed.sizeBytes,
        width: processed.width,
        height: processed.height,
        takenAt: `${date}T10:00:00`,
        sha256: processed.sha256,
        variants: JSON.stringify(processed.variants),
        altText: title,
        sortOrder: i,
        status: 'ready',
        uploadedBy: userId,
        createdAt: now,
      })
      .run();
    ids.push(id);
  }
  return ids;
}

const childId = crypto.randomUUID();
const petId = crypto.randomUUID();

client.db.insert(profiles).values([
  {
    id: childId,
    ownerId: userId,
    kind: 'child',
    name: '小满',
    birthDate: '2020-06-01',
    birthPrecision: 'day',
    anniversaries: JSON.stringify([
      { id: 'ann-child-birth', label: '出生纪念日', date: '2020-06-01', precision: 'day' },
      { id: 'ann-child-school', label: '入园纪念日', date: '2023-09-01', precision: 'month' },
    ]),
    attributes: JSON.stringify({ gender: '女', allergies: '花生' }),
    note: '喜欢恐龙、石头和所有会滚的东西。',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: petId,
    ownerId: userId,
    kind: 'pet',
    name: '咪咪',
    birthDate: '2019-04-01',
    birthPrecision: 'month',
    anniversaries: JSON.stringify([
      { id: 'ann-pet-home', label: '到家纪念日', date: '2019-04-10', precision: 'day' },
    ]),
    attributes: JSON.stringify({ breed: '狸花猫', gender: '母', chipId: 'CN-9812-3341' }),
    note: '楼道里捡来的，现在是家里话最多的一个。',
    createdAt: now,
    updatedAt: now,
  },
]).run();

// 演示用的自定义事件类型（内置类型不入库）
client.db
  .insert(eventTypes)
  .values([
    { id: crypto.randomUUID(), profileId: childId, label: '童言', createdAt: now },
    { id: crypto.randomUUID(), profileId: childId, label: '喂养', createdAt: now },
  ])
  .run();

let photoCount = 0;
let firstCover: { eventId: string; mediaId: string } | null = null;

for (const [index, seed] of CHILD_EVENTS.entries()) {
  const eventId = crypto.randomUUID();
  client.db
    .insert(events)
    .values({
      id: eventId,
      profileId: childId,
      title: seed.title,
      body: seed.body ?? null,
      date: seed.date,
      datePrecision: seed.precision ?? 'day',
      placeText: seed.place ?? null,
      type: seed.type,
      visibility: seed.visibility ?? 'inherit',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  setEventTags(client, childId, eventId, seed.tags ?? []);
  if (seed.photos) {
    const ids = await addMedia(childId, eventId, seed.title, seed.photos, seed.date);
    photoCount += ids.length;
    client.db
      .update(events)
      .set({ coverMediaId: ids[0] ?? null })
      .where(eq(events.id, eventId))
      .run();
    if (!firstCover) firstCover = { eventId, mediaId: ids[0]! };
  }
  void index;
}

for (const seed of PET_EVENTS) {
  const eventId = crypto.randomUUID();
  client.db
    .insert(events)
    .values({
      id: eventId,
      profileId: petId,
      title: seed.title,
      body: seed.body ?? null,
      date: seed.date,
      datePrecision: seed.precision ?? 'day',
      placeText: seed.place ?? null,
      type: seed.type,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  setEventTags(client, petId, eventId, seed.tags ?? []);
}

if (firstCover) {
  client.db
    .update(profiles)
    .set({ avatarMediaId: firstCover.mediaId })
    .where(eq(profiles.id, childId))
    .run();
}

console.log(
  [
    '✅ 演示数据已生成',
    `   账号：${DEMO_EMAIL} / ${DEMO_PASSWORD}`,
    `   档案：小满（${CHILD_EVENTS.length} 条记录）、咪咪（${PET_EVENTS.length} 条记录）`,
    `   照片：${photoCount} 张，存放于 ${paths.uploads}`,
    `   数据目录：${config.dataDir}`,
  ].join('\n'),
);

client.sqlite.close();
