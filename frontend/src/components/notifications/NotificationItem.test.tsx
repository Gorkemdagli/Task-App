import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function invitationItem(): NotificationItemType {
  return {
    id: 'invite-1',
    type: 'company_invite_accepted',
    payload: { companyName: 'Acme', actorName: 'Deniz' },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}

describe('NotificationItem', () => {
  let observerCallback: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  class MockIntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly thresholds = [0.5];
    readonly unobserve = vi.fn();

    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }

    observe = observe;
    disconnect = disconnect;
    takeRecords = () => [] as IntersectionObserverEntry[];
  }

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observe.mockClear();
    disconnect.mockClear();
  });

  function intersect(ratio: number) {
    act(() => {
      observerCallback(
        [{ isIntersecting: ratio >= 0.5, intersectionRatio: ratio } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  }

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

  it('renders invitation outcomes as passive non-button rows', () => {
    render(<NotificationItem item={invitationItem()} onSelect={vi.fn()} />);

    expect(screen.getByTestId('notification-item-invite-1')).not.toHaveAttribute('type', 'button');
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

  it('marks an unread item only after at least half remains visible for one second', async () => {
    vi.useFakeTimers();
    const onAutoRead = vi.fn();
    render(<NotificationItem item={taskItem()} onSelect={vi.fn()} onAutoRead={onAutoRead} />);

    intersect(0.49);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(onAutoRead).not.toHaveBeenCalled();

    intersect(0.5);
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(onAutoRead).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onAutoRead).toHaveBeenCalledWith('n1');
  });

  it('pauses dwell while hidden and resets it when the item leaves view', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const onAutoRead = vi.fn();
    render(<NotificationItem item={taskItem()} onSelect={vi.fn()} onAutoRead={onAutoRead} />);

    intersect(0.8);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(onAutoRead).not.toHaveBeenCalled();

    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    intersect(0.2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(onAutoRead).not.toHaveBeenCalled();

    intersect(0.9);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(onAutoRead).toHaveBeenCalledTimes(1);
  });

  it('does not observe an already-read item and disconnects after unmount', async () => {
    vi.useFakeTimers();
    const onAutoRead = vi.fn();
    const mounted = render(
      <NotificationItem
        item={taskItem({ readAt: new Date().toISOString() })}
        onSelect={vi.fn()}
        onAutoRead={onAutoRead}
      />,
    );
    expect(observe).not.toHaveBeenCalled();
    mounted.unmount();
    expect(disconnect).not.toHaveBeenCalled();

    const unread = render(<NotificationItem item={taskItem()} onSelect={vi.fn()} onAutoRead={onAutoRead} />);
    intersect(0.7);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    unread.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(onAutoRead).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
