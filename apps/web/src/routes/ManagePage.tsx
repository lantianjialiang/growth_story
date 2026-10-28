import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventTypeDTO, TagDTO } from '@growth/shared';
import { eventTypeLabel } from '@growth/shared';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { compactDate } from '../lib/format';
import {
  qk,
  useCreateEventType,
  useCreateTag,
  useDeleteEventType,
  useDeleteProfile,
  useDeleteTag,
  useEventTypes,
  useMemberCandidates,
  useMembers,
  useProfile,
  useRenameEventType,
  useRenameTag,
  useShareLinks,
  useSession,
  useTagList,
  useTrash,
  useUpdateProfile,
} from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { ProfileForm } from '../components/ProfileForm';
import { AvatarPickerModal } from '../components/AvatarPicker';
import { useToast } from '../components/toast';
import { Avatar, Button, ConfirmModal, EmptyState, Field, Modal, SkeletonBlock } from '../components/ui';

type Tab = 'info' | 'members' | 'share' | 'taxonomy' | 'trash';

const TABS: Tab[] = ['info', 'members', 'share', 'taxonomy', 'trash'];

export function ManagePage() {
  const { profileId = '' } = useParams();
  const { t } = useI18n();
  const [search, setSearch] = useSearchParams();
  const tab = (TABS.includes(search.get('tab') as Tab) ? search.get('tab') : 'info') as Tab;
  const profileQuery = useProfile(profileId);
  const profile = profileQuery.data?.profile;

  if (profileQuery.isLoading) {
    return (
      <AppShell>
        <SkeletonBlock className="h-40" />
      </AppShell>
    );
  }
  if (!profile) {
    return (
      <AppShell>
        <EmptyState title={t('error.notFound')} body="这个档案可能已被删除。" />
      </AppShell>
    );
  }
  if (profile.role !== 'owner') {
    return (
      <AppShell>
        <EmptyState title="仅所有者可管理" body="你在这个档案中的角色不允许进入管理页。" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/p/${profile.id}`} className="text-xs text-muted hover:text-accent">
            ← {profile.name}
          </Link>
          <h1 className="mt-1 font-serif text-2xl text-ink">{t('manage.title')}</h1>
        </div>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line pb-px">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSearch({ tab: item }, { replace: true })}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === item
                ? 'border-accent font-medium text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t(`manage.tab.${item}`)}
          </button>
        ))}
      </div>

      {tab === 'info' ? <InfoTab profileId={profileId} /> : null}
      {tab === 'members' ? <MembersTab profileId={profileId} /> : null}
      {tab === 'share' ? <ShareTab profileId={profileId} /> : null}
      {tab === 'taxonomy' ? <TaxonomyTab profileId={profileId} /> : null}
      {tab === 'trash' ? <TrashTab profileId={profileId} /> : null}
    </AppShell>
  );
}

function InfoTab({ profileId }: { profileId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const profileQuery = useProfile(profileId);
  const profile = profileQuery.data?.profile;
  const update = useUpdateProfile(profileId);
  const remove = useDeleteProfile(profileId);
  const [editing, setEditing] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!profile) return null;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setPickingAvatar(true)}
            className="group relative rounded-full"
            title={t('manage.avatar.hint')}
          >
            <Avatar src={profile.avatarUrl} name={profile.name} kind={profile.kind} size={68} />
            <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-ink/45 text-[10px] text-white group-hover:flex">
              {t('common.edit')}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl text-ink">{profile.name}</h2>
            <p className="mt-1 text-xs text-muted">
              {t(`profiles.kind.${profile.kind}`)}
              {profile.birthDate ? ` · ${compactDate(profile.birthDate, profile.birthPrecision)}` : ''}
              {profile.deathDate ? ` — ${compactDate(profile.deathDate, profile.deathPrecision)}` : ''}
            </p>
            {profile.note ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-soft/85">{profile.note}</p>
            ) : null}
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
        </div>

        {Object.keys(profile.attributes).filter((k) => profile.attributes[k]).length > 0 ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-4 text-xs sm:grid-cols-3">
            {Object.entries(profile.attributes)
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-muted">{t(`profiles.field.${key}`)}</dt>
                  <dd className="mt-0.5 text-ink-soft">{value}</dd>
                </div>
              ))}
          </dl>
        ) : null}

        {profile.anniversaries.length > 0 ? (
          <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-2 border-t border-line pt-4 text-xs sm:grid-cols-2">
            {profile.anniversaries.map((item) => (
              <div key={item.id} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">{item.label}</dt>
                <dd className="text-ink-soft">{compactDate(item.date, item.precision)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <ArchiveCard profileId={profile.id} name={profile.name} />

      <section className="card divide-y divide-line">
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm text-ink">{t('manage.delete')}</p>
            <p className="mt-0.5 text-xs text-muted">删除后进入回收站，30 天内可以恢复。</p>
          </div>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            {t('common.delete')}
          </Button>
        </div>
      </section>

      <ProfileForm open={editing} onClose={() => setEditing(false)} profile={profile} />

      <AvatarPickerModal
        open={pickingAvatar}
        profileId={profile.id}
        currentMediaId={profile.avatarMediaId}
        onClose={() => setPickingAvatar(false)}
        onPick={(pick) =>
          update.mutate(
            { avatarMediaId: pick?.id ?? null },
            {
              onSuccess: () => toast.success(t('settings.saved')),
              onError: (err) => toast.error(errorMessage(err)),
            },
          )
        }
      />

      <ConfirmModal
        open={confirmDelete}
        title={t('manage.delete')}
        body={t('profiles.delete.confirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync();
            toast.success(t('trash.moved'));
            // 直接落到回收站，用户能立刻看到恢复入口
            navigate('/trash');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}

function MembersTab({ profileId }: { profileId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const members = useMembers(profileId, true);
  const candidates = useMemberCandidates(profileId, true);
  const session = useSession();
  const available = candidates.data?.items ?? [];
  const isAdmin = session.data?.user?.role === 'admin';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.members(profileId) });
    void qc.invalidateQueries({ queryKey: qk.memberCandidates(profileId) });
  };

  const invite = useMutation({
    mutationFn: () => api.post(`/api/v1/profiles/${profileId}/members`, { email: email.trim(), role }),
    onSuccess: () => {
      setEmail('');
      void invalidate();
      toast.success('已添加成员');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, nextRole }: { userId: string; nextRole: string }) =>
      api.patch(`/api/v1/profiles/${profileId}/members/${userId}`, { role: nextRole }),
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.del(`/api/v1/profiles/${profileId}/members/${userId}`),
    onSuccess: () => {
      void invalidate();
      setRemoving(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">{t('manage.members.title')}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t('manage.members.hint')}</p>

        <ul className="mt-4 divide-y divide-line">
          {members.data?.owner ? (
            <li className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-ink">{members.data.owner.displayName}</p>
                <p className="text-xs text-muted">{members.data.owner.email}</p>
              </div>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
                {t('manage.members.owner')}
              </span>
            </li>
          ) : null}
          {members.data?.items.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{member.displayName}</p>
                <p className="truncate text-xs text-muted">{member.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="select select-sm w-auto"
                  value={member.role}
                  onChange={(e) => changeRole.mutate({ userId: member.userId, nextRole: e.target.value })}
                >
                  <option value="viewer">{t('manage.role.viewer')}</option>
                  <option value="editor">{t('manage.role.editor')}</option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted"
                  onClick={() => setRemoving({ userId: member.userId, name: member.displayName })}
                >
                  {t('manage.members.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            invite.mutate();
          }}
        >
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="invite-account">
              {t('auth.email')}
            </label>
            {available.length > 0 ? (
              <select
                id="invite-account"
                className="select"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              >
                <option value="">{t('manage.members.pick')}</option>
                {available.map((candidate) => (
                  <option key={candidate.id} value={candidate.email}>
                    {candidate.displayName} · {candidate.email}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-3.5 py-2.5 text-xs leading-relaxed text-muted">
                {t('manage.members.noCandidates')}
                {isAdmin ? (
                  <Link to="/users" className="ml-1 text-accent hover:underline">
                    {t('nav.users')}
                  </Link>
                ) : null}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="invite-role">
              {t('manage.members.roleLabel')}
            </label>
            <select
              id="invite-role"
              className="select w-auto"
              value={role}
              onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
            >
              <option value="viewer">{t('manage.role.viewer')}</option>
              <option value="editor">{t('manage.role.editor')}</option>
            </select>
          </div>
          <Button type="submit" variant="primary" loading={invite.isPending} disabled={!email.trim()}>
            {t('manage.members.add')}
          </Button>
        </form>
      </section>

      <ConfirmModal
        open={Boolean(removing)}
        title={t('manage.members.remove')}
        body={`${removing?.name ?? ''} · ${t('manage.members.removeConfirm')}`}
        confirmText={t('manage.members.remove')}
        cancelText={t('common.cancel')}
        loading={removeMember.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) removeMember.mutate(removing.userId);
        }}
      />
    </div>
  );
}

function ShareTab({ profileId }: { profileId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const links = useShareLinks(profileId, true);
  const [scope, setScope] = useState<'profile' | 'event'>('profile');
  const [eventId, setEventId] = useState('');
  const [expires, setExpires] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; url: string } | null>(null);

  const eventsQuery = useQuery({
    queryKey: ['share-event-options', profileId],
    queryFn: () =>
      api.get<{ items: { id: string; title: string; date: string }[] }>(
        `/api/v1/profiles/${profileId}/events?limit=50`,
      ),
    enabled: scope === 'event',
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.shareLinks(profileId) });

  const create = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/profiles/${profileId}/share-links`, {
        scope,
        eventId: scope === 'event' ? eventId : null,
        expiresInDays: expires ? Number(expires) : null,
      }),
    onSuccess: () => {
      void invalidate();
      toast.success(t('manage.share.create'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const revoke = useMutation({
    mutationFn: (linkId: string) => api.del(`/api/v1/profiles/${profileId}/share-links/${linkId}`),
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const purge = useMutation({
    mutationFn: (linkId: string) =>
      api.del(`/api/v1/profiles/${profileId}/share-links/${linkId}?purge=true`),
    onSuccess: () => {
      void invalidate();
      setDeleting(null);
      toast.success(t('manage.share.deleted'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const absolute = (path: string) => `${window.location.origin}${path}`;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">{t('manage.share.title')}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t('manage.share.hint')}</p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="share-scope">
              范围
            </label>
            <select
              id="share-scope"
              className="select w-auto"
              value={scope}
              onChange={(e) => setScope(e.target.value as 'profile' | 'event')}
            >
              <option value="profile">{t('manage.share.scope.profile')}</option>
              <option value="event">{t('manage.share.scope.event')}</option>
            </select>
          </div>

          {scope === 'event' ? (
            <div className="min-w-52">
              <label className="label" htmlFor="share-event">
                {t('event.new')}
              </label>
              <select
                id="share-event"
                className="select"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                <option value="">—</option>
                {eventsQuery.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.date} · {item.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="share-expires">
              {t('manage.share.expires')}
            </label>
            <select
              id="share-expires"
              className="select w-auto"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            >
              <option value="">{t('manage.share.never')}</option>
              <option value="7">{t('manage.share.days', { n: 7 })}</option>
              <option value="30">{t('manage.share.days', { n: 30 })}</option>
              <option value="180">{t('manage.share.days', { n: 180 })}</option>
            </select>
          </div>

          <Button
            variant="primary"
            loading={create.isPending}
            disabled={scope === 'event' && !eventId}
            onClick={() => create.mutate()}
          >
            {t('manage.share.create')}
          </Button>
        </div>

        <ul className="mt-5 space-y-2">
          {(links.data?.items.length ?? 0) === 0 ? (
            <li className="py-6 text-center text-sm text-muted">{t('manage.share.empty')}</li>
          ) : null}
          {links.data?.items.map((link) => {
            const expired = link.expiresAt ? new Date(link.expiresAt).getTime() < Date.now() : false;
            const dead = Boolean(link.revokedAt) || expired;
            return (
              <li
                key={link.id}
                className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${
                  dead ? 'border-line bg-paper-deep/40' : 'border-line bg-surface'
                }`}
              >
                <span className="text-xs text-ink-soft">
                  {link.scope === 'profile' ? t('manage.share.scope.profile') : t('manage.share.scope.event')}
                </span>
                <span className="text-[11px] text-muted">
                  {link.expiresAt ? `· ${link.expiresAt.slice(0, 10)}` : `· ${t('manage.share.never')}`}
                </span>
                {link.revokedAt ? (
                  <span className="rounded bg-paper-deep px-1.5 text-[10px] text-muted">
                    {t('manage.share.revoked')}
                  </span>
                ) : expired ? (
                  <span className="rounded bg-paper-deep px-1.5 text-[10px] text-muted">
                    {t('manage.share.expired')}
                  </span>
                ) : null}
                <code className="ml-auto max-w-[45%] truncate rounded bg-paper-deep px-2 py-1 text-[11px] text-muted">
                  {absolute(link.url)}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(absolute(link.url));
                      toast.success(t('manage.share.copied'));
                    } catch {
                      toast.error('复制失败，请手动选择链接');
                    }
                  }}
                >
                  {t('manage.share.copy')}
                </Button>
                {!dead ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted"
                    loading={revoke.isPending}
                    onClick={() => revoke.mutate(link.id)}
                  >
                    {t('manage.share.revoke')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted hover:text-red-600"
                  onClick={() => setDeleting({ id: link.id, url: absolute(link.url) })}
                >
                  {t('manage.share.delete')}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <ConfirmModal
        open={Boolean(deleting)}
        title={t('manage.share.delete')}
        body={`${deleting?.url ?? ''} — ${t('manage.share.deleteConfirm')}`}
        confirmText={t('manage.share.delete')}
        cancelText={t('common.cancel')}
        loading={purge.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) purge.mutate(deleting.id);
        }}
      />
    </div>
  );
}

/** 类型与标签：档案自己的词表，可增、可改名、可删。 */
function TaxonomyTab({ profileId }: { profileId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const types = useEventTypes(profileId);
  const createType = useCreateEventType(profileId);
  const renameType = useRenameEventType(profileId);
  const deleteType = useDeleteEventType(profileId);
  const tagList = useTagList(profileId, true);
  const createTag = useCreateTag(profileId);
  const renameTag = useRenameTag(profileId);
  const deleteTag = useDeleteTag(profileId);

  const [typeDraft, setTypeDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [renamingType, setRenamingType] = useState<{ item: EventTypeDTO; value: string } | null>(null);
  const [renamingTag, setRenamingTag] = useState<{ item: TagDTO; value: string } | null>(null);
  const [removingType, setRemovingType] = useState<EventTypeDTO | null>(null);
  const [removingTag, setRemovingTag] = useState<TagDTO | null>(null);

  const allTypes = types.data?.items ?? [];
  const builtinTypes = allTypes.filter((item) => !item.custom);
  const customTypes = allTypes.filter((item) => item.custom);
  const tags = tagList.data?.items ?? [];

  const addType = async () => {
    const label = typeDraft.trim();
    if (!label) return;
    try {
      await createType.mutateAsync(label);
      setTypeDraft('');
      toast.success(t('manage.types.created'));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const addTag = async () => {
    const name = tagDraft.trim();
    if (!name) return;
    try {
      await createTag.mutateAsync(name);
      setTagDraft('');
      toast.success(t('manage.tags.created'));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">{t('manage.types.title')}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{t('manage.types.hint')}</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {builtinTypes.map((item) => (
            <span key={item.type} className="chip bg-paper-deep text-ink-soft">
              {eventTypeLabel(item.type, t)}
              <span className="text-[10px] text-muted">{item.usingCount}</span>
            </span>
          ))}
        </div>

        <ul className="mt-4 divide-y divide-line border-t border-line">
          {customTypes.length === 0 ? (
            <li className="py-4 text-center text-xs text-muted">{t('manage.types.empty')}</li>
          ) : null}
          {customTypes.map((item) => (
            <li key={item.type} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{item.type}</span>
              <span className="text-[11px] text-muted">{t('manage.types.using', { n: item.usingCount })}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted"
                disabled={!item.id}
                onClick={() => setRenamingType({ item, value: item.type })}
              >
                {t('manage.types.rename')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted hover:text-red-600"
                disabled={!item.id}
                onClick={() => setRemovingType(item)}
              >
                {t('manage.types.delete')}
              </Button>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addType();
          }}
        >
          <input
            className="input h-10 min-w-56 flex-1"
            value={typeDraft}
            maxLength={24}
            placeholder={t('manage.types.addPlaceholder')}
            onChange={(e) => setTypeDraft(e.target.value)}
          />
          <Button type="submit" variant="primary" size="sm" loading={createType.isPending}>
            {t('manage.types.add')}
          </Button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">{t('manage.tags.title')}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{t('manage.tags.hint')}</p>

        <ul className="mt-4 divide-y divide-line">
          {tags.length === 0 ? (
            <li className="py-6 text-center text-xs text-muted">{t('manage.tags.empty')}</li>
          ) : null}
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">#{tag.name}</span>
              <span className="text-[11px] text-muted">{tag.count}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted"
                onClick={() => setRenamingTag({ item: tag, value: tag.name })}
              >
                {t('manage.types.rename')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted hover:text-red-600"
                onClick={() => setRemovingTag(tag)}
              >
                {t('manage.types.delete')}
              </Button>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addTag();
          }}
        >
          <input
            className="input h-10 min-w-56 flex-1"
            value={tagDraft}
            maxLength={24}
            placeholder={t('manage.tags.addPlaceholder')}
            onChange={(e) => setTagDraft(e.target.value)}
          />
          <Button type="submit" variant="primary" size="sm" loading={createTag.isPending}>
            {t('manage.tags.add')}
          </Button>
        </form>
      </section>

      {/* 改名 */}
      <Modal
        open={Boolean(renamingType)}
        onClose={() => setRenamingType(null)}
        title={t('manage.types.renameTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenamingType(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={renameType.isPending}
              onClick={async () => {
                if (!renamingType?.item.id) return;
                try {
                  await renameType.mutateAsync({ id: renamingType.item.id, label: renamingType.value });
                  setRenamingType(null);
                  toast.success(t('manage.types.renamed'));
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('profiles.field.kind')}>
          <input
            className="input"
            value={renamingType?.value ?? ''}
            maxLength={24}
            autoFocus
            onChange={(e) => setRenamingType((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(renamingTag)}
        onClose={() => setRenamingTag(null)}
        title={t('manage.tags.renameTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenamingTag(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={renameTag.isPending}
              onClick={async () => {
                if (!renamingTag) return;
                try {
                  await renameTag.mutateAsync({ tagId: renamingTag.item.id, name: renamingTag.value });
                  setRenamingTag(null);
                  toast.success(t('manage.tags.renamed'));
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('manage.tags.title')}>
          <input
            className="input"
            value={renamingTag?.value ?? ''}
            maxLength={24}
            autoFocus
            onChange={(e) => setRenamingTag((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
          />
        </Field>
      </Modal>

      <ConfirmModal
        open={Boolean(removingType)}
        title={t('manage.types.delete')}
        body={t('manage.types.deleteConfirm', {
          name: removingType?.type ?? '',
          n: removingType?.usingCount ?? 0,
        })}
        confirmText={t('manage.types.delete')}
        cancelText={t('common.cancel')}
        loading={deleteType.isPending}
        onCancel={() => setRemovingType(null)}
        onConfirm={async () => {
          if (!removingType?.id) return;
          try {
            await deleteType.mutateAsync(removingType.id);
            setRemovingType(null);
            toast.success(t('manage.types.deleted'));
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />

      <ConfirmModal
        open={Boolean(removingTag)}
        title={t('manage.types.delete')}
        body={t('manage.tags.deleteConfirm', { name: removingTag?.name ?? '', n: removingTag?.count ?? 0 })}
        confirmText={t('manage.types.delete')}
        cancelText={t('common.cancel')}
        loading={deleteTag.isPending}
        onCancel={() => setRemovingTag(null)}
        onConfirm={async () => {
          if (!removingTag) return;
          try {
            await deleteTag.mutateAsync(removingTag.id);
            setRemovingTag(null);
            toast.success(t('manage.tags.deleted'));
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}

interface ExportJob {
  id: string;
  status: 'processing' | 'ready' | 'failed';
  url: string | null;
}

function ArchiveCard({ profileId, name }: { profileId: string; name: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [jobId, setJobId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/api/v1/profiles/${profileId}/export`),
    onSuccess: (data) => {
      setJobId(data.id);
      toast.success(t('manage.archive.started'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const job = useQuery({
    queryKey: ['export', jobId],
    queryFn: () => api.get<{ export: ExportJob }>(`/api/v1/exports/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => (query.state.data?.export.status === 'processing' ? 1500 : false),
  });

  const status = job.data?.export.status ?? null;
  const processing = start.isPending || status === 'processing';
  const downloadUrl = status === 'ready' ? (job.data?.export.url ?? null) : null;

  return (
    <section className="card p-5">
      <h2 className="font-serif text-base text-ink">{t('manage.archive.title')}</h2>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
        {t('manage.archive.hint', { name })}
      </p>

      <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted">
        <li>· {t('manage.archive.item1')}</li>
        <li>· {t('manage.archive.item2')}</li>
        <li>· {t('manage.archive.item3')}</li>
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {downloadUrl ? (
          <a href={downloadUrl} className="btn btn-primary btn-sm" download>
            {t('manage.archive.download')}
          </a>
        ) : (
          <Button
            size="sm"
            variant="primary"
            loading={processing}
            disabled={processing}
            onClick={() => start.mutate()}
          >
            {processing ? t('manage.archive.processing') : t('manage.archive.start')}
          </Button>
        )}

        {status === 'ready' ? (
          <button
            type="button"
            className="text-xs text-accent hover:underline disabled:opacity-60"
            disabled={processing}
            onClick={() => start.mutate()}
          >
            {t('manage.archive.again')}
          </button>
        ) : null}

        {status === 'failed' ? (
          <span className="text-xs text-red-600">{t('manage.archive.failed')}</span>
        ) : null}
      </div>
    </section>
  );
}

function TrashTab({ profileId }: { profileId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const trash = useTrash(profileId, true);
  const [purging, setPurging] = useState<{ kind: 'event' | 'media'; id: string } | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.trash(profileId) });
    void qc.invalidateQueries({ queryKey: ['timeline', profileId] });
    void qc.invalidateQueries({ queryKey: ['profile', profileId] });
  };

  const restore = useMutation({
    mutationFn: (item: { kind: 'event' | 'media'; id: string }) =>
      api.post(`/api/v1/${item.kind === 'event' ? 'events' : 'media'}/${item.id}/restore`),
    onSuccess: () => {
      void invalidate();
      toast.success(t('manage.trash.restore'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const purge = useMutation({
    mutationFn: (item: { kind: 'event' | 'media'; id: string }) =>
      api.del(`/api/v1/profiles/${profileId}/trash/${item.kind}/${item.id}`),
    onSuccess: () => {
      void invalidate();
      setPurging(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items = useMemo(() => trash.data?.items ?? [], [trash.data]);

  return (
    <section className="card p-5">
      <h2 className="font-serif text-lg text-ink">{t('manage.trash.title')}</h2>
      <p className="mt-1 text-xs text-muted">{t('manage.trash.hint', { n: 30 })}</p>

      {trash.isLoading ? (
        <SkeletonBlock className="mt-4 h-24" />
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('manage.trash.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 py-3">
              {item.thumbUrl ? (
                <img
                  src={item.thumbUrl}
                  alt=""
                  className="h-11 w-11 rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-paper-deep text-[10px] text-muted">
                  {t('event.new')}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-soft">{item.title}</p>
                <p className="text-[11px] text-muted">
                  {t('manage.trash.expires', { date: item.expiresAt.slice(0, 10) })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                loading={restore.isPending}
                onClick={() => restore.mutate({ kind: item.kind, id: item.id })}
              >
                {t('manage.trash.restore')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted"
                onClick={() => setPurging({ kind: item.kind, id: item.id })}
              >
                {t('manage.trash.purge')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={Boolean(purging)}
        title={t('manage.trash.purge')}
        body={t('manage.trash.purgeConfirm')}
        confirmText={t('manage.trash.purge')}
        cancelText={t('common.cancel')}
        loading={purge.isPending}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          if (purging) purge.mutate(purging);
        }}
      />
    </section>
  );
}
