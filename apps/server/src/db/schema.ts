import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('zh-CN'),
    /** admin：可管理其他账号；user：普通账号 */
    role: text('role').notNull().default('user'),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_uq').on(t.email),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
  }),
);

export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    avatarMediaId: text('avatar_media_id'),
    birthDate: text('birth_date'),
    birthPrecision: text('birth_precision').notNull().default('day'),
    deathDate: text('death_date'),
    deathPrecision: text('death_precision').notNull().default('day'),
    /** 纪念日列表（JSON 数组：{id,label,date,precision}） */
    anniversaries: text('anniversaries').notNull().default('[]'),
    attributes: text('attributes').notNull().default('{}'),
    note: text('note'),
    archivedAt: text('archived_at'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    ownerIdx: index('profiles_owner_idx').on(t.ownerId),
  }),
);

export const profileMembers = sqliteTable(
  'profile_members',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    invitedBy: text('invited_by'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.profileId, t.userId] }),
    userIdx: index('profile_members_user_idx').on(t.userId),
  }),
);

export const shareLinks = sqliteTable(
  'share_links',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    scope: text('scope').notNull().default('profile'),
    eventId: text('event_id'),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('share_links_token_uq').on(t.token),
    profileIdx: index('share_links_profile_idx').on(t.profileId),
  }),
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body'),
    date: text('date').notNull(),
    datePrecision: text('date_precision').notNull().default('day'),
    placeText: text('place_text'),
    placeLat: text('place_lat'),
    placeLng: text('place_lng'),
    type: text('type').notNull().default('daily'),
    visibility: text('visibility').notNull().default('inherit'),
    coverMediaId: text('cover_media_id'),
    createdBy: text('created_by'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    timelineIdx: index('events_timeline_idx').on(t.profileId, t.date, t.id),
    deletedIdx: index('events_deleted_idx').on(t.deletedAt),
    typeIdx: index('events_type_idx').on(t.profileId, t.type),
  }),
);

/** 档案自定义的事件类型；内置类型（EVENT_TYPES）不入库。 */
export const eventTypes = sqliteTable(
  'event_types',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    labelIdx: uniqueIndex('event_types_profile_label_uq').on(t.profileId, t.label),
  }),
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => ({
    nameIdx: uniqueIndex('tags_profile_name_uq').on(t.profileId, t.name),
  }),
);

export const eventTags = sqliteTable(
  'event_tags',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.tagId] }),
    tagIdx: index('event_tags_tag_idx').on(t.tagId),
  }),
);

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    kind: text('kind').notNull().default('image'),
    originalPath: text('original_path').notNull(),
    /** 上传时的原始文件名，落盘目录与导出都用它保持可读 */
    originalName: text('original_name'),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    takenAt: text('taken_at'),
    takenTzOffset: text('taken_tz_offset'),
    sha256: text('sha256').notNull(),
    variants: text('variants').notNull().default('{}'),
    altText: text('alt_text'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('ready'),
    uploadedBy: text('uploaded_by'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    profileIdx: index('media_profile_idx').on(t.profileId),
    eventIdx: index('media_event_idx').on(t.eventId),
    shaIdx: index('media_sha_idx').on(t.profileId, t.sha256),
    deletedIdx: index('media_deleted_idx').on(t.deletedAt),
  }),
);

export const exportJobs = sqliteTable('export_jobs', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  userId: text('user_id').notNull(),
  status: text('status').notNull(),
  filePath: text('file_path'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
  finishedAt: text('finished_at'),
});
