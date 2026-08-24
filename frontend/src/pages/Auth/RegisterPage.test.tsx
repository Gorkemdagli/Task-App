import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';

vi.mock('../../lib/api', () => ({ authApi: { post: vi.fn() } }));
import { authApi } from '../../lib/api';

describe('RegisterPage', () => {
  it('renders fields', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/ad soyad/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-posta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/şifre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/şirket adı/i)).toBeInTheDocument();
  });
  it('disabled on weak', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/ad soyad/i), 'Ali');
    await u.type(screen.getByLabelText(/e-posta/i), 'a@x.com');
    await u.type(screen.getByLabelText(/şifre/i), 'weakpw');
    expect(screen.getByRole('button', { name: /hesap oluştur/i })).toBeDisabled();
  });
  it('enabled on medium', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/ad soyad/i), 'Ali');
    await u.type(screen.getByLabelText(/e-posta/i), 'a@x.com');
    await u.type(screen.getByLabelText(/şifre/i), 'medium123');
    expect(screen.getByRole('button', { name: /hesap oluştur/i })).not.toBeDisabled();
  });
  it('shows strength label', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/şifre/i), 'medium123');
    expect(screen.getByText('Orta')).toBeInTheDocument();
  });
  it('form-top on 409', async () => {
    vi.mocked(authApi.post).mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Bu e-posta zaten kullanılıyor' } },
    });
    const u = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/ad soyad/i), 'Ali');
    await u.type(screen.getByLabelText(/e-posta/i), 'd@x.com');
    await u.type(screen.getByLabelText(/şifre/i), 'medium123');
    await u.click(screen.getByRole('button', { name: /hesap oluştur/i }));
    expect(await screen.findByText(/bu e-posta zaten kullanılıyor/i)).toBeInTheDocument();
  });
  it('link to /login', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/giriş yap/i).closest('a')).toHaveAttribute('href', '/login');
  });
});
