import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeaturesSection } from './FeaturesSection';

describe('FeaturesSection', () => {
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

  it('fills the approved 12 by 2 bento without an empty cell', () => {
    render(<FeaturesSection />);
    const grid = screen.getByTestId('feature-bento');
    const cards = within(grid).getAllByRole('article');

    expect(grid).toHaveClass('grid-flow-dense');
    expect(grid).toHaveClass('md:grid-cols-2', 'lg:grid-cols-12');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveClass('md:col-span-2', 'lg:col-span-7', 'lg:row-span-2');
    expect(cards[0]).toHaveAttribute('data-grid-cells', '14');
    expect(cards[1]).toHaveAttribute('data-grid-cells', '5');
    expect(cards[2]).toHaveAttribute('data-grid-cells', '5');
    expect(cards.reduce((sum, card) => sum + Number(card.dataset.gridCells), 0)).toBe(24);
  });

  it('keeps the editorial heading focused and removes the redundant principle and role blocks', () => {
    render(<FeaturesSection />);
    expect(screen.queryByText('Üç sabit durum')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Üye' })).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'İşi görünür kılan üç davranış. Fazladan görünüm veya süreç yükü olmadan.',
      ),
    ).not.toBeInTheDocument();
  });

  it('marks the two right-side cards for sequential scroll reveals', () => {
    render(<FeaturesSection />);
    const grid = screen.getByTestId('feature-bento');
    expect(grid.querySelectorAll('[data-feature-reveal]')).toHaveLength(2);
  });

  it('presents task updates inside a recognizable compact chatbox', () => {
    const { container } = render(<FeaturesSection />);
    const chatbox = container.querySelector('.landing-chatbox');

    expect(chatbox).toHaveTextContent('Görev sohbeti');
    expect(chatbox?.querySelectorAll('.landing-message-bubble')).toHaveLength(2);
    expect(chatbox).toHaveTextContent('Termin netleşti.');
    expect(chatbox).toHaveTextContent('Bağımlılık çözüldü.');
  });
});
