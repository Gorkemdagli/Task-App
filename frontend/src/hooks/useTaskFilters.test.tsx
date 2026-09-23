import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, useTaskFilters } from './useTaskFilters';

function renderFilters(initialEntry = '/tasks') {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  }

  return renderHook(() => {
    const filters = useTaskFilters();
    return { ...filters, search: useLocation().search };
  }, { wrapper: Wrapper });
}

describe('useTaskFilters', () => {
  it('reads supported filters and page from the URL', () => {
    const { result } = renderFilters(
      '/tasks?status=todo,in_progress&priority=high&teamId=team-a&assigneeIds=user-1,user-2&deadline=week&deadlineFrom=2026-09-01&deadlineTo=2026-09-07&includeArchived=true&page=3',
    );

    expect(result.current.filters).toEqual({
      status: ['todo', 'in_progress'],
      priority: ['high'],
      teamId: 'team-a',
      assigneeIds: ['user-1', 'user-2'],
      deadline: 'week',
      deadlineFrom: '2026-09-01',
      deadlineTo: '2026-09-07',
      includeArchived: true,
      page: 3,
    });
  });

  it('writes filter updates with page reset, changes page, and clears the URL on reset', async () => {
    const { result } = renderFilters('/tasks?page=4&teamId=team-a');

    act(() => result.current.updateFilters({ ...EMPTY_FILTERS, status: ['done'], page: 4 }));
    await waitFor(() => expect(result.current.search).toBe('?status=done'));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.search).toBe('?status=done&page=2'));

    act(() => result.current.resetFilters());
    await waitFor(() => expect(result.current.search).toBe(''));
    expect(result.current.filters).toEqual(EMPTY_FILTERS);
  });

  it.each(['0', '-2', '1.5', '9007199254740992', 'bad'])('uses page 1 for malformed page=%s', (page) => {
    const { result } = renderFilters(`/tasks?page=${encodeURIComponent(page)}`);
    expect(result.current.filters.page).toBe(1);
  });

  it('clamps a non-positive page update to the default page', async () => {
    const { result } = renderFilters('/tasks?page=3');

    act(() => result.current.setPage(0));

    await waitFor(() => expect(result.current.filters.page).toBe(1));
    expect(result.current.search).toBe('');
  });
});
