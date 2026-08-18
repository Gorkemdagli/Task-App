import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@/hooks/tasks';
import { patchTaskCaches, restoreTaskCaches, snapshotTaskCaches } from './taskCache';
import { queryKeys } from './queryKeys';

const TENANT_ID = 'tenant-1';

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
    client.setQueryData(queryKeys.task.detail(TENANT_ID, current.id), current);
    client.setQueryData(queryKeys.tasks.list(TENANT_ID, { teamId: 'team-1' }), {
      tasks: [current, other],
      total: 2,
    });
    client.setQueryData(queryKeys.tasks.list(TENANT_ID, { status: ['done'] }), {
      tasks: [other],
      total: 1,
    });

    patchTaskCaches(client, TENANT_ID, current.id, (value) => ({ ...value, status: 'done' }));

    expect(client.getQueryData<Task>(queryKeys.task.detail(TENANT_ID, current.id))?.status).toBe(
      'done',
    );
    expect(
      client.getQueryData<{ tasks: Task[] }>(queryKeys.tasks.list(TENANT_ID, { teamId: 'team-1' }))
        ?.tasks[0].status,
    ).toBe('done');
    expect(
      client.getQueryData<{ tasks: Task[] }>(queryKeys.tasks.list(TENANT_ID, { status: ['done'] }))
        ?.tasks,
    ).toHaveLength(1);
  });

  it('removes filter-mismatched task and restores full snapshot on rollback', async () => {
    const client = new QueryClient();
    const current = task();
    client.setQueryData(queryKeys.task.detail(TENANT_ID, current.id), current);
    client.setQueryData(queryKeys.tasks.list(TENANT_ID, { status: ['todo'] }), {
      tasks: [current],
      total: 1,
    });
    const snapshot = await snapshotTaskCaches(client, TENANT_ID, current.id);

    patchTaskCaches(client, TENANT_ID, current.id, (value) => ({ ...value, status: 'done' }));
    expect(
      client.getQueryData<{ tasks: Task[] }>(queryKeys.tasks.list(TENANT_ID, { status: ['todo'] })),
    ).toEqual({
      tasks: [],
      total: 0,
    });

    restoreTaskCaches(client, TENANT_ID, current.id, snapshot);
    expect(client.getQueryData<Task>(queryKeys.task.detail(TENANT_ID, current.id))).toEqual(
      current,
    );
    expect(client.getQueryData(queryKeys.tasks.list(TENANT_ID, { status: ['todo'] }))).toEqual({
      tasks: [current],
      total: 1,
    });
  });

  it('deletes matching task without inserting into unrelated cached page', async () => {
    const client = new QueryClient();
    const current = task();
    const other = task({ id: 'task-2' });
    client.setQueryData(queryKeys.task.detail(TENANT_ID, current.id), current);
    client.setQueryData(queryKeys.tasks.list(TENANT_ID, { offset: 0 }), {
      tasks: [current],
      total: 1,
    });
    client.setQueryData(queryKeys.tasks.list(TENANT_ID, { offset: 20 }), {
      tasks: [other],
      total: 1,
    });

    patchTaskCaches(client, TENANT_ID, current.id, () => null);

    expect(client.getQueryData(queryKeys.task.detail(TENANT_ID, current.id))).toBeUndefined();
    expect(client.getQueryData(queryKeys.tasks.list(TENANT_ID, { offset: 0 }))).toEqual({
      tasks: [],
      total: 0,
    });
    expect(client.getQueryData(queryKeys.tasks.list(TENANT_ID, { offset: 20 }))).toEqual({
      tasks: [other],
      total: 1,
    });
  });
});
