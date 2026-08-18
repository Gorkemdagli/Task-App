import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  mobileSheetOpen: boolean;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openMobileSheet: () => void;
  closeMobileSheet: () => void;
  setMobileSheetOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileSheetOpen: false,

  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  openMobileSheet: () => set({ mobileSheetOpen: true }),
  closeMobileSheet: () => set({ mobileSheetOpen: false }),
  setMobileSheetOpen: (open) => set({ mobileSheetOpen: open }),
}));
