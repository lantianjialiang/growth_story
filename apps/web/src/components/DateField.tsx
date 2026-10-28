import { daysInMonth, parseCalendarDate, type DatePrecision } from '@growth/shared';
import { useI18n } from '../i18n';

const PRECISIONS: DatePrecision[] = ['day', 'month', 'year'];

export function DateField({
  label,
  date,
  precision,
  onChange,
  allowClear = false,
  minYear = 1900,
  compact = false,
  hideLabel = false,
  className = '',
}: {
  label: string;
  date: string | null;
  precision: DatePrecision;
  onChange: (date: string | null, precision: DatePrecision) => void;
  allowClear?: boolean;
  minYear?: number;
  /** 紧凑模式：没有外边距、日期精度按钮与下拉同一行，用于列表里的行内日期 */
  compact?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const parts = date ? parseCalendarDate(date) : null;
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear + 1; y >= minYear; y -= 1) years.push(y);

  const emit = (next: { year?: number; month?: number; day?: number; precision?: DatePrecision }) => {
    const p = next.precision ?? precision;
    const y = next.year ?? parts?.year ?? currentYear;
    const m = p === 'year' ? 1 : (next.month ?? parts?.month ?? 1);
    const maxDay = daysInMonth(y, m);
    const d = p !== 'day' ? 1 : Math.min(next.day ?? parts?.day ?? 1, maxDay);
    onChange(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, p);
  };

  const selectClass = compact ? 'select select-sm w-auto' : 'select w-auto min-w-[104px]';

  return (
    <div className={`${compact ? '' : 'mb-4'} ${className}`}>
      {!hideLabel ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="label mb-0">{label}</span>
          {allowClear && date ? (
            <button
              type="button"
              className="text-xs text-muted underline-offset-2 hover:text-accent hover:underline"
              onClick={() => onChange(null, precision)}
            >
              {t('common.none')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
        <select
          className={`${selectClass} ${compact ? 'min-w-[86px]' : ''}`}
          value={parts?.year ?? ''}
          aria-label={`${label} — ${lang.startsWith('zh') ? '年' : 'year'}`}
          onChange={(e) => emit({ year: Number(e.target.value) })}
        >
          <option value="" disabled>
            —
          </option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          className={`${selectClass} ${compact ? 'min-w-[64px]' : 'min-w-[84px]'}`}
          value={precision === 'year' ? 1 : (parts?.month ?? 1)}
          disabled={precision === 'year'}
          aria-label={`${label} — ${lang.startsWith('zh') ? '月' : 'month'}`}
          onChange={(e) => emit({ month: Number(e.target.value) })}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {lang.startsWith('zh') ? `${m} 月` : new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'short' })}
            </option>
          ))}
        </select>

        <select
          className={`${selectClass} ${compact ? 'min-w-[56px]' : 'min-w-[84px]'}`}
          value={precision === 'day' ? (parts?.day ?? 1) : 1}
          disabled={precision !== 'day'}
          aria-label={`${label} — ${lang.startsWith('zh') ? '日' : 'day'}`}
          onChange={(e) => emit({ day: Number(e.target.value) })}
        >
          {Array.from(
            { length: daysInMonth(parts?.year ?? currentYear, parts?.month ?? 1) },
            (_, i) => i + 1,
          ).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* 紧凑模式把精度按钮放到同一行，避免一行只有下拉、下面又挂一排按钮 */}
        {compact ? (
          <span className="ml-0.5 flex flex-wrap items-center gap-1">
            {PRECISIONS.map((p) => (
              <button
                key={p}
                type="button"
                className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                  precision === p
                    ? 'border-accent bg-accent text-white'
                    : 'border-line text-muted hover:border-line-strong'
                }`}
                onClick={() => emit({ precision: p })}
              >
                {t(`event.precision.${p}`)}
              </button>
            ))}
          </span>
        ) : null}
      </div>

      {!compact ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRECISIONS.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip ${precision === p ? 'chip-active' : 'bg-surface hover:border-line-strong'}`}
              onClick={() => emit({ precision: p })}
            >
              {t(`event.precision.${p}`)}
            </button>
          ))}
        </div>
      ) : null}

      {date === null && !allowClear ? (
        <p className={`${compact ? 'mt-1' : 'mt-2'} text-xs text-muted`}>
          {lang.startsWith('zh') ? '先选择年份' : 'Pick a year to start'}
        </p>
      ) : null}
    </div>
  );
}
