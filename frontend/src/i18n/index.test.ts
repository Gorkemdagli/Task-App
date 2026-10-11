import { describe, expect, it } from 'vitest';
import i18n from './index';

describe('i18n startup resources', () => {
  it('loads the other locale only when the language changes', async () => {
    expect(i18n.language).toBe('tr');
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false);

    await i18n.changeLanguage('en');
    expect(i18n.t('Ana Pano')).toBe('Dashboard');
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);

    await i18n.changeLanguage('tr');
    expect(i18n.t('Ana Pano')).toBe('Ana Pano');
  });
});
