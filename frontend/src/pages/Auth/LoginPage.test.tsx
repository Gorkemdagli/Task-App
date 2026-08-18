import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

import { api } from '../../lib/api';
vi.mock('../../lib/api', () => ({ api: { post: vi.fn() } }));

describe('LoginPage', () => {
  it('renders fields', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/e-posta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/şifre/i)).toBeInTheDocument();
  });
  it('field errors on empty submit', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>,
    );
    await u.click(screen.getByRole('button', { name: /giriş yap/i }));
    expect(await screen.findByText(/geçerli bir e-posta/i)).toBeInTheDocument();
    expect(await screen.findByText(/şifre gerekli/i)).toBeInTheDocument();
  });
  it('form-top on 401', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: { status: 401, data: { message: 'E-posta veya şifre hatalı' } },
    });
    const u = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/e-posta/i), 'a@x.com');
    await u.type(screen.getByLabelText(/şifre/i), 'wrong');
    await u.click(screen.getByRole('button', { name: /giriş yap/i }));
    expect(await screen.findByText(/e-posta veya şifre hatalı/i)).toBeInTheDocument();
  });
  it('link to /register', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/kayıt ol/i).closest('a')).toHaveAttribute('href', '/register');
  });
});
