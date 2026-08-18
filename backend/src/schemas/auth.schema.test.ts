import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from './auth.schema';

describe('registerSchema', () => {
  it('accepts without company', () => {
    expect(
      registerSchema.safeParse({ fullName: 'Ali', email: 'a@x.com', password: 'hunter22' }).success,
    ).toBe(true);
  });
  it('accepts with company', () => {
    expect(
      registerSchema.safeParse({
        fullName: 'Ali',
        email: 'a@x.com',
        password: 'hunter22',
        companyName: 'Acme',
      }).success,
    ).toBe(true);
  });
  it('rejects short password', () => {
    expect(
      registerSchema.safeParse({ fullName: 'Ali', email: 'a@x.com', password: 'short' }).success,
    ).toBe(false);
  });
  it('rejects invalid email', () => {
    expect(
      registerSchema.safeParse({ fullName: 'Ali', email: 'bad', password: 'hunter22' }).success,
    ).toBe(false);
  });
  it('rejects password > 72', () => {
    expect(
      registerSchema.safeParse({ fullName: 'Ali', email: 'a@x.com', password: 'x'.repeat(80) })
        .success,
    ).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid', () => {
    expect(loginSchema.safeParse({ email: 'a@x.com', password: 'hunter22' }).success).toBe(true);
  });
  it('rejects empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@x.com', password: '' }).success).toBe(false);
  });
});
