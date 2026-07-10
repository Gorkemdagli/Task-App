import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Topbar } from './Topbar';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUiStore } from '@/stores/uiStore';

const member: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'member',
  tenantId: 't1',
};

const admin: AuthUser = { ...member, role: 'companyAdmin' };

function renderTopbar(initialUser: AuthUser | null) {
  if (initialUser) {
    useAuthStore.setState({ accessToken: 't', user: initialUser });
  } else {
    useAuthStore.setState({ accessToken: null, user: null });
  }
  return render(
    <MemoryRouter>
      <Topbar />
    </MemoryRouter>,
  );
}

describe('Topbar', () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: 'dark', _hasHydrated: true });
    useUiStore.setState({ mobileSheetOpen: false });
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders logo and primary nav links', () => {
    renderTopbar(member);
    expect(screen.getByRole('link', { name: 'TaskFlow' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Ana Pano' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Takımlar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Görevler' })).toBeInTheDocument();
  });

  it('hides /permissions link for member role', () => {
    renderTopbar(member);
    expect(screen.queryByRole('link', { name: 'Yetkiler' })).not.toBeInTheDocument();
  });

  it('shows /permissions link for companyAdmin role', () => {
    renderTopbar(admin);
    expect(screen.getByRole('link', { name: 'Yetkiler' })).toBeInTheDocument();
  });

  it('shows avatar with initials from full name', () => {
    renderTopbar(member);
    // Full name "Ada Yılmaz" → initials "AY"
    expect(screen.getByText('AY')).toBeInTheDocument();
  });

  it('renders a bell button (placeholder) and theme toggle', () => {
    renderTopbar(member);
    expect(screen.getByRole('button', { name: /Bildirimler/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Karanlık temaya geç|Aydınlık temaya geç/ }),
    ).toBeInTheDocument();
  });

  it('theme toggle flips store + DOM attribute', async () => {
    const user = userEvent.setup();
    useThemeStore.setState({ mode: 'dark', _hasHydrated: true });
    renderTopbar(member);
    const btn = screen.getByRole('button', { name: /Aydınlık temaya geç|Karanlık temaya geç/ });
    await user.click(btn);
    expect(useThemeStore.getState().mode).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('hamburger button opens the mobile sheet store', async () => {
    const user = userEvent.setup();
    renderTopbar(member);
    const menu = screen.getByRole('button', { name: 'Menüyü aç' });
    await user.click(menu);
    expect(useUiStore.getState().mobileSheetOpen).toBe(true);
  });
});
