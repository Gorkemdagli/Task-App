import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import type { CompanySettings } from '@/services/companySettings';
import { CompanySettingsContentPage, CompanySettingsPage } from './index';

const settings: CompanySettings = {
  id: 'tenant-a',
  name: 'Acme Corp',
  slug: 'acme-corp',
  description: null,
  logoUrl: null,
};

const pendingInvitation = {
  id: 'invitation-1',
  tenantId: 'tenant-a',
  companyName: 'Acme Corp',
  inviterName: 'Admin',
  status: 'pending' as const,
  createdAt: '2026-08-20T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
  respondedAt: null,
  recipientUserId: 'user-2',
  recipientDisplayId: 'B3X9K',
  recipientEmail: 'target@example.com',
  recipientFullName: 'Target User',
};

const mocks = vi.hoisted(() => ({
  useCompanySettings: vi.fn(),
  useUpdateCompanySettings: vi.fn(),
  useUploadCompanyLogo: vi.fn(),
  useCompanyInvitationAdmin: vi.fn(),
  useCreateCompanyInvitation: vi.fn(),
  useCancelCompanyInvitation: vi.fn(),
}));

vi.mock('@/hooks/queries/useCompanySettings', () => ({
  useCompanySettings: mocks.useCompanySettings,
  useUpdateCompanySettings: mocks.useUpdateCompanySettings,
  useUploadCompanyLogo: mocks.useUploadCompanyLogo,
}));

vi.mock('@/hooks/queries/useCompanyInvitations', () => ({
  useCompanyInvitationAdmin: mocks.useCompanyInvitationAdmin,
  useCreateCompanyInvitation: mocks.useCreateCompanyInvitation,
  useCancelCompanyInvitation: mocks.useCancelCompanyInvitation,
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CompanySettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderContentPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CompanySettingsContentPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CompanySettingsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'admin',
        displayId: 'A3X9K',
        email: 'admin@example.com',
        fullName: 'Admin',
        role: 'companyAdmin',
        tenantId: 'tenant-a',
      },
    });
    mocks.useCompanySettings.mockReturnValue({ data: settings, isLoading: false, isError: false });
    mocks.useUpdateCompanySettings.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(settings),
      isPending: false,
    });
    mocks.useUploadCompanyLogo.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(settings),
      isPending: false,
    });
    mocks.useCompanyInvitationAdmin.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    mocks.useCreateCompanyInvitation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
    mocks.useCancelCompanyInvitation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(pendingInvitation),
      isPending: false,
    });
  });

  it('exposes reusable settings content without a second role guard', () => {
    renderContentPage();
    expect(screen.getByRole('heading', { name: 'Şirket Ayarları' })).toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    mocks.useCompanySettings.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();
    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument();

    mocks.useCompanySettings.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Şirket ayarları yüklenemedi.');
  });

  it('renders editable company settings, read-only slug, and invitation form', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Şirket Ayarları' })).toBeInTheDocument();
    expect(screen.getByLabelText('Şirket adı')).toHaveValue('Acme Corp');
    expect(screen.getByLabelText('Şirket slug')).toHaveValue('acme-corp');
    expect(screen.getByLabelText('Şirket slug')).toHaveAttribute('readonly');
    expect(screen.getByText('0/500')).toBeInTheDocument();
    expect(screen.getByLabelText(/display ID/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Davet Gönder' })).toBeInTheDocument();
    expect(screen.queryByText(/fatura|billing|takım oluştur/i)).not.toBeInTheDocument();
  });

  it('submits name and trimmed nullable description independently', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ ...settings, name: 'Updated' });
    mocks.useUpdateCompanySettings.mockReturnValue({ mutateAsync, isPending: false });
    renderPage();

    await user.clear(screen.getByLabelText('Şirket adı'));
    await user.type(screen.getByLabelText('Şirket adı'), ' Updated ');
    await user.type(screen.getByLabelText('Şirket açıklaması'), '  Description  ');
    await user.click(screen.getByRole('button', { name: 'Şirket değişikliklerini kaydet' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ name: 'Updated', description: 'Description' }),
    );
  });

  it('guards logo size client-side, previews valid file, and uploads it', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ ...settings, logoUrl: 'new-logo' });
    mocks.useUploadCompanyLogo.mockReturnValue({ mutateAsync, isPending: false });
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:logo-preview');
    renderPage();

    const tooLarge = new File(['logo'], 'large.png', { type: 'image/png' });
    Object.defineProperty(tooLarge, 'size', { value: 25 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText('Şirket logosu'), tooLarge);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Logo dosyası 25 MB veya daha küçük olmalı.',
    );
    expect(mutateAsync).not.toHaveBeenCalled();

    const valid = new File(['logo'], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Şirket logosu'), valid);
    expect(screen.getByAltText('Şirket logosu önizleme')).toHaveAttribute(
      'src',
      'blob:logo-preview',
    );
    await user.click(screen.getByRole('button', { name: 'Logoyu yükle' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(valid));
  });

  it('sends invitation, updates feedback on retry, and clears it after remount', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ response: { data: { error: 'USER_NOT_FOUND' } } });
    mocks.useCreateCompanyInvitation.mockReturnValue({ mutateAsync, isPending: false });
    const view = renderPage();
    const input = screen.getByLabelText(/display ID/);

    await user.type(input, 'target@example.com');
    await user.click(screen.getByRole('button', { name: 'Davet Gönder' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/davet.*gönderildi/i);

    await user.type(input, 'missing@example.com');
    await user.click(screen.getByRole('button', { name: 'Davet Gönder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/bulunamad/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    view.unmount();
    renderPage();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders pending invitations and cancels only after confirmation', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn().mockResolvedValue(pendingInvitation);
    mocks.useCompanyInvitationAdmin.mockReturnValue({
      data: [pendingInvitation],
      isPending: false,
      isError: false,
    });
    mocks.useCancelCompanyInvitation.mockReturnValue({ mutateAsync: cancel, isPending: false });
    renderPage();

    expect(screen.getByText(/target@example\.com/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'İptal' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Daveti iptal et' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('invitation-1'));
  });
});
