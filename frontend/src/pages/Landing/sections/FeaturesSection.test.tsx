import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeaturesSection } from './FeaturesSection';

describe('FeaturesSection', () => {
  function renderFeatures() {
    return render(
      <MemoryRouter>
        <FeaturesSection />
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the central task context composition from design1', () => {
    renderFeatures();
    const map = screen.getByTestId('context-tether');

    expect(
      screen.getByRole('heading', { name: /İş ilerler\. Bağlam yanında kalır\./ }),
    ).toBeVisible();
    expect(map).toHaveClass('landing-context-tether');
    expect(map.querySelector('.landing-context-task')).toHaveTextContent(
      'Bildirim akışını sadeleştir',
    );
    expect(map.querySelectorAll('[data-context-node]')).toHaveLength(4);
    expect(map.querySelector('.landing-context-conversation')).toHaveTextContent('Konuşma');
    expect(map.querySelector('.landing-context-permission')).toHaveTextContent('Yetki');
  });

  it('keeps the selected composition free of invented proof claims', () => {
    renderFeatures();
    expect(screen.queryByText(/müşteri|kullanıcı sayısı|%/i)).not.toBeInTheDocument();
  });

  it('marks context nodes for sequential scroll reveals', () => {
    renderFeatures();
    expect(
      screen.getByTestId('feature-bento').querySelectorAll('[data-feature-reveal]'),
    ).toHaveLength(4);
  });

  it('keeps the task context tethered to its working details', () => {
    renderFeatures();
    const tether = screen.getByTestId('context-tether');

    expect(tether).toHaveClass('landing-context-tether');
    expect(tether).toHaveTextContent('Bildirim akışını sadeleştir');
    expect(tether).toHaveTextContent('Sorumlu');
    expect(tether).toHaveTextContent('Takım');
    expect(tether).toHaveTextContent('Yetki');
    expect(tether).toHaveTextContent('Termin');
  });

  it('connects the central task to every surrounding context node', () => {
    renderFeatures();
    const connectors = screen.getByTestId('context-connectors');

    expect(
      Array.from(connectors.querySelectorAll('[data-connection]')).map((path) =>
        path.getAttribute('data-connection'),
      ),
    ).toEqual(['owner', 'team', 'conversation', 'permission', 'deadline', 'annotation']);
  });

  it('routes every desktop connector beneath the cards without visible gaps', () => {
    renderFeatures();
    const connectors = screen.getByTestId('context-connectors');

    expect(
      Object.fromEntries(
        Array.from(connectors.querySelectorAll('[data-connection]')).map((path) => [
          path.getAttribute('data-connection'),
          path.getAttribute('d'),
        ]),
      ),
    ).toMatchObject({
      owner: 'M232 88 H252 Q272 88 272 108 V170',
      team: 'M448 170 V112 Q448 88 472 88 H520',
      conversation: 'M504 288 H520 Q536 288 544 304 Q548 312 560 312',
      permission: 'M164 340 V402 Q164 422 144 422 H122 Q102 422 102 442 V480',
      deadline: 'M384 340 V402 Q384 422 404 422 H428 Q448 422 448 442 V480',
    });
  });
});
