import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  addCalendarMonths,
  formatCalendarDateDisplay,
  utcTodayCalendarDate,
} from './calendarDate';

describe('calendar date helpers', () => {
  it('keeps calendar arithmetic independent from timezone', () => {
    expect(utcTodayCalendarDate(new Date('2026-08-13T23:59:59Z'))).toBe('2026-08-13');
    expect(addCalendarDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('formats public dates for display', () => {
    expect(formatCalendarDateDisplay('2026-08-13')).toBe('13-08-2026');
    expect(formatCalendarDateDisplay(null)).toBe('—');
  });
});
