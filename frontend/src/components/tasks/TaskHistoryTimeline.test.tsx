import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskHistoryItem } from '@/hooks/tasks';
import { TaskHistoryTimeline } from './TaskHistoryTimeline';

const fetchNextPageMock = vi.fn();
let query: {
  data: { pages: Array<{ items: TaskHistoryItem[] }> };
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
} = { data: { pages: [{ items: [] }] }, hasNextPage: false, isFetchingNextPage: false };

vi.mock('@/hooks/tasks', () => ({
  useTaskHistory: () => ({ ...query, fetchNextPage: fetchNextPageMock, isLoading: false }),
}));

const historyItem = (overrides: Partial<TaskHistoryItem> = {}): TaskHistoryItem => ({
  id: 'event-1',
  eventType: 'status_changed',
  createdAt: '2026-09-20T13:45:00.000Z',
  actor: { id: 'u1', name: 'Ada' },
  metadata: {},
  ...overrides,
});

describe('TaskHistoryTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query = { data: { pages: [{ items: [] }] }, hasNextPage: false, isFetchingNextPage: false };
  });

  it('renders Turkish event copy, timestamp, and stable actor fallback without comments', () => {
    query = {
      data: {
        pages: [
          {
            items: [
              historyItem({ eventType: 'priority_changed' }),
              historyItem({ id: 'event-2', eventType: 'comment_added' }),
              historyItem({ id: 'event-3', eventType: 'file_added', actor: null }),
            ],
          },
        ],
      },
      hasNextPage: false,
      isFetchingNextPage: false,
    };
    render(<TaskHistoryTimeline taskId="task-1" />);

    expect(screen.getByText('Öncelik güncellendi')).toBeInTheDocument();
    expect(screen.getAllByText(/20 Eyl.*16:45/)).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Görev geçmişi' })).toHaveTextContent('Sistem');
    expect(screen.queryByText(/Yorum/i)).not.toBeInTheDocument();
  });

  it('labels the scroll region and fetches the next cursor page', async () => {
    query = {
      data: { pages: [{ items: [historyItem()] }] },
      hasNextPage: true,
      isFetchingNextPage: false,
    };
    render(<TaskHistoryTimeline taskId="task-1" />);
    const user = userEvent.setup();

    expect(screen.getByRole('region', { name: 'Görev geçmişi' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Daha fazla yükle' }));
    expect(fetchNextPageMock).toHaveBeenCalledTimes(1);
  });
});
