import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MotionSection } from './MotionSection';

vi.mock('../motion/createLandingMotion', () => ({ createLandingMotion: vi.fn(() => vi.fn()) }));

describe('MotionSection', () => {
  it('renders the complete lifecycle without requiring animation', () => {
    render(
      <MemoryRouter>
        <MotionSection />
      </MemoryRouter>,
    );
    const region = screen.getByRole('region', {
      name: /Bir görev açılır\. Herkes ne olacağını bilir\./,
    });

    expect(region).toHaveAttribute('id', 'workflow');
    expect(screen.getByTestId('lifecycle-ribbon')).toBeInTheDocument();
    expect(screen.getByText('Görevi aç')).toBeVisible();
    expect(screen.getByText('Sorumluyu belirle')).toBeVisible();
    expect(screen.getByText('Görevde konuş')).toBeVisible();
    expect(screen.getByText('Durumu ilerlet')).toBeVisible();
    expect(screen.getByText('Arşivde koru')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Ücretsiz başla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'İş akışını gör' })).not.toBeInTheDocument();
    expect(region.querySelectorAll('[data-motion-frame]')).toHaveLength(3);
    expect(region.querySelector('[data-motion-frame]')).toHaveTextContent('Görev oluşturuldu');
    expect(region.querySelector('[data-motion-frame].is-active')).toHaveTextContent(
      'Bildirim akışını sadeleştir',
    );
    expect(region.querySelectorAll('[data-motion-frame]').item(2)).toHaveTextContent(
      'Görev tamamlandı',
    );
    expect(region.querySelectorAll('[data-motion-word]').length).toBeGreaterThan(8);
  });
});
