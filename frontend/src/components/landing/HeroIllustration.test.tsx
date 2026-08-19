import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroIllustration } from './HeroIllustration';

function setReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HeroIllustration', () => {
  it('hides the motion control when reduced motion is not requested', () => {
    setReducedMotion(false);

    render(<HeroIllustration />);

    expect(screen.queryByRole('button', { name: 'Animasyonu oynat' })).not.toBeInTheDocument();
  });

  it('offers a centered motion opt-in when reduced motion is requested', () => {
    setReducedMotion(true);

    render(<HeroIllustration />);

    const board = screen.getByRole('link', { name: 'Etkileşimli TaskFlow demosuna git' });
    const button = screen.getByRole('button', { name: 'Animasyonu oynat' });

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveClass('landing-hero-motion-toggle');
    expect(board).not.toHaveAttribute('data-motion-override');

    fireEvent.click(button);

    expect(board).toHaveAttribute('data-motion-override', 'on');
    expect(screen.getByRole('button', { name: 'Animasyonu durdur' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
