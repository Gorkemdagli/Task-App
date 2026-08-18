import { create } from 'zustand';

/**
 * Aktif takım seçimi — UI state (sunucu verisi değil).
 * Sidebar'da seçilen takım `activeTeamId` olarak saklanır, `localStorage`'da
 * sayfa yenilemelerinde hayatta kalır. Server verisi (teams listesi) React
 * Query'de — server-side logic burada YOK (CLAUDE.md §7.1).
 */
interface TeamState {
  activeTeamId: string | null;
  _hasHydrated: boolean;
  setActiveTeamId: (id: string | null) => void;
  clearActiveTeam: () => void;
  hydrate: () => void;
}

const STORAGE_KEY = 'taskflow-active-team';

function readStored(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export const useTeamStore = create<TeamState>((set) => ({
  activeTeamId: null,
  _hasHydrated: false,

  setActiveTeamId: (id) => {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
    set({ activeTeamId: id });
  },

  clearActiveTeam: () => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    set({ activeTeamId: null });
  },

  hydrate: () => {
    const v = readStored();
    set({ activeTeamId: v, _hasHydrated: true });
  },
}));

/**
 * Synchronous bootstrap helper. Call from main.tsx BEFORE React render
 * so active team selection survives reload without flicker.
 */
export function bootstrapTeamStore(): void {
  useTeamStore.getState().hydrate();
}
