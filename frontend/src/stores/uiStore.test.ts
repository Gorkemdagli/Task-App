import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarCollapsed: false, mobileSheetOpen: false });
  });

  it('starts uncollapsed and closed', () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(useUiStore.getState().mobileSheetOpen).toBe(false);
  });

  it('toggleSidebarCollapsed flips', () => {
    useUiStore.getState().toggleSidebarCollapsed();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    useUiStore.getState().toggleSidebarCollapsed();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  it('mobile sheet open/close', () => {
    useUiStore.getState().openMobileSheet();
    expect(useUiStore.getState().mobileSheetOpen).toBe(true);
    useUiStore.getState().setMobileSheetOpen(false);
    expect(useUiStore.getState().mobileSheetOpen).toBe(false);
  });
});
