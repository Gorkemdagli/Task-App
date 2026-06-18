import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/ui/button';

describe('Button', () => {
  it('renders with default primary variant', () => {
    render(<Button>Tıkla</Button>);
    const button = screen.getByRole('button', { name: /Tıkla/i });
    expect(button).toHaveClass('bg-primary');
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">İptal</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-secondary');
  });

  it('renders destructive variant', () => {
    render(<Button variant="destructive">Sil</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-priority-high');
  });

  it('shows loading state with spinner', () => {
    render(<Button loading>Yükleniyor</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button.querySelector('span[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Tıkla</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Pasif</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
