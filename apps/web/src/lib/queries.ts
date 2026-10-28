import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AdminUserDTO,
  EventCreateInput,
  EventDTO,
  EventTypeDTO,
  ProfileCreateInput,
  ProfileDTO,
  ProfileFacets,
  TagDTO,
  TimelinePage,
  TimelineYear,
  UserDTO,
} from '@growth/shared';
import { api, qs } from './api';

export interface SessionResponse {
  user: UserDTO | null;
}

export const qk = {
  session: ['session'] as const,
  profiles: (archived = false) => ['profiles', archived] as const,
  profile: (id: string) => ['profile', id] as const,
  timeline: (id: string, filters: TimelineFilters) => ['timeline', id, filters] as const,
  facets: (id: string, filters: TimelineFilters) => ['facets', id, filters] as const,
  tags: (id: string) => ['tags', id] as const,
  tagsAll: (id: string) => ['tags-all', id] as const,
  eventTypes: (id: string) => ['event-types', id] as const,
  event: (id: string) => ['event', id] as const,
  members: (id: string) => ['members', id] as const,
  memberCandidates: (id: string) => ['member-candidates', id] as const,
  shareLinks: (id: string) => ['share-links', id] as const,
  trash: (id: string) => ['trash', id] as const,
  adminUsers: ['admin-users'] as const,
};

export interface TimelineFilters {
  year?: number;
  type?: string;
  tag?: string;
}

export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: async (): Promise<SessionResponse> => {
      try {
        return (await api.get<SessionResponse>('/api/v1/auth/me')) as SessionResponse;
      } catch {
        return { user: null };
      }
    },
    staleTime: 30_000,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: qk.adminUsers,
    queryFn: () => api.get<{ items: AdminUserDTO[] }>('/api/v1/admin/users'),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: UserDTO }>('/api/v1/auth/login', input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; displayName: string }) =>
      api.post<{ user: UserDTO }>('/api/v1/auth/register', input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/v1/auth/logout'),
    onSuccess: () => {
      qc.clear();
      qc.invalidateQueries();
    },
  });
}

export function useProfiles(archived = false) {
  return useQuery({
    queryKey: qk.profiles(archived),
    queryFn: () => api.get<{ items: ProfileDTO[] }>(`/api/v1/profiles${archived ? '?archived=true' : ''}`),
  });
}

export function useProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: qk.profile(profileId ?? ''),
    queryFn: () =>
      api.get<{ profile: ProfileDTO; years: TimelineYear[] }>(`/api/v1/profiles/${profileId}`),
    enabled: Boolean(profileId),
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileCreateInput) =>
      api.post<{ profile: ProfileDTO }>('/api/v1/profiles', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useUpdateProfile(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.patch<{ profile: ProfileDTO }>(`/api/v1/profiles/${profileId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', profileId] });
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useDeleteProfile(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del(`/api/v1/profiles/${profileId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export interface DeletedProfileDTO extends ProfileDTO {
  deletedAt: string;
  expiresAt: string;
}

/** 已删除档案（回收站）。仅返回自己是所有者的档案。 */
export function useDeletedProfiles() {
  return useQuery({
    queryKey: ['profiles', 'deleted'],
    queryFn: () =>
      api.get<{ items: DeletedProfileDTO[]; retentionDays: number }>('/api/v1/profiles?deleted=true'),
  });
}

export function useRestoreProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => api.post(`/api/v1/profiles/${profileId}/restore`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function usePurgeProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => api.del(`/api/v1/profiles/${profileId}/permanent`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useTimeline(profileId: string, filters: TimelineFilters) {
  return useInfiniteQuery({
    queryKey: qk.timeline(profileId, filters),
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api.get<TimelinePage>(
        `/api/v1/profiles/${profileId}/events${qs({
          year: filters.year,
          type: filters.type,
          tag: filters.tag,
          cursor: pageParam || undefined,
          limit: 20,
        })}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** 筛选器的候选计数：年份与标签的数字跟着其它筛选条件走。 */
export function useProfileFacets(profileId: string, filters: TimelineFilters) {
  return useQuery({
    queryKey: qk.facets(profileId, filters),
    queryFn: () =>
      api.get<ProfileFacets>(
        `/api/v1/profiles/${profileId}/facets${qs({
          year: filters.year,
          type: filters.type,
          tag: filters.tag,
        })}`,
      ),
    enabled: Boolean(profileId),
    // 换筛选条件时先留着上一份计数，避免下拉里的数字闪一下 0
    placeholderData: keepPreviousData,
  });
}

export function useProfileTags(profileId: string) {
  return useQuery({
    queryKey: qk.tags(profileId),
    queryFn: () => api.get<{ items: { name: string; count: number }[] }>(`/api/v1/profiles/${profileId}/tags`),
  });
}

/** 管理页的标签列表：含未被使用的标签与 id。 */
export function useTagList(profileId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.tagsAll(profileId),
    queryFn: () => api.get<{ items: TagDTO[] }>(`/api/v1/profiles/${profileId}/tags?all=true`),
    enabled,
  });
}

export function useCreateTag(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<{ item: TagDTO }>(`/api/v1/profiles/${profileId}/tags`, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tagsAll(profileId) });
      void qc.invalidateQueries({ queryKey: qk.tags(profileId) });
    },
  });
}

export function useRenameTag(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, name }: { tagId: string; name: string }) =>
      api.patch(`/api/v1/profiles/${profileId}/tags/${tagId}`, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tagsAll(profileId) });
      void qc.invalidateQueries({ queryKey: qk.tags(profileId) });
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: ['event'] });
    },
  });
}

export function useDeleteTag(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => api.del(`/api/v1/profiles/${profileId}/tags/${tagId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tagsAll(profileId) });
      void qc.invalidateQueries({ queryKey: qk.tags(profileId) });
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: ['event'] });
    },
  });
}

/** 档案可选的事件类型：内置 + 自定义。 */
export function useEventTypes(profileId: string | undefined) {
  return useQuery({
    queryKey: qk.eventTypes(profileId ?? ''),
    queryFn: () => api.get<{ items: EventTypeDTO[] }>(`/api/v1/profiles/${profileId}/event-types`),
    enabled: Boolean(profileId),
    staleTime: 60_000,
  });
}

function useEventTypeInvalidate(profileId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.eventTypes(profileId) });
    void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
    void qc.invalidateQueries({ queryKey: ['event'] });
  };
}

