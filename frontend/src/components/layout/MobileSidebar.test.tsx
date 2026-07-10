import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileSidebar } from './MobileSidebar';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';

const user: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'teamAdmin',
  tenantId: 't1',
};

describe('MobileSidebar', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user });
    useUiStore.setState({ mobileSheetOpen: false });
  });

  it('renders nothing visible when closed', () => {
    render(<MobileSidebar />);
    // Radix Dialog doesn't render its content when closed
    expect(screen.queryByText('Takım Üyeleri')).not.toBeInTheDocument();
  });

  it('renders sidebar content when store says open', () => {
    useUiStore.setState({ mobileSheetOpen: true });
    render(<MobileSidebar />);
    expect(screen.getByText('TaskFlow Şirketim')).toBeInTheDocument();
    expect(screen.getByText('Takım Üyeleri (6)')).toBeInTheDocument();
    expect(screen.getByText('Ada Yılmaz')).toBeInTheDocument();
  });

  it('shows correct role label for teamAdmin', () => {
    useUiStore.setState({ mobileSheetOpen: true });
    render(<MobileSidebar />);
    // 'Takım Admini' appears once in tenant header + twice in member list
    // (Berk Demir and Ece Polat are both teamAdmin in mock).
    expect(screen.getAllByText('Takım Admini').length).toBeGreaterThanOrEqual(1);
  });
});
