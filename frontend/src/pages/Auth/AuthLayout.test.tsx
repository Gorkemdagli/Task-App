import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n, { LANGUAGE_STORAGE_KEY } from '@/i18n';
import { useThemeStore } from '@/stores/themeStore';
import { AuthLayout } from './AuthLayout';

describe('AuthLayout', () => {
  it('renders Outlet + BrandPanel', () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/x" element={<div>Child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Child')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TaskFlow' })).toBeInTheDocument();
    expect(document.querySelector('.auth-theme.theme-landing')).toBeInTheDocument();
  });

  it('switches language from the responsive brand header and persists it', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('tr');
    const { container } = render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/x" element={<div>Child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const mobileBrand = within(screen.getByTestId('auth-mobile-brand'));
    const languageToggle = mobileBrand.getByRole('button', { name: 'Dili İngilizce yap' });
    expect(languageToggle.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('tr.png'),
    );

    await user.click(languageToggle);

    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(mobileBrand.getByText('Better teamwork starts here.')).toBeInTheDocument();
    expect(languageToggle.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('us.png'),
    );
    expect(container.querySelector('aside button')).toHaveAttribute(
      'aria-label',
      'Switch language to Turkish',
    );
    await i18n.changeLanguage('tr');
  });

  it('shows adjacent language and theme controls on mobile and persists theme changes', async () => {
    const user = userEvent.setup();
    useThemeStore.setState({ mode: 'dark', _hasHydrated: true });
    render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/x" element={<div>Child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const mobileBrand = within(screen.getByTestId('auth-mobile-brand'));
    expect(mobileBrand.getByRole('button', { name: 'Dili İngilizce yap' })).toBeInTheDocument();
    await user.click(mobileBrand.getByRole('button', { name: 'Aydınlık temaya geç' }));

    expect(useThemeStore.getState().mode).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('taskflow-theme')).toBe('light');
    expect(mobileBrand.getByRole('button', { name: 'Karanlık temaya geç' })).toBeInTheDocument();
    useThemeStore.getState().setMode('dark');
  });
});
