import { Link } from 'react-router-dom';
import type { ProfileDTO } from '@growth/shared';
import { useI18n } from '../i18n';
import { ageText, compactDate, relativeTime, todayCalendar } from '../lib/format';
import { Avatar } from './ui';

export function ProfileCard({ profile }: { profile: ProfileDTO }) {
  const { t, lang } = useI18n();
  const today = todayCalendar();
  const age = profile.birthDate
    ? ageText(profile.birthDate, profile.birthPrecision, today, t, {
        deathDate: profile.deathDate,
        deceased: Boolean(profile.deathDate),
      })
    : null;

  return (
    <Link
      to={`/p/${profile.id}`}
      className="group card relative flex flex-col justify-between overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-30px_rgba(33,29,26,0.5)]"
    >
      <div className="flex items-start gap-3.5">
        <Avatar src={profile.avatarUrl} name={profile.name} kind={profile.kind} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-serif text-lg text-ink group-hover:text-accent">
              {profile.name}
            </h3>
            {profile.archivedAt ? (
              <span className="shrink-0 rounded bg-paper-deep px-1.5 py-0.5 text-[10px] text-muted">
                {t('profiles.archived')}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span>{t(`profiles.kind.${profile.kind}`)}</span>
            {age ? (
              <>
                <span className="text-line-strong">·</span>
                <span>{age}</span>
              </>
            ) : null}
            {profile.birthDate ? (
              <>
                <span className="text-line-strong">·</span>
                <span>{compactDate(profile.birthDate, profile.birthPrecision)}</span>
              </>
            ) : null}
          </p>
          {profile.role !== 'owner' ? (
            <span className="mt-1 inline-block rounded bg-olive-soft px-1.5 py-0.5 text-[10px] text-olive">
              {t(`manage.role.${profile.role}`)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-muted">
          {profile.eventCount > 0 ? (
            <>
              <span>{t('profiles.meta.events', { n: profile.eventCount })}</span>
              {profile.mediaCount > 0 ? <span>{t('profiles.meta.media', { n: profile.mediaCount })}</span> : null}
            </>
          ) : (
            <span>{t('profiles.meta.empty')}</span>
          )}
        </div>
        <div className="text-right text-[11px] text-muted/80">
          {profile.lastEventDate
            ? t('profiles.meta.last', { date: compactDate(profile.lastEventDate, 'day') })
            : relativeTime(profile.updatedAt, lang)}
        </div>
      </div>

      {profile.note ? (
        <p className="mt-3 line-clamp-2 border-t border-line/70 pt-3 text-xs leading-relaxed text-ink-soft/80">
          {profile.note}
        </p>
      ) : null}
    </Link>
  );
}
