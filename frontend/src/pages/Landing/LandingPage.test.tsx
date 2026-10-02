import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, { LANGUAGE_STORAGE_KEY } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { LandingPage } from './LandingPage';

function renderLanding(authenticated = false) {
  useAuthStore.setState({
    accessToken: authenticated ? 'token' : null,
    user: null,
  });

  return render(
    <MemoryRouter>
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
    expect(within(hero).getByRole('link', { name: 'İş akışını gör' })).toHaveAttribute(
      'href',
      '#workflow',
    );

    expect(screen.queryByText('Fiyatlandırma')).not.toBeInTheDocument();
    expect(screen.queryByText('Entegrasyonlar')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/privacy"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/terms"]')).not.toBeInTheDocument();
  });

  it('keeps repeated marketing CTAs out of navigation and content sections', () => {
    const { container } = renderLanding();
    const hero = screen.getByRole('region', { name: 'İşin nerede kaldığını herkes görsün.' });
    const header = container.querySelector<HTMLElement>('.landing-nav')!;
    const footer = screen.getByRole('contentinfo');

    expect(within(hero).getByRole('link', { name: 'Ücretsiz başla' })).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'İş akışını gör' })).toBeInTheDocument();
    expect(within(header).queryByRole('link', { name: 'Ücretsiz başla' })).not.toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Hesap oluştur' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(within(header).getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/login');
    expect(within(footer).getByRole('link', { name: 'Ücretsiz başla' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ücretsiz başla' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'İş akışını gör' })).toHaveLength(1);
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
    const workflow = within(hero).getByRole('link', { name: 'İş akışını gör' });

    expect(register).toHaveAttribute('href', '/register');
    expect(workflow).toHaveAttribute('href', '#workflow');
    expect(register).toHaveClass('landing-hero-cta');
    expect(workflow).toHaveClass('landing-hero-cta');
    expect(within(hero).queryByTestId('hero-inline-product')).not.toBeInTheDocument();
  });

  it('keeps the hero headline in the same content flow as its copy and actions', () => {
    renderLanding();
    const hero = screen.getByRole('region', { name: 'İşin nerede kaldığını herkes görsün.' });
    const copy = hero.querySelector('.landing-hero__copy');

    expect(copy).toContainElement(within(hero).getByRole('heading', { level: 1 }));
    expect(copy).toContainElement(within(hero).getByText(/Görev, sorumluluk ve konuşma/));
    expect(copy).toContainElement(within(hero).getByRole('link', { name: 'Ücretsiz başla' }));
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
      ['Özellikler', '#features'],
      ['İş akışı', '#workflow'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }

    await user.click(screen.getByRole('button', { name: 'Menüyü aç' }));
    const mobileMenu = screen.getByRole('dialog');

    for (const [label, href] of [
      ['Özellikler', '#features'],
      ['İş akışı', '#workflow'],
    ]) {
      expect(within(mobileMenu).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    expect(within(mobileMenu).getByRole('link', { name: 'Hesap oluştur' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(within(mobileMenu).getByRole('link', { name: 'Giriş yap' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('switches landing language with the active flag in desktop and mobile navigation', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('tr');
    renderLanding();
    const header = document.querySelector<HTMLElement>('.landing-nav')!;

    const desktopToggle = within(header).getByRole('button', { name: 'Dili İngilizce yap' });
    expect(desktopToggle.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('tr.png'),
    );
    await user.click(desktopToggle);

    expect(screen.getByRole('navigation', { name: 'Page sections' })).toHaveTextContent('Features');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    const mobileToggle = within(header).getByRole('button', { name: 'Open menu' });
    await user.click(mobileToggle);
    const mobileMenu = screen.getByRole('dialog');
    const mobileLanguageToggle = within(mobileMenu).getByRole('button', {
      name: 'Switch language to Turkish',
    });
    expect(mobileLanguageToggle.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('us.png'),
    );
    await user.click(mobileLanguageToggle);
    expect(document.documentElement.lang).toBe('tr');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('tr');
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
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('uses a static product teaser beside the hero actions', () => {
    renderLanding();
    const hero = screen.getByRole('region', { name: 'İşin nerede kaldığını herkes görsün.' });
    const teaser = within(hero).getByRole('img', {
      name: 'TaskFlow çalışma alanı önizlemesi',
    });

    expect(teaser).toBeVisible();
    expect(
      within(hero).queryByRole('link', { name: 'Etkileşimli TaskFlow demosuna git' }),
    ).not.toBeInTheDocument();
    expect(within(teaser).getByText('Yapılacak')).toBeInTheDocument();
    expect(within(teaser).getAllByText('Yapılıyor')).not.toHaveLength(0);
    expect(within(teaser).getByText('Görev ayrıntısı')).toBeInTheDocument();
    expect(within(teaser).getByText('Konuşma')).toBeInTheDocument();
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
      'İş ilerler. Bağlam yanında kalır.',
      'Bir görev açılır. Herkes ne olacağını bilir.',
    ]);
  });

  it('ends with real account actions and no invented legal routes', () => {
    renderLanding();
    const footer = screen.getByRole('contentinfo');

    expect(within(footer).getByText('Ekipte neyin sırada olduğu açık kalsın.')).toBeVisible();
    expect(within(footer).getByText('Görev')).toBeVisible();
    expect(within(footer).getByText('Takım')).toBeVisible();
    expect(within(footer).getByText('Yetki')).toBeVisible();
    expect(within(footer).getByRole('link', { name: 'Ücretsiz başla' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(within(footer).getByRole('link', { name: 'Giriş yap' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(document.querySelector('a[href="/privacy"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/terms"]')).not.toBeInTheDocument();
  });

  it('renders the public landing copy in English when English is selected', async () => {
    try {
      await act(() => i18n.changeLanguage('en'));
      renderLanding();

      expect(
        screen.getByRole('heading', { level: 1, name: 'Everyone can see where work stands.' }),
      ).toBeVisible();
      expect(screen.getByRole('navigation', { name: 'Page sections' })).toHaveTextContent(
        'FeaturesWorkflow',
      );
      expect(screen.getAllByRole('link', { name: 'Get started free' })).toHaveLength(2);
      expect(
        screen.getByRole('heading', {
          name: 'Work moves forward. Context stays close.',
        }),
      ).toBeVisible();
      expect(
        screen.getByRole('region', {
          name: 'A task begins. Everyone knows what comes next.',
        }),
      ).toBeVisible();
      expect(screen.getAllByText('Create a mobile app promo video')).toHaveLength(2);
      expect(screen.getByText('Make it clear what the team should do next.')).toBeVisible();
    } finally {
      await act(() => i18n.changeLanguage('tr'));
    }
  });
});
