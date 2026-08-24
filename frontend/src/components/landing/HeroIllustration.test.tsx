import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroIllustration } from './HeroIllustration';

let prefersReducedMotion = false;

describe('HeroIllustration', () => {
  beforeEach(() => {
    prefersReducedMotion = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)' && prefersReducedMotion,
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
    vi.restoreAllMocks();
  });

  it('keeps the live board motion structure available by default', () => {
    render(<HeroIllustration />);
    const teaser = screen.getByRole('link');

    expect(teaser).toHaveAttribute('href', '#interactive-app-preview');
    expect(teaser.querySelector('.landing-hero-board__progress')).toHaveClass(
      'landing-hero-board__progress--outer',
    );
    expect(teaser.querySelectorAll('.landing-hero-board__progress-edge')).toHaveLength(4);
    expect(teaser.querySelector('.landing-hero-board__task--moving')).toBeInTheDocument();
    expect(teaser).not.toHaveAttribute('data-motion-override');
    expect(screen.queryByRole('button', { name: /Animasyonu/ })).not.toBeInTheDocument();
  });

  it('offers a motion override when reduced motion is requested', async () => {
    prefersReducedMotion = true;
    const user = userEvent.setup();

    render(<HeroIllustration />);

    const teaser = screen.getByRole('link');
    const button = screen.getByRole('button', { name: 'Animasyonu oynat' });

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(teaser).not.toHaveAttribute('data-motion-override');

    await user.click(button);

    expect(screen.getByRole('button', { name: 'Animasyonu durdur' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(teaser).toHaveAttribute('data-motion-override', 'on');
  });

  it('shows the task lifecycle through archive in four ordered columns', () => {
    render(<HeroIllustration />);
    const board = screen.getByRole('link');
    const columns = board.querySelectorAll(
      '.landing-hero-board__column, .landing-hero-board__column--archive',
    );

    expect(board.querySelector('.landing-hero-board__columns')).toHaveClass(
      'landing-hero-board__columns--lifecycle',
    );
    expect(columns).toHaveLength(4);
    expect(
      Array.from(columns).map((column) => column.querySelector('header')?.textContent),
    ).toEqual(['Yapılacak2', 'Yapılıyor1', 'Yapıldı0', undefined]);
    expect(columns[3]).toHaveClass('landing-hero-board__column--archive');
    expect(columns[3].querySelector('header')).not.toBeInTheDocument();

    const archiveBox = columns[3].querySelector('.landing-hero-board__archive');
    expect(archiveBox).toBeInTheDocument();
    expect(archiveBox?.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24');
    expect(archiveBox?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(
      archiveBox?.querySelector(
        '.landing-hero-board__archive-visual .landing-hero-board__archive-count',
      ),
    ).toHaveTextContent('+1');
    expect(board.style.getPropertyValue('--landing-hero-lane-y-1')).toBe('0px');
    expect(board.style.getPropertyValue('--landing-hero-lane-y-2')).toBe('0px');
    expect(board.style.getPropertyValue('--landing-hero-lane-y-3')).toBe('0px');
  });

  it('measures horizontal and vertical destinations for responsive grid layouts', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const className = typeof this.className === 'string' ? this.className : '';
      const rects: Record<string, Partial<DOMRect>> = {
        'landing-hero-board__task landing-hero-board__task--quiet': {
          left: 16,
          top: 80,
          right: 160,
          bottom: 120,
        },
        'landing-hero-board__task landing-hero-board__task--moving': {
          left: 16,
          top: 136,
          right: 160,
          bottom: 176,
        },
        'landing-hero-board__column': {
          left: 360,
          top: 80,
          right: 504,
          bottom: 200,
        },
        'landing-hero-board__column--archive': {
          left: 532,
          top: 80,
          right: 676,
          bottom: 200,
        },
      };

      if (className.includes('landing-hero-board__task--moving')) {
        return rects['landing-hero-board__task landing-hero-board__task--moving'] as DOMRect;
      }

      if (className.includes('landing-hero-board__task--quiet')) {
        const quietTask = this.parentElement?.querySelector(
          '.landing-hero-board__task--quiet:last-of-type',
        );
        if (quietTask === this) {
          return {
            ...rects['landing-hero-board__task landing-hero-board__task--quiet'],
            left: 188,
            right: 332,
            bottom: 128,
          } as DOMRect;
        }

        return rects['landing-hero-board__task landing-hero-board__task--quiet'] as DOMRect;
      }

      if (className.includes('landing-hero-board__column--archive')) {
        return rects['landing-hero-board__column--archive'] as DOMRect;
      }

      if (this.tagName === 'HEADER') {
        return {
          left: 360,
          top: 80,
          right: 504,
          bottom: 100,
        } as DOMRect;
      }

      return rects['landing-hero-board__column'] as DOMRect;
    });

    render(<HeroIllustration />);

    const board = screen.getByRole('link');
    expect(board.style.getPropertyValue('--landing-hero-lane-x-1')).toBe('172px');
    expect(board.style.getPropertyValue('--landing-hero-lane-x-2')).toBe('344px');
    expect(board.style.getPropertyValue('--landing-hero-lane-x-3')).toBe('516px');
    expect(board.style.getPropertyValue('--landing-hero-lane-y-1')).toBe('8px');
    expect(board.style.getPropertyValue('--landing-hero-lane-y-2')).toBe('-36px');
    expect(board.style.getPropertyValue('--landing-hero-lane-y-3')).toBe('-36px');
  });
});
