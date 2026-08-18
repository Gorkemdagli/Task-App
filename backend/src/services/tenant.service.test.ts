import { describe, it, expect } from 'vitest';
import { companyNameKey, slugify } from './tenant.service';

describe('slugify', () => {
  it('kebab-cases', () => expect(slugify('Acme Corp')).toBe('acme-corp'));
  it('strips special chars', () => expect(slugify('Hello, World!')).toBe('hello-world'));
  it('collapses hyphens', () => expect(slugify('Foo --- Bar')).toBe('foo-bar'));
  it('trims edges', () => expect(slugify('  Acme  ')).toBe('acme'));
  it('handles Turkish chars', () => expect(slugify('İstanbul Ltd.')).toBe('istanbul-ltd'));
});

describe('companyNameKey', () => {
  it('normalizes case, spacing, and Turkish characters', () => {
    expect(companyNameKey('\u0130STANBUL   \u015eirket')).toBe('istanbul-sirket');
  });
});
