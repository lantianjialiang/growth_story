import { z } from 'zod';
import { DATE_PRECISION_VALUES, isCalendarDate, normalizeByPrecision, type DatePrecision } from './date.js';

export const PROFILE_KINDS = ['person', 'child', 'pet'] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const EVENT_TYPES = [
  'milestone',
  'birthday',
  'health',
  'travel',
  'school',
  'daily',
  'other',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** 内置类型之外，用户可以给档案自定义类型；落库的是类型名称本身。 */
export const EVENT_TYPE_MAX_LENGTH = 24;

export function isBuiltinEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/** 类型标签：内置类型走 i18n，自定义类型直接用名称。 */
export function eventTypeLabel(type: string, t: (key: string) => string): string {
  return isBuiltinEventType(type) ? t(`event.type.${type}`) : type;
}

export const EVENT_VISIBILITY = ['inherit', 'private'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

export const MEMBER_ROLES = ['viewer', 'editor'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEDIA_SIZES = ['thumb', 'medium', 'original'] as const;
export type MediaSize = (typeof MEDIA_SIZES)[number];

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
  .refine(isCalendarDate, '不是一个合法的日历日期');

export const datePrecisionSchema = z.enum(DATE_PRECISION_VALUES as [DatePrecision, ...DatePrecision[]]);

/** 出生/逝世等"档案级日期"：允许整体为空。 */
export const profileDateSchema = z
  .object({
    date: calendarDate.nullable().optional(),
    precision: datePrecisionSchema.default('day'),
  })
  .nullable()
  .optional();

/** 纪念日：结婚纪念日、入园日、到家日…… 一条档案可以有多个。 */
export const anniversarySchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  label: z.string().trim().min(1, '请填写纪念日名称').max(40, '名称过长'),
  date: calendarDate,
  precision: datePrecisionSchema.default('day'),
});

export type AnniversaryInput = z.infer<typeof anniversarySchema>;

export const ANNIVERSARY_LABEL_MAX = 40;

export const ATTRIBUTE_KEYS = ['gender', 'breed', 'chipId', 'bloodType', 'allergies'] as const;

/** 按 kind 允许的扩展属性（规格 3.3）。 */
export const ATTRIBUTE_ALLOWED: Record<ProfileKind, readonly (typeof ATTRIBUTE_KEYS)[number][]> = {
  person: ['gender', 'bloodType', 'allergies'],
  child: ['gender', 'bloodType', 'allergies'],
  pet: ['gender', 'breed', 'chipId', 'allergies'],
};

export const profileAttributesSchema = z
  .object({
    gender: z.string().max(20).optional(),
    breed: z.string().max(60).optional(),
    chipId: z.string().max(60).optional(),
    bloodType: z.string().max(20).optional(),
    allergies: z.string().max(300).optional(),
  })
  .strip();

export const profileCreateSchema = z.object({
  kind: z.enum(PROFILE_KINDS),
  name: z.string().trim().min(1, '请填写名称').max(60, '名称过长'),
  birthDate: calendarDate.nullable().optional(),
  birthPrecision: datePrecisionSchema.default('day'),
  deathDate: calendarDate.nullable().optional(),
  deathPrecision: datePrecisionSchema.default('day'),
  anniversaries: z.array(anniversarySchema).max(20, '最多 20 个纪念日').default([]),
  attributes: profileAttributesSchema.default({}),
  note: z.string().max(2000).nullable().optional(),
});

export const profileUpdateSchema = profileCreateSchema.partial().extend({
  avatarMediaId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const eventCreateSchema = z.object({
  title: z.string().trim().min(1, '请填写标题').max(120, '标题过长'),
  body: z.string().max(20000).nullable().optional(),
  date: calendarDate,
  datePrecision: datePrecisionSchema.default('day'),
  placeText: z.string().max(200).nullable().optional(),
  // 内置类型（milestone/birthday/…）或档案自定义的类型名称
  type: z.string().trim().min(1, '请选择类型').max(EVENT_TYPE_MAX_LENGTH, '类型名称过长').default('daily'),
  visibility: z.enum(EVENT_VISIBILITY).default('inherit'),
  tags: z.array(z.string().trim().min(1).max(24)).max(12).default([]),
  coverMediaId: z.string().nullable().optional(),
});

export const eventUpdateSchema = eventCreateSchema.partial();

export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

export const memberInviteSchema = z.object({
  email: z.string().email('请输入有效邮箱'),
  role: z.enum(MEMBER_ROLES).default('viewer'),
});

/** 档案自定义事件类型：新增/改名都只提交名称 */
export const eventTypeInputSchema = z.object({
  label: z.string().trim().min(1, '请填写类型名称').max(EVENT_TYPE_MAX_LENGTH, '类型名称过长'),
});

/** 标签：新增/改名都只提交名称 */
export const tagInputSchema = z.object({
  name: z.string().trim().min(1, '请填写标签名称').max(24, '标签最长 24 个字'),
});

export const shareLinkCreateSchema = z.object({
  scope: z.enum(['profile', 'event']).default('profile'),
  eventId: z.string().nullable().optional(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});

/** 顺时针旋转：负值表示向左转 */
export const mediaRotateSchema = z.object({
  degrees: z.union([z.literal(90), z.literal(180), z.literal(270), z.literal(-90), z.literal(-180)]),
});

export const mediaUpdateSchema = z.object({
  eventId: z.string().nullable().optional(),
  altText: z.string().max(300).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const settingsUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  locale: z.enum(['zh-CN', 'en']).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, '密码至少 8 位').max(200),
});

/** 统一把输入日期按精度规范化后落库。 */
export function normalizeInputDate(date: string, precision: DatePrecision): string {
  return normalizeByPrecision(date, precision);
}

export const EVENT_TYPE_META: Record<EventType, { labelZh: string; labelEn: string; tone: string }> = {
  milestone: { labelZh: '里程碑', labelEn: 'Milestone', tone: 'milestone' },
  birthday: { labelZh: '生日', labelEn: 'Birthday', tone: 'birthday' },
  health: { labelZh: '健康', labelEn: 'Health', tone: 'health' },
  travel: { labelZh: '出行', labelEn: 'Travel', tone: 'travel' },
  school: { labelZh: '入园/上学', labelEn: 'School', tone: 'school' },
  daily: { labelZh: '日常', labelEn: 'Daily', tone: 'daily' },
  other: { labelZh: '其他', labelEn: 'Other', tone: 'other' },
};

export const PROFILE_KIND_META: Record<ProfileKind, { labelZh: string; labelEn: string }> = {
  person: { labelZh: '个人', labelEn: 'Person' },
  child: { labelZh: '孩子', labelEn: 'Child' },
  pet: { labelZh: '宠物', labelEn: 'Pet' },
};
