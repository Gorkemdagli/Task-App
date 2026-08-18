function parseCalendarParts(value: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('Invalid calendar date');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function formatParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function utcTodayCalendarDate(now = new Date()): string {
  return formatParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

export function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = parseCalendarParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addCalendarMonths(value: string, months: number): string {
  const [year, month, day] = parseCalendarParts(value);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return formatParts(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(day, lastDay));
}

export function formatCalendarDateDisplay(value: string | null): string {
  if (value === null) return '—';
  const [year, month, day] = parseCalendarParts(value);
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
}
