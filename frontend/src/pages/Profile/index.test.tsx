import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserProfile } from '@/services/profile';
import { ProfilePage } from './index';

const { useProfileMock, updateMock, uploadMock } = vi.hoisted(() => ({
  useProfileMock: vi.fn(),
  updateMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock('@/hooks/queries/useProfile', () => ({
  useProfile: useProfileMock,
  useUpdateProfile: () => updateMock(),
  useUploadAvatar: () => uploadMock(),
}));

const profile: CurrentUserProfile = {
  id: 'user-1',
  displayId: 'ABCDE',
  email: 'user@example.com',
  fullName: 'Ada User',
  role: 'member',
  tenantId: null,
  tenantName: null,
  avatarUrl: null,
  notifyTaskAssigned: true,
  notifyTaskCommented: true,
  notifyMessageReceived: true,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/login" element={<p>Giriş</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    useProfileMock.mockReturnValue({ data: profile, isLoading: false, isError: false });
    updateMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(profile),
      isPending: false,
      isError: false,
      error: null,
    });
    uploadMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(profile),
      isPending: false,
      isError: false,
      error: null,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders editable profile, read-only display ID, password, and preferences', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Profil' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ad soyad')).toHaveValue('Ada User');
    expect(screen.getByLabelText('E-posta')).toHaveValue('user@example.com');
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
    expect(screen.getByLabelText('Mevcut şifre')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Görev atamaları' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Görev yorumları' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Yeni mesajlar' })).toBeChecked();
  });

  it('copies display ID', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Görünen ID kopyala' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCDE'));
  });

  it('guards avatar files over 25 MB on client', () => {
    renderPage();
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 25 * 1024 * 1024 + 1 });

    fireEvent.change(screen.getByLabelText('Avatar dosyası'), { target: { files: [file] } });

    expect(screen.getByText('Avatar dosyası 25 MB veya daha küçük olmalı.')).toBeInTheDocument();
  });

  it('redirects to login after credential mutation revokes session', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ sessionRevoked: true });
    updateMock.mockReturnValue({ mutateAsync, isPending: false, isError: false, error: null });
    renderPage();

    fireEvent.change(screen.getByLabelText('Mevcut şifre'), { target: { value: 'hunter22' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre'), { target: { value: 'new-hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi güncelle' }));

    await waitFor(() => expect(screen.getByText('Giriş')).toBeInTheDocument());
    expect(mutateAsync).toHaveBeenCalledWith({
      currentPassword: 'hunter22',
      newPassword: 'new-hunter22',
    });
  });
});
