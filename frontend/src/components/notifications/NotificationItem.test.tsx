import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationItem } from './NotificationItem';
import type { NotificationItem as NotificationItemType } from '@/hooks/useNotifications';

function taskItem(overrides: Partial<NotificationItemType> = {}): NotificationItemType {
  return {
    id: 'n1',
    type: 'task_assigned',
    payload: { taskId: 't1', taskTitle: 'Login fix', actorName: 'Ali' },
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as NotificationItemType;
}

function messageItem(): NotificationItemType {
  return {
    id: 'm1',
    type: 'message_received',
    payload: { actorName: 'Mert Kaya' },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}

describe('NotificationItem', () => {
  it('renders task notification as button and selects whole item', async () => {
    const onSelect = vi.fn();
    const item = taskItem();
    render(<NotificationItem item={item} onSelect={onSelect} />);

    await userEvent.click(screen.getByTestId('notification-item-n1'));
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it('renders message_received as passive non-button row', () => {
    render(<NotificationItem item={messageItem()} onSelect={vi.fn()} />);

    expect(screen.getByTestId('notification-item-m1')).not.toHaveAttribute('type', 'button');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows unread stripe only for unread item', () => {
    const { container, rerender } = render(
      <NotificationItem item={taskItem()} onSelect={vi.fn()} />,
    );
    expect(container.querySelector('.bg-primary')).toBeTruthy();
    rerender(
      <NotificationItem item={taskItem({ readAt: new Date().toISOString() })} onSelect={vi.fn()} />,
    );
    expect(container.querySelector('.bg-primary')).toBeFalsy();
  });
});
