import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import { getCompanyDashboard } from './company-dashboard.service';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-08-20T12:00:00.000Z');
const admin: Actor = { id: 'admin-a', role: 'companyAdmin', tenantId: 'tenant-a' };
const member: Actor = { id: 'member-a', role: 'member', tenantId: 'tenant-a' };

const db = {
  team: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
} as unknown as TenantDb;

function memberRow(index: number) {
  return {
    user_id: `user-${index}`,
    full_name: `User ${String(index).padStart(3, '0')}`,
    assigned_task_count: index === 0 ? 3n : 0n,
    open_task_count: index === 0 ? 2n : 0n,
    completed_task_count: index === 0 ? 1n : 0n,
    expired_task_count: index === 0 ? 1n : 0n,
    total_user_count: 101n,
  };
}

const summaryRow = {
  total_task_count: 10n,
  open_task_count: 6n,
  completed_task_count: 4n,
  expired_task_count: 2n,
  overdue_task_count: 3n,
  due_next_seven_days_task_count: 4n,
  pending_approval_task_count: 1n,
  status_total: 8n,
  status_todo: 2n,
  status_in_progress: 3n,
  status_done: 3n,
  priority_total: 5n,
  priority_low: 1n,
  priority_medium: 1n,
  priority_high: 3n,
};

describe('getCompanyDashboard', () => {
  beforeEach(() => {
    vi.mocked(db.team.findFirst).mockReset();
    vi.mocked(db.$queryRaw).mockReset();
  });

  it('blocks non-company-admin before querying', async () => {
    await expect(getCompanyDashboard(db, member, {}, now)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a foreign team before aggregate queries', async () => {
    vi.mocked(db.team.findFirst).mockResolvedValue(null);

    await expect(getCompanyDashboard(db, admin, { teamId: TEAM_ID }, now)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('maps all-scope aggregates, rounds percentages, and caps members', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([summaryRow])
      .mockResolvedValueOnce(Array.from({ length: 101 }, (_, index) => memberRow(index)))
      .mockResolvedValueOnce([
        {
          team_id: 'team-a',
          team_name: 'Alpha',
          total_task_count: 3n,
          open_task_count: 2n,
          completed_task_count: 1n,
          expired_task_count: 1n,
        },
        {
          team_id: 'team-b',
          team_name: 'Beta',
          total_task_count: 0n,
          open_task_count: 0n,
          completed_task_count: 0n,
          expired_task_count: 0n,
        },
      ]);

    const result = await getCompanyDashboard(db, admin, {}, now);

    expect(result.scope).toEqual({ teamId: null, teamName: null });
    expect(result.summary).toEqual({
      totalUserCount: 101,
      totalTaskCount: 10,
      openTaskCount: 6,
      completedTaskCount: 4,
      expiredTaskCount: 2,
      completionRate: 40,
    });
    expect(result.risk).toEqual({
      overdueTaskCount: 3,
      dueNextSevenDaysTaskCount: 4,
      pendingApprovalTaskCount: 1,
      expiredTaskCount: 2,
    });
    expect(result.statusBreakdown).toEqual({
      total: 8,
      todo: { count: 2, percentage: 25 },
      inProgress: { count: 3, percentage: 38 },
      done: { count: 3, percentage: 38 },
    });
    expect(result.priorityBreakdown).toEqual({
      total: 5,
      low: { count: 1, percentage: 20 },
      medium: { count: 1, percentage: 20 },
      high: { count: 3, percentage: 60 },
    });
    expect(result.members).toMatchObject({ totalCount: 101, returnedCount: 100, capped: true });
    expect(result.members.items).toHaveLength(100);
    expect(result.members.items[0]).toEqual({
      userId: 'user-0',
      fullName: 'User 000',
      assignedTaskCount: 3,
      openTaskCount: 2,
      completedTaskCount: 1,
      expiredTaskCount: 1,
      completionRate: 33,
    });
    expect(result.teams).toEqual([
      {
        teamId: 'team-a',
        teamName: 'Alpha',
        totalTaskCount: 3,
        openTaskCount: 2,
        completedTaskCount: 1,
        expiredTaskCount: 1,
        completionRate: 33,
      },
      {
        teamId: 'team-b',
        teamName: 'Beta',
        totalTaskCount: 0,
        openTaskCount: 0,
        completedTaskCount: 0,
        expiredTaskCount: 0,
        completionRate: 0,
      },
    ]);
  });

  it('maps team scope and returns zero for zero denominators', async () => {
    vi.mocked(db.team.findFirst).mockResolvedValue({ id: TEAM_ID, name: 'Platform' });
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([
        {
          ...summaryRow,
          total_task_count: 0n,
          open_task_count: 0n,
          completed_task_count: 0n,
          expired_task_count: 0n,
          status_total: 0n,
          priority_total: 0n,
        },
      ])
      .mockResolvedValueOnce([
        {
          ...memberRow(0),
          assigned_task_count: 0n,
          open_task_count: 0n,
          completed_task_count: 0n,
          expired_task_count: 0n,
          total_user_count: 1n,
        },
      ]);

    const result = await getCompanyDashboard(db, admin, { teamId: TEAM_ID }, now);

    expect(result.scope).toEqual({ teamId: TEAM_ID, teamName: 'Platform' });
    expect(result.summary.completionRate).toBe(0);
    expect(result.statusBreakdown.todo.percentage).toBe(0);
    expect(result.priorityBreakdown.high.percentage).toBe(0);
    expect(result.members.items[0].completionRate).toBe(0);
    expect(result.teams).toEqual([]);
  });
});
