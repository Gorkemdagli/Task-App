import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileSidebar } from './MobileSidebar';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: [], isLoading: false, isError: false }),
  useTeam: () => ({ data: null, isLoading: false, isError: false }),
}));

const user: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'teamAdmin',
  tenantId: 't1',
};

function renderMs() {
  return render(
    <MemoryRouter>
      <MobileSidebar />
    </MemoryRouter>,
  );
}

describe('MobileSidebar', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user });
    useUiStore.setState({ mobileSheetOpen: false });
  });

  it('renders nothing visible when closed', () => {
    renderMs();
    expect(screen.queryByText('TaskFlow Şirketim')).not.toBeInTheDocument();
  });

  it('renders tenant header with correct role label when open', () => {
    useUiStore.setState({ mobileSheetOpen: true });
    renderMs();
    expect(screen.getByText('TaskFlow Şirketim')).toBeInTheDocument();
    expect(screen.getByText('Takım Admini')).toBeInTheDocument();
  });

  it('shows empty-state hint when no active team is selected', () => {
    useUiStore.setState({ mobileSheetOpen: true });
    renderMs();
    expect(screen.getByText(/Üyeleri görmek için bir takım seç/)).toBeInTheDocument();
  });
});
