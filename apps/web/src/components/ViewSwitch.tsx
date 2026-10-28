import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

/** 时间轴 / 画廊 视图切换。保留当前筛选参数。 */
export function ViewSwitch({
  profileId,
  current,
  search = '',
}: {
  profileId: string;
  current: 'timeline' | 'gallery';
  search?: string;
}) {
  const { t } = useI18n();
  const suffix = search && !search.startsWith('?') ? `?${search}` : search;

  const item = (target: 'timeline' | 'gallery', label: string, icon: ReactNode) => {
    const active = current === target;
    const to =
      target === 'timeline' ? `/p/${profileId}${suffix}` : `/p/${profileId}/gallery${suffix}`;
    return (
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors ${
          active ? 'bg-paper-deep text-ink' : 'text-muted hover:text-ink'
        }`}
      >
        {icon}
        {label}
      </Link>
    );
  };

  return (
    <div className="inline-flex items-center rounded-full border border-line bg-surface p-0.5 text-xs">
      {item(
        'timeline',
        t('gallery.view.timeline'),
        <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" aria-hidden="true">
          <path d="M4 2v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="4" cy="4" r="1.4" fill="currentColor" />
          <circle cx="4" cy="10" r="1.4" fill="currentColor" />
          <path d="M7 4h4M7 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>,
      )}
      {item(
        'gallery',
        t('gallery.view.gallery'),
        <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" aria-hidden="true">
          <rect x="1.5" y="2.5" width="7" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10.5 4v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>,
      )}
    </div>
  );
}
