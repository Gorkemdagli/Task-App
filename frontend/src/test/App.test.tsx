import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders TaskFlow heading with primary color class', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /TaskFlow/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('text-primary');
  });

  it('renders card with background token class', () => {
    const { container } = render(<App />);
    const card = container.querySelector('.bg-card');
    expect(card).toBeInTheDocument();
  });

  it('renders priority badges with token classes', () => {
    render(<App />);
    expect(screen.getByText('Yüksek')).toHaveClass('bg-priority-high');
    expect(screen.getByText('Orta')).toHaveClass('bg-priority-medium');
    expect(screen.getByText('Düşük')).toHaveClass('bg-priority-low');
  });
});
