import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from './apiError';

describe('getApiErrorMessage', () => {
  it('falls back when the API message is not a string', () => {
    expect(
      getApiErrorMessage({ response: { data: { message: { detail: 'bad' } } } }, 'Fallback'),
    ).toBe('Fallback');
  });
});
