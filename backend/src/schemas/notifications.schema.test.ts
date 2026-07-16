import { describe, it, expect } from 'vitest';
import { listNotificationsQuerySchema } from './notifications.schema';

describe('listNotificationsQuerySchema', () => {
  it('applies defaults for empty query', () => {
    const result = listNotificationsQuerySchema.parse({});
    expect(result).toEqual({ limit: 20 });
    expect(result.cursor).toBeUndefined();
  });

  it('accepts valid limit within bounds and coerces to number', () => {
    const result = listNotificationsQuerySchema.parse({ limit: '25' });
    expect(result.limit).toBe(25);
  });

  it('rejects limit=0', () => {
    expect(listNotificationsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects limit=51', () => {
    expect(listNotificationsQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('coerces string "50" to 50', () => {
    const result = listNotificationsQuerySchema.parse({ limit: '50' });
    expect(result.limit).toBe(50);
  });

  it('accepts a valid cursor string', () => {
    const result = listNotificationsQuerySchema.parse({
      cursor: 'eyJ0IjoxNzAwMDAwMDAwfQ==',
    });
    expect(result.cursor).toBe('eyJ0IjoxNzAwMDAwMDAwfQ==');
  });

  it('rejects empty cursor', () => {
    expect(() => listNotificationsQuerySchema.parse({ cursor: '' })).toThrow();
  });

  it('rejects unknown keys (strict mode)', () => {
    expect(listNotificationsQuerySchema.safeParse({ limit: 20, foo: 'bar' }).success).toBe(false);
  });
});
