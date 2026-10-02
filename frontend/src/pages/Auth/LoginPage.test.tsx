import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import i18n from '../../i18n';

import { authApi } from '../../lib/api';
vi.mock('../../lib/api', () => ({ authApi: { post: vi.fn() } }));

describe('LoginPage', () => {
  it('renders fields', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/e-posta/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Şifre')).toBeInTheDocument();
  });

  it('switches login copy between English and Turkish', async () => {
    const previousLanguage = i18n.language;
    try {
      await i18n.changeLanguage('en');
      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>,
      );
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      await i18n.changeLanguage('tr');
      expect(screen.getByLabelText('E-posta')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Giriş Yap' })).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });
  it('field errors on empty submit', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await u.click(screen.getByRole('button', { name: /giriş yap/i }));
    expect(await screen.findByText(/geçerli bir e-posta/i)).toBeInTheDocument();
    expect(await screen.findByText(/şifre gerekli/i)).toBeInTheDocument();
  });
  it('form-top on 401', async () => {
    vi.mocked(authApi.post).mockRejectedValueOnce({
      response: { status: 401, data: { message: 'E-posta veya şifre hatalı' } },
    });
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/e-posta/i), 'a@x.com');
    await u.type(screen.getByLabelText('Şifre'), 'wrong');
    await u.click(screen.getByRole('button', { name: /giriş yap/i }));
    expect(await screen.findByText(/e-posta veya şifre hatalı/i)).toBeInTheDocument();
  });
  it('password visibility toggle is keyboard accessible', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    const password = screen.getByLabelText('Şifre');
    expect(password).toHaveAttribute('type', 'password');
    await u.click(screen.getByRole('button', { name: 'Şifreyi göster' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Şifreyi gizle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('link to /register', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/hesap oluştur/i).closest('a')).toHaveAttribute('href', '/register');
  });
});
