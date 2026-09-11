import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ActiveFilterChips, FilterBar } from './FilterBar';

function renderWithUrl(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <FilterBar teams={[{ id: 'team-1', name: 'UX' }]} />
    </MemoryRouter>,
  );
}

function renderWithUserFilter(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <FilterBar teams={[{ id: 'team-1', name: 'UX' }]} currentUserId="user-1" />
      <ActiveFilterChips teams={[{ id: 'team-1', name: 'UX' }]} currentUserId="user-1" />
    </MemoryRouter>,
  );
}

function renderWithAssignees() {
  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <FilterBar
        assignees={[
          { id: 'user-1', fullName: 'Ada' },
          { id: 'user-2', fullName: 'Bora' },
          { id: 'user-3', fullName: 'Cem' },
          { id: 'user-4', fullName: 'Derya' },
          { id: 'user-5', fullName: 'Ece' },
        ]}
        currentUserId="user-1"
      />
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
    await waitFor(() => expect(todoChip.dataset.active).toBe('true'));
    await user.click(todoChip);
    await waitFor(() => expect(todoChip.dataset.active).toBe('false'));
  });

  it('toggles priority chips', async () => {
    const user = userEvent.setup();
    renderWithUrl('/tasks');
    const high = screen.getByTestId('filter-priority-high') as HTMLButtonElement;
    await user.click(high);
    await waitFor(() => expect(high.dataset.active).toBe('true'));
  });

  it('selects deadline range', async () => {
    const user = userEvent.setup();
    renderWithUrl('/tasks');
    const week = screen.getByTestId('filter-deadline-week') as HTMLButtonElement;
    await user.click(week);
    await waitFor(() => expect(week.dataset.active).toBe('true'));
  });

  it('renders the filter rail and removable active filters', async () => {
    const user = userEvent.setup();
    renderWithUserFilter('/tasks?priority=high&assigneeIds=user-1');

    expect(screen.getByTestId('task-filter-rail')).toBeInTheDocument();
    expect(screen.getByTestId('active-filter-priority-high')).toBeInTheDocument();
    expect(screen.getByTestId('active-filter-assignee-user-1')).toBeInTheDocument();

    await user.click(screen.getByTestId('remove-filter-priority-high'));

    await waitFor(() =>
      expect(screen.queryByTestId('active-filter-priority-high')).not.toBeInTheDocument(),
    );
  });

  it('shows three named assignees and expands the remaining users downward', async () => {
    const user = userEvent.setup();
    renderWithAssignees();

    expect(screen.getByTestId('filter-assignee-current-user')).toBeInTheDocument();
    expect(screen.getByTestId('filter-assignee-user-2')).toBeInTheDocument();
    expect(screen.getByTestId('filter-assignee-user-3')).toBeInTheDocument();
    expect(screen.getByTestId('filter-assignee-user-4')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-assignee-user-5')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Daha fazlası' }));

    expect(screen.getByTestId('filter-assignee-user-5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daha azı' })).toBeInTheDocument();
  });
});
