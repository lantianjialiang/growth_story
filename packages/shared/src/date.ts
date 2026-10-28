/**
 * 日历日期 + 精度的处理工具。
 *
 * 设计约束（见规格 3.1 / 9.7）：
 * - 日期是"日历日期"，不是时间戳；一律用 'YYYY-MM-DD' 字符串表示，缺失部分补 01。
 * - 任何年龄/格式化计算都基于字符串拆分，绝不做 Date 的时区转换。
 */

export type DatePrecision = 'day' | 'month' | 'year';

export const DATE_PRECISION_VALUES: DatePrecision[] = ['day', 'month', 'year'];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** 解析 'YYYY-MM-DD'，非法则返回 null。 */
export function parseCalendarDate(value: string): DateParts | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isCalendarDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 把用户输入（可能只有年或年月）补全为 'YYYY-MM-DD'。 */
export function completeDate(year: number, month = 1, day = 1): string {
  const mm = String(clamp(month, 1, 12)).padStart(2, '0');
  const dd = String(clamp(day, 1, 31)).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${mm}-${dd}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 规范化：按精度把多余部分置为 01（保证月/年精度不会被 day 干扰）。 */
export function normalizeByPrecision(date: string, precision: DatePrecision): string {
  const parts = parseCalendarDate(date);
  if (!parts) return date;
  if (precision === 'year') return completeDate(parts.year, 1, 1);
  if (precision === 'month') return completeDate(parts.year, parts.month, 1);
  return completeDate(parts.year, parts.month, parts.day);
}

const ZH_MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

export interface FormatOptions {
  locale?: string;
}

/** 按精度格式化：2024 年 3 月 5 日 / 2024 年 3 月 / 2024 年。 */
export function formatCalendarDate(
  date: string,
  precision: DatePrecision = 'day',
  options: FormatOptions = {},
): string {
  const parts = parseCalendarDate(date);
  if (!parts) return date;
  const locale = options.locale ?? 'zh-CN';
  if (locale.startsWith('en')) {
    const monthName = new Date(Date.UTC(2000, parts.month - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    if (precision === 'year') return String(parts.year);
    if (precision === 'month') return `${monthName} ${parts.year}`;
    return `${monthName} ${parts.day}, ${parts.year}`;
  }
  if (precision === 'year') return `${parts.year} 年`;
  if (precision === 'month') return `${parts.year} 年 ${parts.month} 月`;
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日`;
}

/** 紧凑格式，用于卡片角标：2024.03.05 / 2024.03 / 2024。 */
export function formatCompact(date: string, precision: DatePrecision = 'day'): string {
  const parts = parseCalendarDate(date);
  if (!parts) return date;
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  if (precision === 'year') return String(parts.year);
  if (precision === 'month') return `${parts.year}.${mm}`;
  return `${parts.year}.${mm}.${dd}`;
}

export function formatMonthLabel(month: number): string {
  return ZH_MONTHS[month - 1] ?? String(month);
}

export interface AgeResult {
  years: number;
  months: number;
  days: number;
  /** 出生日期只有年/月精度时为 true → UI 显示"约 N 岁" */
  approximate: boolean;
  /** 目标日期早于出生日期 */
  negative: boolean;
}

function compareParts(a: DateParts, b: DateParts): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/** 在"日历日期"上加减月份：日超出当月天数时收敛到月末。 */
function addMonths(parts: DateParts, delta: number): DateParts {
  const total = parts.year * 12 + (parts.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  const dim = daysInMonth(year, month);
  // 2 月 29 日出生：平年没有对应日，按 3 月 1 日作为周年日
  if (parts.month === 2 && parts.day === 29 && month === 2 && dim === 28) {
    return { year, month: 3, day: 1 };
  }
  return { year, month, day: Math.min(parts.day, dim) };
}

/** 两个日历日期之间的整天数（用 UTC 纪元差，不受本地时区影响）。 */
function dayDiff(from: DateParts, to: DateParts): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

/**
 * 计算某一天时的年龄。
 * 做法：把出生日期按月推进，找到不超过目标日期的最大整月数，
 * 余下的天数再单独计算。这样 1 月 31 日 → 3 月 1 日 不会算成负天数。
 * - 精度为 year/month 时标记 approximate。
 * - 2 月 29 日出生：平年以 3 月 1 日作为生日。
 */
export function calcAge(
  birthDate: string,
  birthPrecision: DatePrecision,
  atDate: string,
): AgeResult | null {
  const birth = parseCalendarDate(birthDate);
  const at = parseCalendarDate(atDate);
  if (!birth || !at) return null;

  const approximate = birthPrecision !== 'day';

  if (compareParts(at, birth) < 0) {
    return { years: 0, months: 0, days: 0, approximate, negative: true };
  }

  let totalMonths = (at.year - birth.year) * 12 + (at.month - birth.month);
  let anchor = addMonths(birth, totalMonths);
  if (compareParts(anchor, at) > 0) {
    totalMonths -= 1;
    anchor = addMonths(birth, totalMonths);
  }
  if (totalMonths < 0) totalMonths = 0;

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: Math.max(0, dayDiff(anchor, at)),
    approximate,
    negative: false,
  };
}

const ZH_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function formatAge(age: AgeResult, locale = 'zh-CN'): string {
  const { years, months, approximate, negative } = age;
  if (negative) return locale.startsWith('en') ? 'before birth' : '出生前';
  if (locale.startsWith('en')) {
    const y = `${years} yr`;
    if (years >= 1) return `${approximate ? '~' : ''}${y}`;
    return `${months} mo`;
  }
  if (years >= 1) return `${approximate ? '约 ' : ''}${years} 岁`;
  if (months >= 1) return `${approximate ? '约 ' : ''}${months} 个月`;
  return '刚出生';
}

/** 更细的年龄段描述，用于事件卡片副标题。 */
export function describeAge(
  birthDate: string | null,
  birthPrecision: DatePrecision,
  atDate: string,
  locale = 'zh-CN',
): string | null {
  if (!birthDate) return null;
  const age = calcAge(birthDate, birthPrecision, atDate);
  if (!age) return null;
  return formatAge(age, locale);
}

/** 年份列表：出生年到今年（含），用于"年份快速跳转"的占位。 */
export function yearRange(fromYear: number, toYear: number): number[] {
  const out: number[] = [];
  for (let y = fromYear; y <= toYear; y += 1) out.push(y);
  return out;
}

/** 由 ISO 时间戳取本地日历日期 'YYYY-MM-DD'（用于服务端日志/导出，不用于业务日期计算）。 */
export function isoToCalendarDate(iso: string): string {
  return iso.slice(0, 10);
}

export function zhNumber(n: number): string {
  if (n <= 10) return ZH_NUM[n] ?? String(n);
  return String(n);
}
