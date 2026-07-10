import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'taskflow-theme';
const DOM_ATTR = 'data-theme';

interface ThemeState {
  mode: ThemeMode;
  _hasHydrated: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  hydrate: () => void;
}

function applyDom(mode: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(DOM_ATTR, mode);
  }
}

function readStored(): ThemeMode | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'dark' || v === 'light' ? v : null;
}

function systemPref(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'dark',
  _hasHydrated: false,

  setMode: (mode) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, mode);
    applyDom(mode);
    set({ mode });
  },

  toggleMode: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
    applyDom(next);
    set({ mode: next });
  },

  hydrate: () => {
    const initial = readStored() ?? systemPref();
    applyDom(initial);
    set({ mode: initial, _hasHydrated: true });
  },
}));

/**
 * Synchronous bootstrap helper. Call from main.tsx BEFORE React render
 * to avoid FOUC (flash of wrong theme). Safe to call multiple times.
 */
export function bootstrapTheme(): void {
  useThemeStore.getState().hydrate();
}
