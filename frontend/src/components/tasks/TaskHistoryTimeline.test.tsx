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

  it('keeps long histories in a bounded, internally scrollable region', () => {
    query = {
      data: { pages: [{ items: Array.from({ length: 6 }, (_, index) => historyItem({ id: `event-${index}` })) }] },
      hasNextPage: false,
      isFetchingNextPage: false,
    };
    const resizeObserver = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal('ResizeObserver', class {
      observe = resizeObserver.observe;
      disconnect = resizeObserver.disconnect;
      constructor(_callback: ResizeObserverCallback) {}
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'OL') return { top: 100 } as DOMRect;
      if (this.tagName === 'LI' && this.parentElement?.children[4] === this) {
        return { bottom: 380 } as DOMRect;
      }
      return { top: 100, bottom: 120 } as DOMRect;
    });
    render(<TaskHistoryTimeline taskId="task-1" />);

    const historyRegion = screen.getByRole('region', { name: 'Görev geçmişi' });
    expect(historyRegion).toHaveClass('max-h-[var(--history-mobile-height)]', 'overflow-y-auto', 'overscroll-contain');
    expect(screen.getAllByText('Durum güncellendi')).toHaveLength(6);
    expect(historyRegion).toHaveStyle({ '--history-mobile-height': '280px' });
    vi.unstubAllGlobals();
  });

  it('does not constrain a history of five events', () => {
    query = {
      data: { pages: [{ items: Array.from({ length: 5 }, (_, index) => historyItem({ id: `event-${index}` })) }] },
      hasNextPage: false,
      isFetchingNextPage: false,
    };
    render(<TaskHistoryTimeline taskId="task-1" />);

    const historyRegion = screen.getByRole('region', { name: 'Görev geçmişi' });
    expect(historyRegion).not.toHaveClass('overflow-y-auto', 'overscroll-contain');
    expect((historyRegion as HTMLElement).style.maxHeight).toBe('');
  });
});
