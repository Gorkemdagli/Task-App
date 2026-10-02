import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useThemeStore } from '@/stores/themeStore';
import { BrandPanel } from './BrandPanel';

describe('BrandPanel', () => {
  it('logo + tagline + bullets', () => {
    render(<BrandPanel />);
    expect(screen.getByRole('heading', { name: 'TaskFlow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dili İngilizce yap' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aydınlık temaya geç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dili İngilizce yap' }).querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('tr.png'),
    );
    expect(screen.getByText(/İşleri planlayın/i)).toBeInTheDocument();
    expect(screen.getByText(/Kanban/i)).toBeInTheDocument();
    expect(screen.getByText(/Mesajlaşma/i)).toBeInTheDocument();
    expect(screen.getByText(/Rol bazlı/i)).toBeInTheDocument();
    expect(screen.getByText('Yapılacak')).toBeInTheDocument();
    expect(screen.getByText('Yapılıyor')).toBeInTheDocument();
    expect(screen.getByText('Yapıldı')).toBeInTheDocument();
  });

  it('toggles and persists the theme', async () => {
    const user = userEvent.setup();
    useThemeStore.setState({ mode: 'dark', _hasHydrated: true });
    render(<BrandPanel />);

    await user.click(screen.getByRole('button', { name: 'Aydınlık temaya geç' }));

    expect(useThemeStore.getState().mode).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('taskflow-theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Karanlık temaya geç' })).toBeInTheDocument();
    useThemeStore.getState().setMode('dark');
  });
});
