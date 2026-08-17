import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractivePreviewSection } from './InteractivePreviewSection';

let observerCallback: IntersectionObserverCallback;
let observerCreated = false;

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0.5];
  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
    observerCreated = true;
  }
}

function enterBeat(beat: 0 | 1 | 2) {
  const element = document.querySelector<HTMLElement>(`[data-story-beat="${beat}"]`);
  if (!element) throw new Error(`Beat ${beat} bulunamadı`);

  act(() => {
    observerCallback(
      [
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 0.75,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  });
}

describe('InteractivePreviewSection', () => {
  beforeEach(() => {
    observerCreated = false;
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(min-width: 60rem)',
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

  it('follows narrative beats until the demo is used manually', async () => {
    const user = userEvent.setup();
    render(<InteractivePreviewSection />);

    enterBeat(1);
    expect(screen.getByRole('complementary', { name: 'Görev ayrıntısı' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Görevler' }));
    enterBeat(0);

    expect(screen.getByRole('tab', { name: 'Görevler' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lets reset resume observer-guided beats', async () => {
    const user = userEvent.setup();
    render(<InteractivePreviewSection />);

    await user.click(screen.getByRole('tab', { name: 'Görevler' }));
    enterBeat(1);
    expect(screen.getByRole('tab', { name: 'Görevler' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Demoyu sıfırla' }));
    enterBeat(2);

    expect(screen.getByRole('tab', { name: 'Görevler' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('complementary', { name: 'Görev ayrıntısı' })).toBeInTheDocument();
  });

  it('does not attach scroll storytelling outside desktop motion mode', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<InteractivePreviewSection />);

    expect(observerCreated).toBe(false);
  });
});
