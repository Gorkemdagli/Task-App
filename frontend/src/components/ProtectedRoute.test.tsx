import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '../stores/authStore';

describe('ProtectedRoute', () => {
  beforeEach(() => useAuthStore.setState({ accessToken: null, user: null }));
  it('shows sign-in required and offers the login route when no token', async () => {
    render(
      <MemoryRouter initialEntries={['/p']}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/p" element={<div>Protected</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Bu sayfaya erişmek için giriş yapın' }),
    ).toBeInTheDocument();
    const loginLink = screen.getByRole('link', { name: 'Giriş yap' });
    expect(loginLink).toHaveAttribute('href', '/login');
    fireEvent.click(loginLink);
    expect(await screen.findByText('Login')).toBeInTheDocument();
  });
  it('renders children when token present', () => {
    useAuthStore.getState().setAccessToken('t');
    render(
      <MemoryRouter initialEntries={['/p']}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/p" element={<div>Protected</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });
});
