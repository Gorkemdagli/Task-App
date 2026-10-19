import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionSection } from './MotionSection';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('MotionSection', () => {
  const renderSection = () =>
    render(
      <MemoryRouter>
        <MotionSection />
      </MemoryRouter>,
    );

  beforeEach(() => {
    vi.doMock('../motion/createLandingMotion', () => ({
      createLandingMotion: vi.fn(() => vi.fn()),
    }));
  });

  afterEach(() => {
    vi.doUnmock('../motion/createLandingMotion');
    vi.resetModules();
  });

  it('cleans up an initialized motion controller on unmount', async () => {
    const cleanup = vi.fn();
    const createLandingMotion = vi.fn(() => cleanup);
    vi.doMock('../motion/createLandingMotion', () => ({ createLandingMotion }));

    const section = renderSection();
    await waitFor(() => expect(createLandingMotion).toHaveBeenCalledTimes(1));
    section.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('keeps the workflow visible when its motion module fails to load', async () => {
    const loadMotion = vi.fn(() => {
      throw new Error('motion unavailable');
    });
    vi.doMock('../motion/createLandingMotion', loadMotion);

    render(
      <MemoryRouter>
        <MotionSection />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadMotion).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('lifecycle-ribbon')).toBeVisible();
  });

  it('ignores a late motion load after unmount', async () => {
    const deferred = createDeferred<{ createLandingMotion: ReturnType<typeof vi.fn> }>();
    const createLandingMotion = vi.fn(() => vi.fn());
    const loadMotion = vi.fn(async () => await deferred.promise);
    vi.doMock('../motion/createLandingMotion', loadMotion);
    const first = renderSection();
    await waitFor(() => expect(loadMotion).toHaveBeenCalledTimes(1));
    first.unmount();

    await act(async () => {
      deferred.resolve({ createLandingMotion });
      await deferred.promise;
      await Promise.resolve();
    });
    expect(createLandingMotion).not.toHaveBeenCalled();
  });

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
    expect(region.querySelectorAll('[data-motion-frame]')).toHaveLength(2);
    expect(region.querySelector('[data-motion-frame]')).toHaveTextContent('Görev oluşturuldu');
    expect(region.querySelector('[data-motion-frame].is-active')).toHaveTextContent(
      'Bildirim akışını sadeleştir',
    );
    expect(region.querySelector('.workflow-archive')).toHaveTextContent(
      'Görev tamamlandı',
    );
    expect(region.querySelector('.workflow-archive')).toHaveTextContent('Arşivde');
    expect(region.querySelectorAll('[data-motion-word]').length).toBeGreaterThan(8);
  });

  it('exposes one inert snap anchor at the workflow center', () => {
    render(
      <MemoryRouter>
        <MotionSection />
      </MemoryRouter>,
    );

    const region = screen.getByRole('region', {
      name: /Bir görev açılır\. Herkes ne olacağını bilir\./,
    });
    const anchors = region.querySelectorAll('.workflow-snap-anchor');
    const anchor = anchors[0];

    expect(anchors).toHaveLength(1);
    expect(anchor).toHaveAttribute('aria-hidden', 'true');
    expect(anchor).toBeEmptyDOMElement();
  });
});
