import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from './schemas';

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
});
