import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotificationBadge } from './NotificationBadge';

describe('NotificationBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<NotificationBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders exact count for 1..9', () => {
    render(<NotificationBadge count={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders "9+" for count >= 10', () => {
    render(<NotificationBadge count={42} />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('has aria-label for screen readers', () => {
    render(<NotificationBadge count={3} />);
    expect(screen.getByLabelText('3 okunmamış bildirim')).toBeInTheDocument();
  });
});
