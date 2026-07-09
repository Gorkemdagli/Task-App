import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/login');
  });
  it('shows loading initially', () => {
    render(<App />);
    expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument();
  });
  it('redirects unauth /dashboard to /login', async () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText(/giriş yap/i).length).toBeGreaterThan(0);
    });
  });
});
