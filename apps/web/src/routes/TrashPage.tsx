import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useDeletedProfiles, usePurgeProfile, useRestoreProfile } from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { useToast } from '../components/toast';
import { Avatar, Button, ConfirmModal, EmptyState, SkeletonBlock } from '../components/ui';

export function TrashPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const deleted = useDeletedProfiles();
  const restore = useRestoreProfile();
  const purge = usePurgeProfile();
  const [purging, setPurging] = useState<{ id: string; name: string } | null>(null);

  const items = deleted.data?.items ?? [];
  const retentionDays = deleted.data?.retentionDays ?? 30;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-ink">{t('trash.title')}</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
          {t('trash.subtitle', { n: retentionDays })}
        </p>
      </div>

      {deleted.isLoading ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t('trash.empty.title')}
          body={t('trash.empty.body')}
          action={
            <Link to="/" className="btn btn-outline">
              {t('nav.profiles')}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const daysLeft = Math.max(
              0,
              Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)),
            );
            return (
              <li key={item.id} className="card flex flex-wrap items-center gap-4 p-4">
                <Avatar name={item.name} kind={item.kind} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-serif text-base text-ink">{item.name}</span>
                    <span className="rounded bg-paper-deep px-1.5 py-0.5 text-[10px] text-muted">
                      {t(`profiles.kind.${item.kind}`)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t('trash.deletedAt', { when: relativeTime(item.deletedAt, lang) })}
                    <span className="mx-1.5 text-line-strong">·</span>
                    <span className={daysLeft <= 3 ? 'text-red-600' : undefined}>
                      {t('trash.daysLeft', { n: daysLeft })}
                    </span>
                    <span className="mx-1.5 text-line-strong">·</span>
                    {t('profiles.meta.events', { n: item.eventCount })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={restore.isPending && restore.variables === item.id}
                    onClick={() =>
                      restore.mutate(item.id, {
                        onSuccess: () => toast.success(t('trash.restored', { name: item.name })),
                        onError: (err) => toast.error(errorMessage(err)),
                      })
                    }
                  >
                    {t('trash.restore')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted"
                    onClick={() => setPurging({ id: item.id, name: item.name })}
                  >
                    {t('trash.purge')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted">
        {t('trash.note')}{' '}
        <Link to="/" className="text-accent hover:underline">
          {t('nav.profiles')}
        </Link>
      </p>

      <ConfirmModal
        open={Boolean(purging)}
        title={t('trash.purge')}
        body={t('trash.purgeConfirm', { name: purging?.name ?? '' })}
        confirmText={t('trash.purge')}
        cancelText={t('common.cancel')}
        loading={purge.isPending}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          if (!purging) return;
          purge.mutate(purging.id, {
            onSuccess: () => {
              setPurging(null);
              toast.success(t('trash.purged'));
            },
            onError: (err) => toast.error(errorMessage(err)),
          });
        }}
      />
    </AppShell>
  );
}
