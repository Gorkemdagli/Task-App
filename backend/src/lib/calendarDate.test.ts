import { describe, expect, it } from 'vitest';
import { formatCalendarDate, parseCalendarDate, startOfUtcToday } from './calendarDate';

describe('calendar date helpers', () => {
  it('round-trips leap-day calendar dates', () => {
    expect(formatCalendarDate(parseCalendarDate('2028-02-29'))).toBe('2028-02-29');
  });

  it('rejects impossible, locale, and datetime values', () => {
    expect(() => parseCalendarDate('2026-02-30')).toThrow(RangeError);
    expect(() => parseCalendarDate('13-08-2026')).toThrow(RangeError);
    expect(() => parseCalendarDate('2026-08-13T00:00:00.000Z')).toThrow(RangeError);
  });

  it('returns UTC calendar-day start', () => {
    expect(startOfUtcToday(new Date('2026-08-13T23:59:59.999Z')).toISOString()).toBe(
      '2026-08-13T00:00:00.000Z',
    );
  });
});
