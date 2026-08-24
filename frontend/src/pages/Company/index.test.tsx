import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { CompanyManagementPage } from './index';

vi.mock('@/pages/Company/CompanyDashboard', () => ({
  CompanyDashboard: () => <div data-testid="company-dashboard">Dashboard body</div>,
}));

vi.mock('@/pages/CompanySettings', () => ({
  CompanySettingsContentPage: () => <div data-testid="company-settings-content">Settings body</div>,
}));

const member = {
  id: 'member',
  displayId: 'MEMBER',
  email: 'member@example.com',
  fullName: 'Member',
  role: 'member' as const,
  tenantId: 'tenant-a',
};
const admin = { ...member, id: 'admin', role: 'companyAdmin' as const };

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage(user: AuthUser = admin, initialEntry = '/company') {
  useAuthStore.setState({ accessToken: 'token', user });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/company" element={<CompanyManagementPage />} />
          <Route path="/dashboard" element={<div>Dashboard redirect</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CompanyManagementPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null });
  });

  it('opens dashboard tab and keeps settings tab local to /company', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('tab', { name: 'Şirket Dashboardu' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('company-dashboard')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Şirket Ayarları' }));
    expect(screen.getByTestId('company-settings-content')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/company');
  });

  it('moves tab focus by arrows and selects with Enter', async () => {
    const user = userEvent.setup();
    renderPage();
    const dashboardTab = screen.getByRole('tab', { name: 'Şirket Dashboardu' });
    const settingsTab = screen.getByRole('tab', { name: 'Şirket Ayarları' });

    dashboardTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(settingsTab);
    expect(settingsTab).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{Enter}');
    expect(settingsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('redirects members to dashboard', () => {
    renderPage(member);
    expect(screen.getByText('Dashboard redirect')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
  });
});
