import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TaskCard } from './TaskCard';
import type { Task } from '@/hooks/tasks';
import { addCalendarDays, utcTodayCalendarDate } from '@/lib/calendarDate';

const baseTask: Task = {
  id: 't1',
  title: 'Login bug',
  description: 'Mobil tarafta hata var',
  status: 'todo',
  priority: 'high',
  deadline: '2099-01-02',
  archivedAt: null,
  teamId: 'team-1',
  assignerId: 'u1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  pendingStatus: null,
  pendingVersion: 0,
  pendingProposedBy: null,
  pendingProposedAt: null,
  pendingProposer: null,
  statusAcks: [],
  team: { id: 'team-1', name: 'UX', tenantId: 'tnt-1' },
  assigner: { id: 'u1', displayId: 'AAAAA', fullName: 'Ali Yılmaz', avatarUrl: null },
  assignees: [
    {
      userId: 'u2',
      assignedAt: new Date().toISOString(),
      user: { id: 'u2', displayId: 'BBBBB', fullName: 'Selin Demir', avatarUrl: null },
    },
  ],
};

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('TaskCard', () => {
  it('renders title and priority badge', () => {
    render(
      <Wrap>
        <TaskCard task={baseTask} />
      </Wrap>,
    );
    expect(screen.getByText('Login bug')).toBeInTheDocument();
    expect(screen.getByText('Yüksek')).toBeInTheDocument();
  });

  it('shows assignee name', () => {
    render(
      <Wrap>
        <TaskCard task={baseTask} />
      </Wrap>,
    );
    expect(screen.getByText('Selin Demir')).toBeInTheDocument();
  });

  it('uses the shared overlapping avatar stack treatment', () => {
    const { container } = render(
      <Wrap>
        <TaskCard task={baseTask} />
      </Wrap>,
    );

    const avatarTrigger = container.querySelector('[title="Selin Demir"]');
    expect(avatarTrigger).toHaveClass('relative', 'hover:z-10');
    expect(avatarTrigger?.firstElementChild).toHaveClass(
      'border-2',
      'border-background',
      'transition-all',
      'hover:scale-105',
      'hover:-translate-y-1',
    );
  });

  it('dimension lazy-loaded assignee avatar', () => {
    const originalImage = window.Image;
    Object.defineProperty(window, 'Image', {
      configurable: true,
      value: class MockImage {
        complete = true;
        naturalWidth = 1;
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      },
    });

    try {
      render(
        <Wrap>
          <TaskCard
            task={{
              ...baseTask,
              assignees: [
                {
                  ...baseTask.assignees[0],
                  user: { ...baseTask.assignees[0].user, avatarUrl: '/avatar.png' },
                },
              ],
            }}
          />
        </Wrap>,
      );
      expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
      expect(screen.getByRole('img')).toHaveAttribute('decoding', 'async');
      expect(screen.getByRole('img')).toHaveAttribute('width', '24');
      expect(screen.getByRole('img')).toHaveAttribute('height', '24');
    } finally {
      Object.defineProperty(window, 'Image', { configurable: true, value: originalImage });
    }
  });

  it('uses priority border class for high', () => {
    const { container } = render(
      <Wrap>
        <TaskCard task={baseTask} />
      </Wrap>,
    );
    const card = container.querySelector('[data-testid="task-card-t1"]');
    expect(card?.className).toContain('border-l-priority-high');
  });

  it('uses priority border class for low', () => {
    render(
      <Wrap>
        <TaskCard task={{ ...baseTask, priority: 'low' }} />
      </Wrap>,
    );
    const card = document.querySelector('[data-testid="task-card-t1"]');
    expect(card?.className).toContain('border-l-priority-low');
  });

  it('uses priority border class for medium', () => {
    render(
      <Wrap>
        <TaskCard task={{ ...baseTask, priority: 'medium' }} />
      </Wrap>,
    );
    const card = document.querySelector('[data-testid="task-card-t1"]');
    expect(card?.className).toContain('border-l-priority-medium');
  });

  it('links to /tasks/:id', () => {
    render(
      <Wrap>
        <TaskCard task={baseTask} />
      </Wrap>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/tasks/t1');
  });

  it('renders overdue indicator when deadline passed and status not done', () => {
    const past = '2020-01-01';
    const { container } = render(
      <Wrap>
        <TaskCard task={{ ...baseTask, deadline: past }} />
      </Wrap>,
    );
    expect(container.textContent).toMatch(/geçti/);
  });

  it('does not apply overdue styling when status is done', () => {
    const past = '2020-01-01';
    const { container } = render(
      <Wrap>
        <TaskCard task={{ ...baseTask, status: 'done', deadline: past }} />
      </Wrap>,
    );
    // Deadline text her zaman görünür; "overdue" stili (priority-high font) uygulanmamalı.
    const overdueSpan = container.querySelector('.text-priority-high.font-medium');
    expect(overdueSpan).toBeNull();
  });

  it('renders em-dash when no deadline', () => {
    const { container } = render(
      <Wrap>
        <TaskCard task={{ ...baseTask, deadline: null }} />
      </Wrap>,
    );
    expect(container.textContent).toContain('—');
  });

  it('formats future deadline as Yarın or Bugün', () => {
    const tomorrow = addCalendarDays(utcTodayCalendarDate(), 1);
    const { container } = render(
      <Wrap>
        <TaskCard task={{ ...baseTask, deadline: tomorrow }} />
      </Wrap>,
    );
    expect(container.textContent).toMatch(/Yarın|Bugün/);
  });

  it('hides pending badge and yellow styling when current user is proposer', () => {
    const pendingTask = {
      ...baseTask,
      pendingStatus: 'in_progress' as const,
      pendingProposer: {
        id: 'u2',
        displayId: 'BBBBB',
        fullName: 'Selin Demir',
        avatarUrl: null,
      },
    };
    const { container } = render(
      <Wrap>
        <TaskCard task={pendingTask} currentUserId="u2" />
      </Wrap>,
    );
    const card = container.querySelector('[data-testid="task-card-t1"]');
    expect(card?.getAttribute('data-pending')).not.toBe('true');
    expect(card?.className).not.toContain('border-yellow-500');
    expect(container.textContent).not.toMatch(/Onay Bekliyor/);
  });

  it('shows pending badge and yellow styling when current user is not proposer', () => {
    const pendingTask = {
      ...baseTask,
      pendingStatus: 'in_progress' as const,
      pendingProposer: {
        id: 'u2',
        displayId: 'BBBBB',
        fullName: 'Selin Demir',
        avatarUrl: null,
      },
    };
    const { container } = render(
      <Wrap>
        <TaskCard task={pendingTask} currentUserId="u-other" />
      </Wrap>,
    );
    const card = container.querySelector('[data-testid="task-card-t1"]');
    expect(card?.getAttribute('data-pending')).toBe('true');
    expect(card?.className).toContain('border-yellow-500');
    expect(container.textContent).toMatch(/Onay Bekliyor/);
  });

  it('keeps pending task link accessible when drag is disabled', () => {
    const pendingTask = {
      ...baseTask,
      pendingStatus: 'in_progress' as const,
      pendingProposer: {
        id: 'u2',
        displayId: 'BBBBB',
        fullName: 'Selin Demir',
        avatarUrl: null,
      },
    };
    const { container } = render(
      <Wrap>
        <TaskCard task={pendingTask} currentUserId="u-other" draggable />
      </Wrap>,
    );

    const card = container.querySelector('[data-testid="task-card-t1"]');
    expect(card).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps drag attributes on non-pending draggable tasks', () => {
    const { container } = render(
      <Wrap>
        <TaskCard task={baseTask} draggable />
      </Wrap>,
    );

    const card = container.querySelector('[data-testid="task-card-t1"]');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');
  });
});
