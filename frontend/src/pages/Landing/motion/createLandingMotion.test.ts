import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  revert: vi.fn(),
  to: vi.fn(),
  fromTo: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('gsap', () => ({
  gsap: {
    registerPlugin: vi.fn(),
    matchMedia: () => ({ add: mocks.add, revert: mocks.revert }),
    to: mocks.to,
    fromTo: mocks.fromTo,
  },
}));

vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { refresh: mocks.refresh } }));

import { createLandingMotion } from './createLandingMotion';

describe('createLandingMotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips animation when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const cleanup = createLandingMotion(document.createElement('section'));
    expect(mocks.add).not.toHaveBeenCalled();
    cleanup();
    expect(mocks.revert).toHaveBeenCalledOnce();
  });

  it('registers one desktop animation context and reverts it', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    const root = document.createElement('section');
    root.innerHTML = `
      <span data-motion-word></span>
      <article data-motion-frame></article>
      <article data-motion-frame></article>
      <article data-motion-frame></article>
      <article data-motion-frame></article>
      <article data-motion-frame></article>
    `;
    const cleanup = createLandingMotion(root);
    expect(mocks.add).toHaveBeenCalledWith('(min-width: 1024px)', expect.any(Function));
    const setup = mocks.add.mock.calls[0]?.[1] as () => void;
    setup();

    expect(mocks.fromTo).toHaveBeenCalledTimes(5);
    for (const frame of root.querySelectorAll('[data-motion-frame]')) {
      expect(mocks.fromTo).toHaveBeenCalledWith(
        frame,
        expect.objectContaining({ opacity: 0, scale: 0.82 }),
        expect.objectContaining({
          opacity: 1,
          y: 0,
          scrollTrigger: expect.objectContaining({ trigger: frame, scrub: 0.65 }),
        }),
      );
    }
    cleanup();
    expect(mocks.revert).toHaveBeenCalledOnce();
  });
});
