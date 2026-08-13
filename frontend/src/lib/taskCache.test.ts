import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@/hooks/tasks';
import { patchTaskCaches, restoreTaskCaches, snapshotTaskCaches } from './taskCache';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task',
    description: null,
    status: 'todo',
    priority: 'medium',
    deadline: '2026-08-13',
    archivedAt: null,
    teamId: 'team-1',
    assignerId: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    pendingStatus: null,
    pendingVersion: 0,
    pendingProposedBy: null,
    pendingProposedAt: null,
    pendingProposer: null,
    statusAcks: [],
    team: { id: 'team-1', name: 'Team', tenantId: 'tenant-1' },
    assigner: { id: 'user-1', displayId: 'AAAAA', fullName: 'User', avatarUrl: null },
    assignees: [
      {
        userId: 'user-1',
        assignedAt: '2026-08-01T00:00:00.000Z',
        user: { id: 'user-1', displayId: 'AAAAA', fullName: 'User', avatarUrl: null },
      },
    ],
    ...overrides,
  };
}

describe('task cache helpers', () => {
  it('patches detail and every cached list containing task', async () => {
    const client = new QueryClient();
    const current = task();
    const other = task({ id: 'task-2', title: 'Other' });
    client.setQueryData(['task', current.id], current);
    client.setQueryData(['tasks', { teamId: 'team-1' }], { tasks: [current, other], total: 2 });
    client.setQueryData(['tasks', { status: ['done'] }], { tasks: [other], total: 1 });

    patchTaskCaches(client, current.id, (value) => ({ ...value, status: 'done' }));

    expect(client.getQueryData<Task>(['task', current.id])?.status).toBe('done');
    expect(
      client.getQueryData<{ tasks: Task[] }>(['tasks', { teamId: 'team-1' }])?.tasks[0].status,
    ).toBe('done');
    expect(
      client.getQueryData<{ tasks: Task[] }>(['tasks', { status: ['done'] }])?.tasks,
    ).toHaveLength(1);
  });

  it('removes filter-mismatched task and restores full snapshot on rollback', async () => {
    const client = new QueryClient();
    const current = task();
    client.setQueryData(['task', current.id], current);
    client.setQueryData(['tasks', { status: ['todo'] }], { tasks: [current], total: 1 });
    const snapshot = await snapshotTaskCaches(client, current.id);

    patchTaskCaches(client, current.id, (value) => ({ ...value, status: 'done' }));
    expect(client.getQueryData<{ tasks: Task[] }>(['tasks', { status: ['todo'] }])).toEqual({
      tasks: [],
      total: 0,
    });

    restoreTaskCaches(client, current.id, snapshot);
    expect(client.getQueryData<Task>(['task', current.id])).toEqual(current);
    expect(client.getQueryData(['tasks', { status: ['todo'] }])).toEqual({
      tasks: [current],
      total: 1,
    });
  });

  it('deletes matching task without inserting into unrelated cached page', async () => {
    const client = new QueryClient();
    const current = task();
    const other = task({ id: 'task-2' });
    client.setQueryData(['task', current.id], current);
    client.setQueryData(['tasks', { page: 1 }], { tasks: [current], total: 1 });
    client.setQueryData(['tasks', { page: 2 }], { tasks: [other], total: 1 });

    patchTaskCaches(client, current.id, () => null);

    expect(client.getQueryData(['task', current.id])).toBeUndefined();
    expect(client.getQueryData(['tasks', { page: 1 }])).toEqual({ tasks: [], total: 0 });
    expect(client.getQueryData(['tasks', { page: 2 }])).toEqual({ tasks: [other], total: 1 });
  });
});
