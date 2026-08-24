import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MotionSection } from './MotionSection';

vi.mock('../motion/createLandingMotion', () => ({ createLandingMotion: vi.fn(() => vi.fn()) }));

describe('MotionSection', () => {
  it('renders the complete lifecycle without requiring animation', () => {
    render(<MotionSection />);
    const region = screen.getByRole('region', { name: 'Görev ilerlerken bağlam kaybolmaz.' });

    expect(region).toHaveAttribute('id', 'workflow');
    expect(screen.getByText('Görevi aç')).toBeVisible();
    expect(screen.getByText('Önceliği netleştir')).toBeVisible();
    expect(screen.getByText('Görevde konuş')).toBeVisible();
    expect(screen.getByText('Durumu ilerlet')).toBeVisible();
    expect(screen.getByText('Tamamla, arşivle')).toBeVisible();
    expect(
      Array.from(region.querySelectorAll('[data-motion-frame]')).map(
        (frame) => frame.querySelector('h3')?.textContent,
      ),
    ).toEqual([
      'Görevi aç',
      'Önceliği netleştir',
      'Görevde konuş',
      'Durumu ilerlet',
      'Tamamla, arşivle',
    ]);
    expect(region.querySelectorAll('[data-motion-word]').length).toBeGreaterThan(8);
  });
});
