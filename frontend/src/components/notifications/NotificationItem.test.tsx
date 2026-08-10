import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NotificationItem } from './NotificationItem';

function baseItem(
  overrides: Partial<{
    id: string;
    type: 'task_assigned' | 'task_commented' | 'message_received';
    payload: { taskId: string; taskTitle: string; actorId?: string; actorName?: string };
    readAt: string | null;
    createdAt: string;
  }> = {},
) {
  return {
    id: 'n1',
    type: 'task_assigned' as const,
    payload: { taskId: 't1', taskTitle: 'Login fix', actorName: 'Ali' },
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('NotificationItem', () => {
  it('renders the formatted text for task_assigned', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NotificationItem item={baseItem()} onNavigate={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Ali sana yeni bir görev atadı: Login fix/)).toBeInTheDocument();
  });

  it('renders the formatted text for task_commented', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NotificationItem
          item={baseItem({
            type: 'task_commented',
            payload: { taskId: 't1', taskTitle: 'Deploy', actorName: 'Selin Demir' },
          })}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Selin Demir göreve yorum ekledi/i)).toBeInTheDocument();
  });

  it('calls onNavigate with task id when clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NotificationItem item={baseItem()} onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('t1');
  });

  it('shows unread stripe when readAt is null', () => {
    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NotificationItem item={baseItem({ readAt: null })} onNavigate={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container.querySelector('.bg-primary')).toBeTruthy();
  });

  it('hides unread stripe when readAt is set', () => {
    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NotificationItem
          item={baseItem({ readAt: new Date().toISOString() })}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('.bg-primary')).toBeFalsy();
  });
});
