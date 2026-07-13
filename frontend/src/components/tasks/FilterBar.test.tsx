import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FilterBar } from './FilterBar';

function renderWithUrl(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <FilterBar teams={[{ id: 'team-1', name: 'UX' }]} />
    </MemoryRouter>,
  );
}

describe('FilterBar URL sync', () => {
  beforeEach(() => {
    // useSearchParams needs Location; MemoryRouter handles it
  });

  it('reads status filter from initial URL', () => {
    renderWithUrl('/tasks?status=todo,in_progress');
    const todoChip = screen.getByTestId('filter-status-todo') as HTMLButtonElement;
    const inProgressChip = screen.getByTestId('filter-status-in_progress') as HTMLButtonElement;
    const doneChip = screen.getByTestId('filter-status-done') as HTMLButtonElement;
    expect(todoChip.dataset.active).toBe('true');
    expect(inProgressChip.dataset.active).toBe('true');
    expect(doneChip.dataset.active).toBe('false');
  });

  it('toggles status chips', async () => {
    const user = userEvent.setup();
    renderWithUrl('/tasks');
    const todoChip = screen.getByTestId('filter-status-todo') as HTMLButtonElement;
    expect(todoChip.dataset.active).toBe('false');
    await user.click(todoChip);
    expect(todoChip.dataset.active).toBe('true');
    await user.click(todoChip);
    expect(todoChip.dataset.active).toBe('false');
  });

  it('toggles priority chips', async () => {
    const user = userEvent.setup();
    renderWithUrl('/tasks');
    const high = screen.getByTestId('filter-priority-high') as HTMLButtonElement;
    await user.click(high);
    expect(high.dataset.active).toBe('true');
  });

  it('selects deadline range', async () => {
    const user = userEvent.setup();
    renderWithUrl('/tasks');
    const week = screen.getByTestId('filter-deadline-week') as HTMLButtonElement;
    await user.click(week);
    expect(week.dataset.active).toBe('true');
  });
});
