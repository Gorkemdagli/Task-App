import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  revert: vi.fn(),
  to: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('gsap', () => ({
  gsap: {
    registerPlugin: vi.fn(),
    matchMedia: () => ({ add: mocks.add, revert: mocks.revert }),
    to: mocks.to,
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
    const cleanup = createLandingMotion(document.createElement('section'));
    expect(mocks.add).toHaveBeenCalledWith('(min-width: 1024px)', expect.any(Function));
    cleanup();
    expect(mocks.revert).toHaveBeenCalledOnce();
  });
});
