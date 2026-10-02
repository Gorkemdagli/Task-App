import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';
import i18n from '../../i18n';

vi.mock('../../lib/api', () => ({ authApi: { post: vi.fn() } }));
import { authApi } from '../../lib/api';

describe('RegisterPage', () => {
  it('renders fields', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/ad soyad/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-posta/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Şifre')).toBeInTheDocument();
    expect(screen.getByLabelText('Şirket adı (opsiyonel)')).toBeInTheDocument();
  });

  it('renders English copy when English is selected', async () => {
    const previousLanguage = i18n.language;
    try {
      await i18n.changeLanguage('en');
      render(
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>,
      );
      expect(screen.getByLabelText('Full name')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create an account' })).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });
  it('disabled on weak', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/ad soyad/i), 'Ali');
    await u.type(screen.getByLabelText(/e-posta/i), 'a@x.com');
    await u.type(screen.getByLabelText('Şifre'), 'weakpw');
    expect(screen.getByRole('button', { name: /hesap oluştur/i })).toBeDisabled();
  });
  it('enabled on medium', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/ad soyad/i), 'Ali');
    await u.type(screen.getByLabelText(/e-posta/i), 'a@x.com');
    await u.type(screen.getByLabelText('Şifre'), 'medium123');
    expect(screen.getByRole('button', { name: /hesap oluştur/i })).not.toBeDisabled();
  });
  it('shows strength label', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText('Şifre'), 'medium123');
    expect(screen.getByText('Orta')).toBeInTheDocument();
  });
  it('form-top on 409', async () => {
    vi.mocked(authApi.post).mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Bu e-posta zaten kullanılıyor' } },
    });
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/ad soyad/i), 'Ali');
    await u.type(screen.getByLabelText(/e-posta/i), 'd@x.com');
    await u.type(screen.getByLabelText('Şifre'), 'medium123');
    await u.click(screen.getByRole('button', { name: /hesap oluştur/i }));
    expect(await screen.findByText(/bu e-posta zaten kullanılıyor/i)).toBeInTheDocument();
  });
  it('link to /login', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/giriş yap/i).closest('a')).toHaveAttribute('href', '/login');
  });

  it('shows company creation information in the selected language', async () => {
    const previousLanguage = i18n.language;
    const user = userEvent.setup();

    try {
      await i18n.changeLanguage('tr');
      render(
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>,
      );

      const infoButton = screen.getByRole('button', { name: 'Şirket adı hakkında bilgi' });
      const tooltip = screen.getByRole('tooltip');
      expect(infoButton).toHaveAttribute('aria-describedby', 'companyNameInfo');
      expect(tooltip).toHaveClass('group-hover:visible', 'group-focus-within:visible');

      await user.hover(infoButton);
      expect(tooltip).toHaveTextContent(
        'Kendi şirketinizi oluşturmak için şirket adı girin. Bu hesap başka bir şirkete katılamaz.',
      );

      await user.unhover(infoButton);
      infoButton.focus();
      expect(infoButton).toHaveFocus();
      await i18n.changeLanguage('en');
      expect(tooltip).toHaveTextContent(
        'Enter a company name to create your own company. This account won’t be able to join another company.',
      );
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });
});
