import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalErrorPage } from './GlobalErrorPage';
import type { GlobalErrorKind } from '@/lib/globalError';
import { clearGlobalError, setGlobalError } from '@/lib/globalError';

function renderError(kind: GlobalErrorKind, initialEntry = '/tasks/secret-id') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <GlobalErrorPage kind={kind} />
    </MemoryRouter>,
  );
}

function getRecoveryRail() {
  return within(screen.getByRole('list', { name: 'Kurtarma adımları' }));
}

describe('GlobalErrorPage', () => {
  it('renders the selected access-denied rail and a safe dashboard action', () => {
    renderError('access-denied');

    expect(screen.getByText('ERİŞİM DURDURULDU')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bu sayfaya erişim yetkiniz yok' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('İsterseniz güvenli bir sayfaya dönüp çalışmaya devam edebilirsiniz.'),
    ).toBeInTheDocument();
    expect(getRecoveryRail().getAllByRole('listitem')).toHaveLength(3);
    expect(getRecoveryRail().getByText('Erişim kontrolü').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('link', { name: 'Kontrol paneline dön' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('inherits the active app theme instead of forcing light mode', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    renderError('access-denied');

    expect(screen.getByRole('main')).not.toHaveAttribute('data-theme');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('uses a retry action instead of navigating to a crafted external path', () => {
    renderError('network', '//evil.example');

    expect(screen.getByRole('heading', { name: 'Bağlantı kurulamadı' })).toBeInTheDocument();
    expect(getRecoveryRail().getByText('Bağlantı kontrolü')).toBeInTheDocument();
    expect(getRecoveryRail().getByText('Yeniden dene')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Yeniden dene' })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="//evil.example"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/internal detail|evil\.example/i)).not.toBeInTheDocument();
  });

  it('preserves the provided retry callback', () => {
    const retry = vi.fn();
    setGlobalError('network', retry);
    renderError('network', '//evil.example');

    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));

    expect(retry).toHaveBeenCalledOnce();
    clearGlobalError();
  });

  it('sends an expired session to sign-in', () => {
    renderError('session-expired');

    expect(screen.getByRole('heading', { name: 'Oturumunuz sona erdi' })).toBeInTheDocument();
    expect(getRecoveryRail().getByText('Oturum kontrolü')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/login');
  });

  it('shows a sign-in action when authentication is required', () => {
    renderError('sign-in-required');

    expect(
      screen.getByRole('heading', { name: 'Bu sayfaya erişmek için giriş yapın' }),
    ).toBeInTheDocument();
    expect(getRecoveryRail().getByText('Giriş yaptıktan sonra devam edin.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/login');
  });

  it('offers a safe dashboard destination for unknown routes', () => {
    renderError('not-found');

    expect(screen.getByRole('heading', { name: 'Aradığınız sayfa bulunamadı' })).toBeInTheDocument();
    expect(getRecoveryRail().getByText('Sayfa kontrolü')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kontrol paneline dön' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('uses safe generic copy and offers a retry action', () => {
    renderError('generic');

    expect(screen.getByRole('heading', { name: 'Bir sorun oluştu' })).toBeInTheDocument();
    expect(getRecoveryRail().getByText('İşlem kontrolü')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument();
    expect(screen.queryByText(/secret|backend|stack/i)).not.toBeInTheDocument();
  });
});
