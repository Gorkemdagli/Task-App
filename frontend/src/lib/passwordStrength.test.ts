import { describe, it, expect } from 'vitest';
import { getPasswordStrength } from './passwordStrength';

describe('getPasswordStrength', () => {
  it('null for short', () => {
    expect(getPasswordStrength('')).toBeNull();
    expect(getPasswordStrength('1234567')).toBeNull();
  });
  it('weak (no number, 8+)', () => expect(getPasswordStrength('abcdefghi')).toBe('weak'));
  it('medium (8+ with number)', () => expect(getPasswordStrength('abcdefg1')).toBe('medium'));
  it('strong (12+ number+upper)', () =>
    expect(getPasswordStrength('Abcdefghijkl1')).toBe('strong'));
});
