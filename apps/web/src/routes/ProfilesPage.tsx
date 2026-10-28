import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDeletedProfiles, useProfiles } from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { ProfileForm } from '../components/ProfileForm';
import { ProfileCard } from '../components/ProfileCard';
import { Button, EmptyState, SkeletonBlock } from '../components/ui';

export function ProfilesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const profiles = useProfiles();
  const deleted = useDeletedProfiles();
  const [creating, setCreating] = useState(false);
  const deletedCount = deleted.data?.items.length ?? 0;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink">{t('profiles.title')}</h1>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-muted">{t('profiles.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {deletedCount > 0 ? (
            <Link to="/trash" className="btn btn-outline">
              {t('nav.trash')}
              <span className="ml-1 rounded-full bg-paper-deep px-1.5 py-0.5 text-[11px] text-muted">
                {deletedCount}
              </span>
            </Link>
          ) : null}
          <Button variant="primary" onClick={() => setCreating(true)}>
            <span className="text-base leading-none">＋</span>
            {t('profiles.create')}
          </Button>
        </div>
      </div>

      {profiles.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonBlock className="h-40" />
          <SkeletonBlock className="h-40" />
        </div>
      ) : profiles.data && profiles.data.items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {profiles.data.items.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm text-muted transition-colors hover:border-accent/60 hover:text-accent"
          >
            <span className="text-xl leading-none">＋</span>
            {t('profiles.create')}
          </button>
        </div>
      ) : (
        <EmptyState
          title={t('profiles.empty.title')}
          body={t('profiles.empty.body')}
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('profiles.empty.action')}
            </Button>
          }
        />
      )}

      <ProfileForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(profile) => navigate(`/p/${profile.id}`)}
      />
    </AppShell>
  );
}
