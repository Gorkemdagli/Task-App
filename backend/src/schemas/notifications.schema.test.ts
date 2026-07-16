import { describe, it, expect } from 'vitest';
import { ListNotificationsQuerySchema } from './notifications.schema';

describe('ListNotificationsQuerySchema', () => {
  it('applies defaults for empty query', () => {
    const result = ListNotificationsQuerySchema.parse({});
    expect(result).toEqual({ limit: 20 });
    expect(result.cursor).toBeUndefined();
  });

  it('accepts valid limit within bounds and coerces to number', () => {
    const result = ListNotificationsQuerySchema.parse({ limit: '25' });
    expect(result.limit).toBe(25);
    expect(typeof result.limit).toBe('number');
  });

  it('rejects limit=0', () => {
    expect(ListNotificationsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects limit=51', () => {
    expect(ListNotificationsQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('coerces string "50" to 50', () => {
    const result = ListNotificationsQuerySchema.parse({ limit: '50' });
    expect(result.limit).toBe(50);
  });

  it('accepts a valid cursor string', () => {
    const result = ListNotificationsQuerySchema.parse({
      cursor: 'eyJ0IjoxNzAwMDAwMDAwfQ==',
    });
    expect(result.cursor).toBe('eyJ0IjoxNzAwMDAwMDAwfQ==');
  });

  it('rejects unknown keys (strict mode)', () => {
    expect(ListNotificationsQuerySchema.safeParse({ limit: 20, foo: 'bar' }).success).toBe(false);
  });
});
