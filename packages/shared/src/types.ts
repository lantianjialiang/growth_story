import type { DatePrecision } from './date.js';
import type {
  EventType,
  EventVisibility,
  MediaSize,
  MemberRole,
  ProfileKind,
} from './schemas.js';

/** 档案级纪念日（结婚纪念日、入园日、到家日…）。 */
export interface AnniversaryDTO {
  id: string;
  label: string;
  date: string;
  precision: DatePrecision;
}

/** 档案里可选的事件类型：内置类型 + 自定义类型。 */
export interface EventTypeDTO {
  /** 内置类型是 key（如 travel），自定义类型是名称本身 */
  type: string;
  /** 自定义类型的记录 id；内置类型为 null */
  id: string | null;
  custom: boolean;
  usingCount: number;
}

export interface TagDTO {
  id: string;
  name: string;
  count: number;
}

export type UserRole = 'admin' | 'user';

export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  /** admin 可以管理其他账号 */
  role: UserRole;
}

/** 账号管理页用的账号信息（比 UserDTO 多出统计与状态）。 */
export interface AdminUserDTO {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
  /** 名下未删除的档案数 */
  profileCount: number;
  /** 已被停用（软删除）的账号 */
  disabled: boolean;
  /** 是不是当前登录的这个账号 */
  isSelf: boolean;
}

export interface MediaDTO {
  id: string;
  profileId: string;
  eventId: string | null;
  kind: 'image' | 'video';
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  altText: string | null;
  sortOrder: number;
  status: 'processing' | 'ready' | 'failed';
  /** 相对 API 的访问地址（已带鉴权上下文由 cookie 承担） */
  urls: { thumb: string; medium: string; original: string };
}

export interface EventDTO {
  id: string;
  profileId: string;
  title: string;
  body: string | null;
  date: string;
  datePrecision: DatePrecision;
  placeText: string | null;
  /** 内置类型 key 或自定义类型名称 */
  type: string;
  visibility: EventVisibility;
  coverMediaId: string | null;
  tags: string[];
  media: MediaDTO[];
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProfileDTO {
  id: string;
  ownerId: string;
  kind: ProfileKind;
  name: string;
  avatarUrl: string | null;
  avatarMediaId: string | null;
  birthDate: string | null;
  birthPrecision: DatePrecision;
  deathDate: string | null;
  deathPrecision: DatePrecision;
  anniversaries: AnniversaryDTO[];
  attributes: Record<string, string | undefined>;
  note: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: 'owner' | MemberRole;
  eventCount: number;
  mediaCount: number;
  lastEventDate: string | null;
}

export interface TimelineYear {
  year: number;
  eventCount: number;
  mediaCount: number;
}

export interface TimelinePage {
  items: EventDTO[];
  nextCursor: string | null;
  years: TimelineYear[];
  /** 档案里的记录总数（不受筛选影响） */
  total: number;
  /** 当前筛选条件下的记录数 */
  filteredTotal: number;
}

export interface ProfileFacets {
  years: TimelineYear[];
  tags: { name: string; count: number }[];
}

export interface MemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: MemberRole;
  createdAt: string;
}

export interface ShareLinkDTO {
  id: string;
  token: string;
  url: string;
  scope: 'profile' | 'event';
  eventId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface TrashItemDTO {
  kind: 'event' | 'media';
  id: string;
  profileId: string;
  title: string;
  deletedAt: string;
  thumbUrl: string | null;
  expiresAt: string;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export type ExportStatus = { id: string; status: 'processing' | 'ready' | 'failed'; url: string | null };

export type { MediaSize };
