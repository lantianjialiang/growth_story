import type { MediaDTO, EventDTO, ProfileDTO, AnniversaryDTO } from '@growth/shared';
import type { DatePrecision, EventVisibility, ProfileKind } from '@growth/shared';
import type { events, media, profiles } from '../db/schema.js';

export type MediaRow = typeof media.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;

function mediaUrl(id: string, size: string, publicToken?: string, version?: string): string {
  // 带一个内容版本号：照片被旋转 / 重新处理后会换成新网址，不会被旧缓存粘住
  const suffix = version ? `&v=${version}` : '';
  return publicToken
    ? `/api/v1/public/${publicToken}/media/${id}/file?size=${size}${suffix}`
    : `/api/v1/media/${id}/file?size=${size}${suffix}`;
}

export function toMediaDTO(row: MediaRow, publicToken?: string): MediaDTO {
  const version = row.sha256 ? row.sha256.slice(0, 12) : undefined;
  return {
    id: row.id,
    profileId: row.profileId,
    eventId: row.eventId,
    kind: row.kind === 'video' ? 'video' : 'image',
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    takenAt: row.takenAt,
    altText: row.altText,
    sortOrder: row.sortOrder,
    status: row.status as MediaDTO['status'],
    urls: {
      thumb: mediaUrl(row.id, 'thumb', publicToken, version),
      medium: mediaUrl(row.id, 'medium', publicToken, version),
      original: mediaUrl(row.id, 'original', publicToken, version),
    },
  };
}

export function toEventDTO(
  row: EventRow,
  tags: string[],
  mediaRows: MediaRow[],
  publicToken?: string,
): EventDTO {
  return {
    id: row.id,
    profileId: row.profileId,
    title: row.title,
    body: row.body,
    date: row.date,
    datePrecision: row.datePrecision as DatePrecision,
    placeText: row.placeText,
    type: row.type,
    visibility: row.visibility as EventVisibility,
    coverMediaId: row.coverMediaId,
    tags,
    media: mediaRows.map((m) => toMediaDTO(m, publicToken)),
    mediaCount: mediaRows.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/** 把 anniversaries 字段（JSON 文本）解析成 DTO；坏数据不应该让整个档案打不开。 */
export function parseAnniversaries(raw: string | null | undefined): AnniversaryDTO[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const value = item as Partial<AnniversaryDTO> | null;
      if (!value || typeof value.label !== 'string' || typeof value.date !== 'string') return [];
      return [
        {
          id: typeof value.id === 'string' ? value.id : value.label,
          label: value.label,
          date: value.date,
          precision: (value.precision ?? 'day') as DatePrecision,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function toProfileDTO(
  row: ProfileRow,
  role: ProfileDTO['role'],
  stats: { eventCount: number; mediaCount: number; lastEventDate: string | null },
  avatarUrl: string | null,
): ProfileDTO {
  let attributes: Record<string, string | undefined> = {};
  try {
    attributes = JSON.parse(row.attributes) as Record<string, string | undefined>;
  } catch {
    attributes = {};
  }
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind as ProfileKind,
    name: row.name,
    avatarUrl,
    avatarMediaId: row.avatarMediaId,
    birthDate: row.birthDate,
    birthPrecision: row.birthPrecision as DatePrecision,
    deathDate: row.deathDate,
    deathPrecision: row.deathPrecision as DatePrecision,
    anniversaries: parseAnniversaries(row.anniversaries),
    attributes,
    note: row.note,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    role,
    eventCount: stats.eventCount,
    mediaCount: stats.mediaCount,
    lastEventDate: stats.lastEventDate,
  };
}
