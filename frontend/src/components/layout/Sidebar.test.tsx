import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';

const user: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'companyAdmin',
  tenantId: 't1',
};

describe('Sidebar', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user });
    useUiStore.setState({ sidebarCollapsed: false });
  });

  function renderSidebar() {
    return render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
  }

  it('renders tenant header + member list', () => {
    renderSidebar();
    expect(screen.getByText('TaskFlow Şirketim')).toBeInTheDocument();
    expect(screen.getByText(/Takım Üyeleri/)).toBeInTheDocument();
    expect(screen.getByText('Ada Yılmaz')).toBeInTheDocument();
  });

  it('shows companyAdmin role label in tenant header + member row', () => {
    renderSidebar();
    // 'Şirket Admini' appears once in tenant header + once in Ada Yılmaz's
    // member row (the only companyAdmin in the mock list).
    expect(screen.getAllByText('Şirket Admini').length).toBe(2);
  });

  it('collapse button toggles ui store', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const btn = screen.getByRole('button', { name: 'Kenar çubuğunu daralt' });
    await user.click(btn);
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });

  it('renders collapsed variant when uiStore says so', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderSidebar();
    expect(screen.queryByText('TaskFlow Şirketim')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kenar çubuğunu genişlet' })).toBeInTheDocument();
  });
});
