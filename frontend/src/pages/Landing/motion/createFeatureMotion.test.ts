import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  from: vi.fn(),
  revert: vi.fn(),
}));

vi.mock('gsap', () => ({
  gsap: {
    registerPlugin: vi.fn(),
    matchMedia: () => ({ add: mocks.add, revert: mocks.revert }),
    from: mocks.from,
  },
}));

vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }));

import { createFeatureMotion } from './createFeatureMotion';

describe('createFeatureMotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reveals the right-side cards sequentially on scroll', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    const root = document.createElement('section');
    root.innerHTML =
      '<article data-feature-reveal></article><article data-feature-reveal></article>';

    createFeatureMotion(root);
    const setup = mocks.add.mock.calls[0]?.[1] as () => void;
    setup();

    expect(mocks.from).toHaveBeenCalledWith(
      root.querySelectorAll('[data-feature-reveal]'),
      expect.objectContaining({
        stagger: 0.3,
        scrollTrigger: expect.objectContaining({ scrub: 0.65 }),
      }),
    );
  });

  it('keeps content static for reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const cleanup = createFeatureMotion(document.createElement('section'));
    expect(mocks.add).not.toHaveBeenCalled();
    cleanup();
    expect(mocks.revert).toHaveBeenCalledOnce();
  });
});
