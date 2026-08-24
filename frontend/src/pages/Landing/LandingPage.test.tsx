import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    window.history.replaceState({}, '', '/');
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
    expect(within(hero).getByRole('link', { name: 'Demo’yu dene' })).toHaveAttribute(
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

  it('presents equal-weight hero actions and the approved editorial copy', () => {
    renderLanding();
    const hero = screen.getByRole('region', { name: 'İşin nerede kaldığını herkes görsün.' });
    const register = within(hero).getByRole('link', { name: 'Ücretsiz başla' });
    const demo = within(hero).getByRole('link', { name: 'Demo’yu dene' });

    expect(register).toHaveAttribute('href', '/register');
    expect(demo).toHaveAttribute('href', '#interactive-app-preview');
    expect(register).toHaveClass('landing-hero-cta');
    expect(demo).toHaveClass('landing-hero-cta');
    expect(within(hero).getByTestId('hero-inline-product')).toBeInTheDocument();
  });

  it('marks the current landing anchor semantically', () => {
    renderLanding();
    expect(screen.getByRole('link', { name: 'TaskFlow anasayfa' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('links desktop and mobile navigation to every landing section', async () => {
    const user = userEvent.setup();
    renderLanding();

    expect(screen.getByRole('link', { name: 'TaskFlow anasayfa' })).toHaveAttribute(
      'href',
      '#hero',
    );

    for (const [label, href] of [
      ['Demo', '#interactive-app-preview'],
      ['Özellikler', '#features'],
      ['İş akışı', '#workflow'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }

    await user.click(screen.getByRole('button', { name: 'Menüyü aç' }));
    const mobileMenu = screen.getByRole('dialog');

    for (const [label, href] of [
      ['Demo', '#interactive-app-preview'],
      ['Özellikler', '#features'],
      ['İş akışı', '#workflow'],
    ]) {
      expect(within(mobileMenu).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('scrolls to a section without adding a hash to the landing URL', async () => {
    const user = userEvent.setup();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      renderLanding();

      await user.click(screen.getByRole('link', { name: 'İş akışı' }));

      expect(window.location.hash).toBe('');
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('uses a product teaser that leads to the interactive demo', () => {
    renderLanding();
    const hero = screen.getByRole('region', { name: 'İşin nerede kaldığını herkes görsün.' });
    const teaser = within(hero).getByRole('link', { name: 'Etkileşimli TaskFlow demosuna git' });

    expect(teaser).toHaveAttribute('href', '#interactive-app-preview');
    expect(within(teaser).getByText('Yapılacak')).toBeInTheDocument();
    expect(within(teaser).getByText('Yapılıyor')).toBeInTheDocument();
    expect(
      within(hero).queryByRole('group', { name: 'İş akışının ilerleyişi' }),
    ).not.toBeInTheDocument();
  });

  it('uses natural document scroll inside the editorial overflow boundary', () => {
    const { container, unmount } = renderLanding();
    const root = container.firstElementChild;

    expect(root).toHaveClass('theme-landing', 'landing-editorial');
    expect(root).toHaveClass('overflow-x-hidden', 'w-full', 'max-w-full');
    expect(document.documentElement).not.toHaveClass('landing-scroll-snap');

    unmount();
    expect(document.documentElement).not.toHaveClass('landing-scroll-snap');
  });

  it('keeps the approved section order', () => {
    const { container } = renderLanding();
    const sectionTitles = Array.from(container.querySelectorAll('main > section')).map(
      (section) => section.querySelector('h1, h2')?.textContent,
    );

    expect(sectionTitles).toEqual([
      'İşin nerede kaldığını herkes görsün.',
      'İşi görünür kılan üç davranış.',
      'Görev ilerlerken bağlam kaybolmaz.',
      'TaskFlow’u 30 saniyede deneyin.',
    ]);
  });
});
