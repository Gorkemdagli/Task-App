import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function loadI18n() {
  return import('./index');
}

describe('i18n startup resources', () => {
  it('loads the other locale only when the language changes', async () => {
    const { default: i18n, i18nReady } = await loadI18n();
    await i18nReady;

    expect(i18n.language).toBe('tr');
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false);
    expect(i18n.t('landing.cta.dashboard')).toBe('Panoya git');

    await i18n.changeLanguage('en');
    expect(i18n.t('Ana Pano')).toBe('Dashboard');
    expect(i18n.t('landing.cta.dashboard')).toBe('Go to dashboard');
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);

    await i18n.changeLanguage('tr');
    expect(i18n.t('Ana Pano')).toBe('Ana Pano');
  });

  it('waits for saved English landing resources before initialization resolves', async () => {
    localStorage.setItem('taskflow-language', 'en');
    const { default: i18n, i18nReady } = await loadI18n();

    expect(i18nReady).toBeInstanceOf(Promise);
    await i18nReady;

    expect(i18n.language).toBe('en');
    expect(i18n.t('Ana Pano')).toBe('Dashboard');
    expect(i18n.t('landing.cta.dashboard')).toBe('Go to dashboard');
  });

  it('falls back to Turkish for an unsupported saved locale', async () => {
    localStorage.setItem('taskflow-language', 'fr');
    const { default: i18n, i18nReady } = await loadI18n();
    await i18nReady;

    expect(i18n.language).toBe('tr');
    expect(i18n.t('Ana Pano')).toBe('Ana Pano');
  });

  it('keeps the latest locale when language changes overlap', async () => {
    const { default: i18n, i18nReady } = await loadI18n();
    await i18nReady;

    const englishChange = i18n.changeLanguage('en');
    const turkishChange = i18n.changeLanguage('tr');
    await Promise.all([englishChange, turkishChange]);

    expect(i18n.language).toBe('tr');
    expect(i18n.t('landing.cta.dashboard')).toBe('Panoya git');
  });
});
