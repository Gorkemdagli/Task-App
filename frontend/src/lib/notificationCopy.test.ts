import { describe, expect, it } from 'vitest';
import { notificationCopy, notificationActorInitials } from './notificationCopy';

describe('notificationCopy', () => {
  it('formats task_assigned with actor name', () => {
    const text = notificationCopy({
      type: 'task_assigned',
      payload: { taskId: 't1', taskTitle: 'Login fix', actorName: 'Ali' },
    });
    expect(text).toBe('Ali sana yeni bir görev atadı: Login fix');
  });

  it('formats task_assigned without actor (fallback)', () => {
    const text = notificationCopy({
      type: 'task_assigned',
      payload: { taskId: 't1', taskTitle: 'Login fix' },
    });
    expect(text).toBe('Yeni bir görev atandı: Login fix');
  });

  it('formats task_commented with actor name', () => {
    const text = notificationCopy({
      type: 'task_commented',
      payload: { taskId: 't1', taskTitle: 'Login fix', actorName: 'Selin' },
    });
    expect(text).toBe('Selin göreve yorum ekledi');
  });

  it('formats task_commented without actor (fallback)', () => {
    const text = notificationCopy({
      type: 'task_commented',
      payload: { taskId: 't1', taskTitle: 'Login fix' },
    });
    expect(text).toBe('Göreve yeni bir yorum eklendi');
  });
});

describe('notificationActorInitials', () => {
  it('returns initials of full name', () => {
    expect(notificationActorInitials('Ali Yılmaz')).toBe('AY');
  });

  it('returns single initial for single name', () => {
    expect(notificationActorInitials('Ali')).toBe('A');
  });

  it('returns "?" for null/empty', () => {
    expect(notificationActorInitials(null)).toBe('?');
    expect(notificationActorInitials('')).toBe('?');
  });
});
