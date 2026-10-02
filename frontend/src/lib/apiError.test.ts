import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from './apiError';
import i18n from '@/i18n';

describe('getApiErrorMessage', () => {
  it('falls back when the API message is not a string', () => {
    expect(
      getApiErrorMessage({ response: { data: { message: { detail: 'bad' } } } }, 'Fallback'),
    ).toBe('Fallback');
  });

  it('translates recognized API messages and preserves unknown messages', async () => {
    await i18n.changeLanguage('en');
    expect(
      getApiErrorMessage(
        { response: { data: { message: 'E-posta veya şifre hatalı' } } },
        'Fallback',
      ),
    ).toBe('Email or password is incorrect');
    expect(
      getApiErrorMessage({ response: { data: { message: 'Custom server message' } } }, 'Fallback'),
    ).toBe('Custom server message');
    await i18n.changeLanguage('tr');
  });
});
