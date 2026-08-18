import { useThemeStore, type ThemeMode } from '../stores/themeStore';

export function useTheme() {
  const mode = useThemeStore((s) => s.mode);
  const hasHydrated = useThemeStore((s) => s._hasHydrated);
  const toggleMode = useThemeStore((s) => s.toggleMode);
  const setMode = useThemeStore((s) => s.setMode);

  return { mode, hasHydrated, toggleMode, setMode } as {
    mode: ThemeMode;
    hasHydrated: boolean;
    toggleMode: () => void;
    setMode: (m: ThemeMode) => void;
  };
}
