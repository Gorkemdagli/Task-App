import type { MouseEvent as ReactMouseEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToLandingSection } from './landingScroll';

describe('scrollToLandingSection', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    const target = document.createElement('section');
    target.id = 'target';
    document.body.append(target);
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    vi.unstubAllGlobals();
  });

  function clickAnchor(reducedMotion: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: reducedMotion })),
    );
    const anchor = document.createElement('a');
    anchor.href = '#target';
    anchor.addEventListener('click', (event) => {
      scrollToLandingSection(event as unknown as ReactMouseEvent<HTMLAnchorElement>, '#target');
    });
    document.body.append(anchor);
    anchor.click();
  }

  it('smoothly scrolls without mutating the URL hash', () => {
    clickAnchor(false);

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(window.location.hash).toBe('');
  });

  it('uses instant scrolling when reduced motion is requested', () => {
    clickAnchor(true);

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    });
  });
});
