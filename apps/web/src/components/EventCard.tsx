import { Link } from 'react-router-dom';
import { eventTypeLabel, type EventDTO } from '@growth/shared';
import { useI18n } from '../i18n';
import { ageText, dateText } from '../lib/format';
import { typeClass } from './EventForm';

export function EventCard({
  event,
  profileId,
  birthDate,
  birthPrecision,
  deathDate,
  onQuickView,
  basePath,
}: {
  event: EventDTO;
  profileId: string;
  birthDate: string | null;
  birthPrecision: 'day' | 'month' | 'year';
  deathDate?: string | null;
  onQuickView?: (index: number) => void;
  /** 公开分享页用 /s/:token 作为前缀 */
  basePath?: string;
}) {
  const { t, lang } = useI18n();
  const href = `${basePath ?? `/p/${profileId}`}/e/${event.id}`;
  const age = ageText(birthDate, birthPrecision, event.date, t, {
    deathDate,
    deceased: Boolean(deathDate),
  });
  const photos = event.media;

  return (
    <article className="group card overflow-hidden transition-shadow hover:shadow-[0_10px_30px_-20px_rgba(33,29,26,0.45)]">
      <div className="px-5 pt-4 pb-4 sm:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <time dateTime={event.date} className="font-medium tracking-wide text-ink-soft">
            {dateText(event.date, event.datePrecision, lang)}
          </time>
          {age ? (
            <>
              <span className="text-line-strong">·</span>
              <span>{age}</span>
            </>
          ) : null}
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${typeClass(event.type)}`}>
            {eventTypeLabel(event.type, t)}
          </span>
        </div>

        <h3 className="font-serif text-[17px] leading-snug text-ink">
          <Link to={href} className="hover:text-accent">
            {event.title}
          </Link>
        </h3>

        {event.body ? (
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-soft/90">
            {event.body.length > 180 ? `${event.body.slice(0, 180)}…` : event.body}
          </p>
        ) : null}

        {event.placeText ? (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
              <path
                d="M8 14s4.5-4.1 4.5-7A4.5 4.5 0 0 0 3.5 7c0 2.9 4.5 7 4.5 7Z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="8" cy="7" r="1.4" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {event.placeText}
          </p>
        ) : null}

        {event.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {event.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-paper-deep px-1.5 py-0.5 text-[11px] text-muted">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {photos.length > 0 ? (
        <div className="px-1.5 pb-1.5">
          {/* 1 张整幅；2 张并排；3 张以上固定三列，第 3 格叠加剩余数量 */}
          <div
            className={`grid gap-1.5 ${
              photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}
          >
            {(photos.length <= 3 ? photos : photos.slice(0, 3)).map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => onQuickView?.(index)}
                className="relative overflow-hidden rounded-xl bg-paper-deep"
                style={
                  photos.length === 1
                    ? { height: 'clamp(200px, 34vw, 360px)' }
                    : { aspectRatio: '1 / 1' }
                }
                aria-label={photo.altText ?? event.title}
              >
                <img
                  src={photo.urls.thumb}
                  alt={photo.altText ?? event.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
                {index === 2 && photos.length > 3 ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/45 font-serif text-lg text-white">
                    +{photos.length - 3}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
