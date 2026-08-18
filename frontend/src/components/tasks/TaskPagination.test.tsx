import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskPagination } from './TaskPagination';

describe('TaskPagination', () => {
  it('disables previous and next at the boundaries', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <TaskPagination page={1} totalPages={3} onPageChange={onPageChange} />,
    );

    expect(screen.getByRole('button', { name: /önceki/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /sonraki/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sayfa 1' })).toHaveAttribute('aria-current', 'page');

    rerender(<TaskPagination page={3} totalPages={3} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: /sonraki/i })).toBeDisabled();
  });

  it('emits selected page and uses unique ellipsis items', () => {
    const onPageChange = vi.fn();
    render(<TaskPagination page={5} totalPages={12} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sayfa 6' }));

    expect(onPageChange).toHaveBeenCalledWith(6);
    expect(screen.getAllByText('…')).toHaveLength(2);
  });
});
