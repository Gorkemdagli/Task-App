const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCalendarDate(value: string): Date {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Invalid calendar date');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (formatCalendarDate(date) !== value) throw new RangeError('Invalid calendar date');
  return date;
}

export function formatCalendarDate(value: Date | null): string | null {
  if (value === null) return null;
  return [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()]
    .map((part, index) =>
      index === 0 ? String(part).padStart(4, '0') : String(part).padStart(2, '0'),
    )
    .join('-');
}

export function startOfUtcToday(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
