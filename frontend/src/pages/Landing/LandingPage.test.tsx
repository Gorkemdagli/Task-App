import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { LandingPage } from './LandingPage';

function renderLanding(authenticated = false) {
  useAuthStore.setState({
    accessToken: authenticated ? 'token' : null,
    user: null,
  });

  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits only real CTA and navigation targets for signed-out visitors', () => {
    renderLanding();
    const hero = screen.getByRole('region', { name: 'İşin nerede kaldığını herkes görsün.' });

    expect(within(hero).getByRole('link', { name: 'Ücretsiz başla' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(within(hero).getByRole('link', { name: 'Panoyu dene' })).toHaveAttribute(
      'href',
      '#interactive-app-preview',
    );

    expect(screen.queryByText('Fiyatlandırma')).not.toBeInTheDocument();
    expect(screen.queryByText('Entegrasyonlar')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/privacy"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/terms"]')).not.toBeInTheDocument();
  });

  it('points the authenticated hero action to the dashboard', () => {
    renderLanding(true);
    const hero = screen.getByRole('region', { name: 'İşin nerede kaldığını herkes görsün.' });

    expect(within(hero).getByRole('link', { name: 'Panoya git' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('keeps the approved section order', () => {
    const { container } = renderLanding();
    const sectionTitles = Array.from(container.querySelectorAll('main > section')).map(
      (section) => section.querySelector('h1, h2')?.textContent,
    );

    expect(sectionTitles).toEqual([
      'İşin nerede kaldığını herkes görsün.',
      'TaskFlow’u iş üstünde deneyin.',
      'Özellikler',
      'İş akışı',
    ]);
  });
});
