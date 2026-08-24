import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FeaturesSection } from './FeaturesSection';

describe('FeaturesSection', () => {
  it('fills the approved 12 by 2 bento without an empty cell', () => {
    render(<FeaturesSection />);
    const grid = screen.getByTestId('feature-bento');
    const cards = within(grid).getAllByRole('article');

    expect(grid).toHaveClass('grid-flow-dense');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute('data-grid-cells', '14');
    expect(cards[1]).toHaveAttribute('data-grid-cells', '5');
    expect(cards[2]).toHaveAttribute('data-grid-cells', '5');
    expect(cards.reduce((sum, card) => sum + Number(card.dataset.gridCells), 0)).toBe(24);
  });

  it('exposes one role panel at a time to pointer and keyboard users', async () => {
    const user = userEvent.setup();
    render(<FeaturesSection />);
    const member = screen.getByRole('button', { name: 'Üye' });
    const companyAdmin = screen.getByRole('button', { name: 'Şirket Admini' });

    expect(member).toHaveAttribute('aria-expanded', 'true');
    await user.click(companyAdmin);
    expect(member).toHaveAttribute('aria-expanded', 'false');
    expect(companyAdmin).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Şirket Admini' })).toBeVisible();
  });

  it('renders one accessible product-principle list', () => {
    render(<FeaturesSection />);
    const list = screen.getByRole('list', { name: 'TaskFlow ürün prensipleri' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getAllByText('Tenant sınırı')).toHaveLength(2);
  });
});
