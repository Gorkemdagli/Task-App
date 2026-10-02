import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from './schemas';
import i18n from '@/i18n';

describe('registerSchema', () => {
  it('accepts', () => {
    expect(
      registerSchema.safeParse({
        fullName: 'Ali',
        email: 'ali@x.com',
        password: 'hunter22',
      }).success,
    ).toBe(true);
  });

  it('rejects weak', () => {
    expect(
      registerSchema.safeParse({
        fullName: 'Ali',
        email: 'ali@x.com',
        password: 'short',
      }).success,
    ).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts', () => {
    expect(
      loginSchema.safeParse({
        email: 'ali@x.com',
        password: 'hunter22',
      }).success,
    ).toBe(true);
  });

  it('uses the selected locale for validation messages', async () => {
    await i18n.changeLanguage('en');
    const result = loginSchema.safeParse({ email: 'invalid', password: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        'Enter a valid email address',
        'Password is required',
      ]);
    }

    await i18n.changeLanguage('tr');
  });
});
