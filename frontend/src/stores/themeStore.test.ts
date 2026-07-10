import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore, bootstrapTheme } from './themeStore';

const STORAGE_KEY = 'taskflow-theme';
const DOM_ATTR = 'data-theme';

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(DOM_ATTR);
    useThemeStore.setState({ mode: 'dark', _hasHydrated: false });
  });

  it('starts dark by default and unhydrated', () => {
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(useThemeStore.getState()._hasHydrated).toBe(false);
  });

  it('setMode writes DOM attribute and storage', () => {
    useThemeStore.getState().setMode('light');
    expect(useThemeStore.getState().mode).toBe('light');
    expect(document.documentElement.getAttribute(DOM_ATTR)).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('toggleMode flips', () => {
    useThemeStore.getState().toggleMode();
    expect(useThemeStore.getState().mode).toBe('light');
    useThemeStore.getState().toggleMode();
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('hydrate reads from localStorage when present', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    bootstrapTheme();
    expect(useThemeStore.getState().mode).toBe('light');
    expect(useThemeStore.getState()._hasHydrated).toBe(true);
    expect(document.documentElement.getAttribute(DOM_ATTR)).toBe('light');
  });

  it('hydrate falls back to system prefers-color-scheme when no storage', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    bootstrapTheme();
    expect(useThemeStore.getState()._hasHydrated).toBe(true);
    // system pref matches our mock = dark
    expect(useThemeStore.getState().mode).toBe('dark');
  });
});
