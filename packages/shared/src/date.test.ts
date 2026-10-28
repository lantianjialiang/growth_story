import { describe, expect, it } from 'vitest';
import {
  calcAge,
  completeDate,
  formatAge,
  formatCalendarDate,
  formatCompact,
  isLeapYear,
  normalizeByPrecision,
  parseCalendarDate,
} from '../src/date';

describe('parseCalendarDate', () => {
  it('接受合法日期', () => {
    expect(parseCalendarDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });
  it('拒绝非法日期', () => {
    expect(parseCalendarDate('2023-02-29')).toBeNull();
    expect(parseCalendarDate('2024-13-01')).toBeNull();
    expect(parseCalendarDate('2024-1-1')).toBeNull();
  });
  it('闰年判定', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
  });
});

describe('normalizeByPrecision', () => {
  it('年精度抹平月日', () => {
    expect(normalizeByPrecision('1990-07-15', 'year')).toBe('1990-01-01');
  });
  it('月精度抹平日', () => {
    expect(normalizeByPrecision('1990-07-15', 'month')).toBe('1990-07-01');
  });
  it('日精度保持不变', () => {
    expect(normalizeByPrecision('1990-07-15', 'day')).toBe('1990-07-15');
  });
});

describe('formatCalendarDate', () => {
  it('中文按精度输出', () => {
    expect(formatCalendarDate('2024-03-05', 'day')).toBe('2024 年 3 月 5 日');
    expect(formatCalendarDate('2024-03-05', 'month')).toBe('2024 年 3 月');
    expect(formatCalendarDate('2024-03-05', 'year')).toBe('2024 年');
  });
  it('英文按精度输出', () => {
    expect(formatCalendarDate('2024-03-05', 'day', { locale: 'en' })).toBe('Mar 5, 2024');
    expect(formatCalendarDate('2024-03-05', 'year', { locale: 'en' })).toBe('2024');
  });
  it('紧凑格式', () => {
    expect(formatCompact('2024-03-05', 'day')).toBe('2024.03.05');
    expect(formatCompact('2024-03-05', 'month')).toBe('2024.03');
    expect(completeDate(2024, 3, 5)).toBe('2024-03-05');
  });
});

describe('calcAge', () => {
  it('整岁计算', () => {
    const age = calcAge('1990-06-15', 'day', '2024-06-14');
    expect(age?.years).toBe(33);
    expect(age?.approximate).toBe(false);
    const after = calcAge('1990-06-15', 'day', '2024-06-15');
    expect(after?.years).toBe(34);
  });

  it('月份与天数借位', () => {
    const age = calcAge('2023-01-31', 'day', '2023-03-01');
    expect(age?.years).toBe(0);
    expect(age?.months).toBe(1);
    expect(age?.days).toBe(1);
  });

  it('出生日为 2 月 29 日：平年 3 月 1 日才算满岁', () => {
    expect(calcAge('2020-02-29', 'day', '2024-02-28')?.years).toBe(3);
    expect(calcAge('2020-02-29', 'day', '2024-02-29')?.years).toBe(4);
    expect(calcAge('2020-02-29', 'day', '2025-02-28')?.years).toBe(4);
    expect(calcAge('2020-02-29', 'day', '2025-03-01')?.years).toBe(5);
  });

  it('精度不完整时标记 approximate', () => {
    expect(calcAge('1990-01-01', 'year', '2024-05-01')?.approximate).toBe(true);
    expect(calcAge('1990-01-01', 'month', '2024-05-01')?.approximate).toBe(true);
    expect(formatAge(calcAge('1990-01-01', 'year', '2024-05-01')!)).toBe('约 34 岁');
  });

  it('早于出生日期返回 negative', () => {
    const age = calcAge('2020-01-01', 'day', '2019-12-31');
    expect(age?.negative).toBe(true);
    expect(formatAge(age!)).toBe('出生前');
  });

  it('不足一岁显示月龄', () => {
    const age = calcAge('2024-01-10', 'day', '2024-04-20');
    expect(age?.years).toBe(0);
    expect(age?.months).toBe(3);
    expect(formatAge(age!)).toBe('3 个月');
  });
});