export function useCreateEventType(profileId: string) {
  const invalidate = useEventTypeInvalidate(profileId);
  return useMutation({
    mutationFn: (label: string) =>
      api.post<{ item: EventTypeDTO }>(`/api/v1/profiles/${profileId}/event-types`, { label }),
    onSuccess: invalidate,
  });
}

export function useRenameEventType(profileId: string) {
  const invalidate = useEventTypeInvalidate(profileId);
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api.patch<{ item: EventTypeDTO }>(`/api/v1/profiles/${profileId}/event-types/${id}`, { label }),
    onSuccess: invalidate,
  });
}

export function useDeleteEventType(profileId: string) {
  const invalidate = useEventTypeInvalidate(profileId);
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/profiles/${profileId}/event-types/${id}`),
    onSuccess: invalidate,
  });
}

export interface EventDetailResponse {
  event: EventDTO;
  profile: { id: string; name: string; birthDate: string | null; birthPrecision: string; deathDate: string | null };
  neighbors: { prevId: string | null; nextId: string | null };
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: qk.event(eventId ?? ''),
    queryFn: () => api.get<EventDetailResponse>(`/api/v1/events/${eventId}`),
    enabled: Boolean(eventId),
  });
}

export function useCreateEvent(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EventCreateInput) =>
      api.post<{ event: EventDTO }>(`/api/v1/profiles/${profileId}/events`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: ['profile', profileId] });
      void qc.invalidateQueries({ queryKey: qk.tags(profileId) });
    },
  });
}

export function useUpdateEvent(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, input }: { eventId: string; input: Record<string, unknown> }) =>
      api.patch<{ event: EventDTO }>(`/api/v1/events/${eventId}`, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: qk.event(data.event.id) });
      void qc.invalidateQueries({ queryKey: ['profile', profileId] });
    },
  });
}

export function useDeleteEvent(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.del(`/api/v1/events/${eventId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: ['profile', profileId] });
      void qc.invalidateQueries({ queryKey: qk.trash(profileId) });
    },
  });
}

export function useUploadMedia(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, eventId }: { files: File[]; eventId?: string | null }) => {
      const form = new FormData();
      for (const file of files) form.append('files', file);
      if (eventId) form.append('eventId', eventId);
      return api.upload<{ items: EventDTO['media']; skipped: { name: string; reason: string }[] }>(
        `/api/v1/profiles/${profileId}/media`,
        form,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: ['event'] });
      void qc.invalidateQueries({ queryKey: ['profile', profileId] });
    },
  });
}

export function usePatchMedia(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, input }: { mediaId: string; input: Record<string, unknown> }) =>
      api.patch(`/api/v1/media/${mediaId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event'] });
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: ['profile', profileId] });
    },
  });
}

export function useRotateMedia(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, degrees }: { mediaId: string; degrees: number }) =>
      api.post<{ media: EventDTO['media'][number] }>(`/api/v1/media/${mediaId}/rotate`, { degrees }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event'] });
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: ['profile', profileId] });
    },
  });
}

export function useDeleteMedia(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) => api.del(`/api/v1/media/${mediaId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event'] });
      void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
      void qc.invalidateQueries({ queryKey: qk.trash(profileId) });
    },
  });
}

export function useMembers(profileId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.members(profileId),
    queryFn: () =>
      api.get<{
        owner: { id: string; email: string; displayName: string; role: 'owner' } | null;
        items: { userId: string; email: string; displayName: string; role: string; createdAt: string }[];
      }>(`/api/v1/profiles/${profileId}/members`),
    enabled,
  });
}

export function useMemberCandidates(profileId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.memberCandidates(profileId),
    queryFn: () =>
      api.get<{ items: { id: string; email: string; displayName: string }[] }>(
        `/api/v1/profiles/${profileId}/member-candidates`,
      ),
    enabled,
  });
}

export function useShareLinks(profileId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.shareLinks(profileId),
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          token: string;
          url: string;
          scope: 'profile' | 'event';
          eventId: string | null;
          expiresAt: string | null;
          revokedAt: string | null;
          createdAt: string;
        }[];
      }>(`/api/v1/profiles/${profileId}/share-links`),
    enabled,
  });
}

export function useTrash(profileId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.trash(profileId),
    queryFn: () =>
      api.get<{
        items: {
          kind: 'event' | 'media';
          id: string;
          title: string;
          deletedAt: string;
          thumbUrl: string | null;
          expiresAt: string;
        }[];
      }>(`/api/v1/profiles/${profileId}/trash`),
    enabled,
  });
}
