import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  mobileSheetOpen: boolean;
  toggleSidebarCollapsed: () => void;
  openMobileSheet: () => void;
  setMobileSheetOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileSheetOpen: false,

  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  openMobileSheet: () => set({ mobileSheetOpen: true }),
  setMobileSheetOpen: (open) => set({ mobileSheetOpen: open }),
}));
