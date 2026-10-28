import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminUserDTO, UserRole } from '@growth/shared';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { compactDate } from '../lib/format';
import { qk, useAdminUsers, useSession } from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { useToast } from '../components/toast';
import { Avatar, Button, ConfirmModal, EmptyState, Field, Modal, SkeletonBlock } from '../components/ui';

/**
 * 账号管理（仅管理员）：加人、改昵称与角色、重置密码、停用 / 恢复。
 * 「停用」是软删除：立刻踢掉该账号所有会话，但记录还在，可以恢复。
 */
export function UsersPage() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const session = useSession();
  const me = session.data?.user;
  const list = useAdminUsers();

  const [editing, setEditing] = useState<{ user: AdminUserDTO; displayName: string; role: UserRole } | null>(
    null,
  );
  const [resetting, setResetting] = useState<{ user: AdminUserDTO; password: string } | null>(null);
  const [disabling, setDisabling] = useState<AdminUserDTO | null>(null);
  const [purging, setPurging] = useState<AdminUserDTO | null>(null);
  const [draft, setDraft] = useState({ displayName: '', email: '', password: '', role: 'user' as UserRole });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.adminUsers });

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/admin/users', {
        displayName: draft.displayName.trim(),
        email: draft.email.trim(),
        password: draft.password,
        role: draft.role,
      }),
    onSuccess: () => {
      setDraft({ displayName: '', email: '', password: '', role: 'user' });
      void invalidate();
      toast.success(t('users.created'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/admin/users/${editing?.user.id}`, {
        displayName: editing?.displayName.trim(),
        role: editing?.role,
      }),
    onSuccess: () => {
      setEditing(null);
      void invalidate();
      toast.success(t('users.saved'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reset = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/admin/users/${resetting?.user.id}`, { password: resetting?.password }),
    onSuccess: () => {
      setResetting(null);
      toast.success(t('users.passwordChanged'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const disable = useMutation({
    mutationFn: (userId: string) => api.del(`/api/v1/admin/users/${userId}`),
    onSuccess: () => {
      setDisabling(null);
      void invalidate();
      toast.success(t('users.disabled'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const purge = useMutation({
    mutationFn: (userId: string) => api.del(`/api/v1/admin/users/${userId}?purge=true`),
    onSuccess: () => {
      setPurging(null);
      void invalidate();
      toast.success(t('users.purged'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const restore = useMutation({
    mutationFn: (userId: string) => api.post(`/api/v1/admin/users/${userId}/restore`),
    onSuccess: () => {
      void invalidate();
      toast.success(t('users.restored'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const users = useMemo(() => list.data?.items ?? [], [list.data]);
  const canSubmit = Boolean(draft.displayName.trim() && draft.email.trim() && draft.password.length >= 8);

  if (session.isLoading) {
    return (
      <AppShell>
        <SkeletonBlock className="h-40" />
      </AppShell>
    );
  }

  if (me && me.role !== 'admin') {
    return (
      <AppShell>
        <EmptyState title={t('users.onlyAdmin')} body={t('users.onlyAdminBody')} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="font-serif text-2xl text-ink">{t('users.title')}</h1>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">{t('users.hint')}</p>
      </div>

      <section className="card p-5">
        {list.isLoading ? (
          <SkeletonBlock className="h-32" />
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t('users.empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {users.map((user) => (
              <li
                key={user.id}
                className={`flex flex-wrap items-center gap-3 py-3.5 ${user.disabled ? 'opacity-60' : ''}`}
              >
                <Avatar name={user.displayName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                    <span className="truncate">{user.displayName}</span>
                    {user.role === 'admin' ? (
                      <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
                        {t('users.role.admin')}
                      </span>
                    ) : null}
                    {user.isSelf ? (
                      <span className="rounded-full bg-paper-deep px-1.5 py-0.5 text-[10px] text-muted">
                        {t('users.badge.self')}
                      </span>
                    ) : null}
                    {user.disabled ? (
                      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">
                        {t('users.badge.disabled')}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                    <span>{t('users.meta.created', { date: compactDate(user.createdAt.slice(0, 10), 'day') })}</span>
                    <span>
                      {user.lastLoginAt
                        ? t('users.meta.lastLogin', { date: compactDate(user.lastLoginAt.slice(0, 10), 'day') })
                        : t('users.meta.never')}
                    </span>
                    <span>{t('users.meta.profiles', { n: user.profileCount })}</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {user.disabled ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={restore.isPending}
                        onClick={() => restore.mutate(user.id)}
                      >
                        {t('users.action.restore')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted hover:text-red-600"
                        onClick={() => setPurging(user)}
                      >
                        {t('users.action.purge')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted"
                        onClick={() => setEditing({ user, displayName: user.displayName, role: user.role })}
                      >
                        {t('users.action.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted"
                        onClick={() => setResetting({ user, password: '' })}
                      >
                        {t('users.action.password')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted hover:text-red-600"
                        disabled={user.isSelf}
                        onClick={() => setDisabling(user)}
                      >
                        {t('users.action.disable')}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-serif text-lg text-ink">{t('users.add.title')}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{t('users.add.hint')}</p>

        <form
          className="mt-4 grid gap-x-3 gap-y-1 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            create.mutate();
          }}
        >
          <Field label={t('profiles.field.name')} htmlFor="new-user-name">
            <input
              id="new-user-name"
              className="input"
              maxLength={60}
              value={draft.displayName}
              onChange={(e) => setDraft((prev) => ({ ...prev, displayName: e.target.value }))}
            />
          </Field>
          <Field label={t('auth.email')} htmlFor="new-user-email">
            <input
              id="new-user-email"
              type="email"
              className="input"
              value={draft.email}
              onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
            />
          </Field>
          <Field label={t('auth.password')} hint={t('settings.password.hint')} htmlFor="new-user-password">
            <input
              id="new-user-password"
              type="text"
              autoComplete="new-password"
              className="input"
              value={draft.password}
              onChange={(e) => setDraft((prev) => ({ ...prev, password: e.target.value }))}
            />
          </Field>
          <Field label={t('users.add.role')} htmlFor="new-user-role">
            <select
              id="new-user-role"
              className="select"
              value={draft.role}
              onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value as UserRole }))}
            >
              <option value="user">{t('users.role.user')}</option>
              <option value="admin">{t('users.role.admin')}</option>
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!canSubmit}>
              {t('users.add.submit')}
            </Button>
          </div>
        </form>
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">{t('users.footer')}</p>

      {/* 改昵称 / 角色 */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t('users.edit.title')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <p className="-mt-1 mb-4 text-xs text-muted">{editing?.user.email}</p>
        <Field label={t('profiles.field.name')}>
          <input
            className="input"
            maxLength={60}
            value={editing?.displayName ?? ''}
            onChange={(e) =>
              setEditing((prev) => (prev ? { ...prev, displayName: e.target.value } : prev))
            }
          />
        </Field>
        <Field label={t('users.add.role')} hint={t('users.hint')}>
          <select
            className="select"
            value={editing?.role ?? 'user'}
            onChange={(e) =>
              setEditing((prev) => (prev ? { ...prev, role: e.target.value as UserRole } : prev))
            }
          >
            <option value="user">{t('users.role.user')}</option>
            <option value="admin">{t('users.role.admin')}</option>
          </select>
        </Field>
      </Modal>

      {/* 重置密码 */}
      <Modal
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title={t('users.reset.title')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={reset.isPending}
              disabled={(resetting?.password.length ?? 0) < 8}
              onClick={() => reset.mutate()}
            >
              {t('users.reset.submit')}
            </Button>
          </>
        }
      >
        <p className="-mt-1 mb-4 text-xs leading-relaxed text-muted">
          {resetting?.user.displayName} · {resetting?.user.email}
          <br />
          {t('users.reset.hint')}
        </p>
        <Field label={t('settings.password.new')}>
          <input
            type="text"
            autoComplete="new-password"
            className="input"
            value={resetting?.password ?? ''}
            onChange={(e) =>
              setResetting((prev) => (prev ? { ...prev, password: e.target.value } : prev))
            }
          />
        </Field>
      </Modal>

      <ConfirmModal
        open={Boolean(purging)}
        title={t('users.purge.title')}
        body={t('users.purge.confirm', { name: purging?.displayName ?? '', email: purging?.email ?? '' })}
        confirmText={t('users.action.purge')}
        cancelText={t('common.cancel')}
        loading={purge.isPending}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          if (purging) purge.mutate(purging.id);
        }}
      />

      <ConfirmModal
        open={Boolean(disabling)}
        title={t('users.disable.title')}
        body={t('users.disable.confirm', { name: disabling?.displayName ?? '' })}
        confirmText={t('users.action.disable')}
        cancelText={t('common.cancel')}
        loading={disable.isPending}
        onCancel={() => setDisabling(null)}
        onConfirm={() => {
          if (disabling) disable.mutate(disabling.id);
        }}
      />
    </AppShell>
  );
}
