import {
  calcAge,
  formatCalendarDate,
  formatCompact,
  type DatePrecision,
} from '@growth/shared';
import type { Translate } from '../i18n';

export function dateText(date: string, precision: DatePrecision, lang: string): string {
  return formatCalendarDate(date, precision, { locale: lang });
}

export function compactDate(date: string, precision: DatePrecision = 'day'): string {
  return formatCompact(date, precision);
}

/**
 * 年龄文案：不显示"0 岁"，不足一岁按月；精度不足时加"约"。
 * 已逝世档案截到逝世日期。
 */
export function ageText(
  birthDate: string | null,
  birthPrecision: DatePrecision,
  atDate: string,
  t: Translate,
  options: { deathDate?: string | null; deceased?: boolean } = {},
): string | null {
  if (!birthDate) return null;
  const target = options.deathDate && atDate > options.deathDate ? options.deathDate : atDate;
  const age = calcAge(birthDate, birthPrecision, target);
  if (!age) return null;
  if (age.negative) return t('age.beforeBirth');
  if (age.years >= 1) {
    return age.approximate ? t('age.aboutYears', { n: age.years }) : t('age.years', { n: age.years });
  }
  if (age.months >= 1) return t('age.months', { n: age.months });
  return t('age.newborn');
}

export function relativeTime(iso: string, lang: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  const zh = lang.startsWith('zh');
  if (minutes < 1) return zh ? '刚刚' : 'just now';
  if (minutes < 60) return zh ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return zh ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return zh ? `${days} 天前` : `${days}d ago`;
  return iso.slice(0, 10);
}

export function todayCalendar(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}
