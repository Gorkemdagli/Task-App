import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import { getCompanyDashboard } from './company-dashboard.service';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-08-20T12:00:00.000Z');
const admin: Actor = { id: 'admin-a', role: 'companyAdmin', tenantId: 'tenant-a' };
const member: Actor = { id: 'member-a', role: 'member', tenantId: 'tenant-a' };
type Numeric = bigint | number;

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
  blocked_task_count: 2n,
  blocked_over_three_days_task_count: 1n,
  status_total: 8n,
  status_todo: 2n,
  status_in_progress: 3n,
  status_done: 3n,
  priority_total: 5n,
  priority_low: 1n,
  priority_medium: 1n,
  priority_high: 3n,
  current_created_task_count: 2n,
  previous_created_task_count: 1n,
  current_completed_task_count: 3n,
  previous_completed_task_count: 2n,
  current_deadline_completed_task_count: 2n,
  current_on_time_task_count: 1n,
  previous_deadline_completed_task_count: 1n,
  previous_on_time_task_count: 1n,
  cycle_time_median: 2.5,
  cycle_time_p85: 5.25,
  cycle_time_sample_count: 4n,
  lead_time_median: 6.5,
  lead_time_sample_count: 5n,
  aging_wip_0_3_count: 1n,
  aging_wip_4_7_count: 2n,
  aging_wip_8_14_count: 3n,
  aging_wip_15_30_count: 4n,
  aging_wip_30_plus_count: 5n,
  aging_wip_unknown_count: 6n,
};

const riskTaskRow = {
  risk_type: 'overdue',
  id: 'task-a',
  title: 'Fix backup procedure',
  team_id: 'team-a',
  team_name: 'Alpha',
  assignee_id: 'user-0',
  assignee_full_name: 'User 000',
  deadline: new Date('2026-08-19T00:00:00.000Z'),
  status: 'in_progress',
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

  it('tenant-scopes the risk assignee lookup', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([summaryRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await getCompanyDashboard(db, admin, {}, now);

    const riskQuery = vi.mocked(db.$queryRaw).mock.calls[2]?.[0] as { text: string };
    expect(riskQuery.text).toMatch(/u\.tenant_id = \$\d+::uuid/);
  });

  it('maps all-scope aggregates, rounds percentages, and caps members', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([summaryRow])
      .mockResolvedValueOnce(Array.from({ length: 101 }, (_, index) => memberRow(index)))
      .mockResolvedValueOnce([riskTaskRow])
      .mockResolvedValueOnce([])
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
      blockedTaskCount: 2,
      blockedOverThreeDaysTaskCount: 1,
      blockedRate: 25,
    });
    expect(result.riskTasks.overdue).toEqual([
      {
        id: 'task-a',
        title: 'Fix backup procedure',
        team: { id: 'team-a', name: 'Alpha' },
        assignee: { id: 'user-0', fullName: 'User 000' },
        deadline: '2026-08-19',
        status: 'in_progress',
      },
    ]);
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
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getCompanyDashboard(db, admin, { teamId: TEAM_ID }, now);

    expect(result.scope).toEqual({ teamId: TEAM_ID, teamName: 'Platform' });
    expect(result.summary.completionRate).toBe(0);
    expect(result.statusBreakdown.todo.percentage).toBe(0);
    expect(result.priorityBreakdown.high.percentage).toBe(0);
    expect(result.members.items[0].completionRate).toBe(0);
    expect(result.teams).toEqual([]);
  });

  it('maps range metrics, comparisons, and empty-safe trend buckets', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([
        {
          ...summaryRow,
          current_created_task_count: 4n,
          previous_created_task_count: 2n,
          current_completed_task_count: 3n,
          previous_completed_task_count: 1n,
          current_deadline_completed_task_count: 2n,
          current_on_time_task_count: 1n,
          previous_deadline_completed_task_count: 1n,
          previous_on_time_task_count: 1n,
        },
      ])
      .mockResolvedValueOnce([memberRow(0)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { period: new Date('2026-08-14T00:00:00.000Z'), created_count: 0n, completed_count: 0n },
        { period: new Date('2026-08-15T00:00:00.000Z'), created_count: 2n, completed_count: 1n },
      ])
      .mockResolvedValueOnce([]);

    const result = await getCompanyDashboard(db, admin, { range: '7d' }, now);

    expect(result.period).toEqual({ range: '7d', start: '2026-08-14', end: '2026-08-21' });
    expect(result.createdInPeriod).toEqual({
      current: 4,
      previous: 2,
      delta: 2,
      deltaPercentage: 100,
    });
    expect(result.completedInPeriod).toEqual({
      current: 3,
      previous: 1,
      delta: 2,
      deltaPercentage: 200,
    });
    expect(result.onTimeDeliveryRate).toEqual({
      current: 50,
      previous: 100,
      delta: -50,
      deltaPercentage: -50,
    });
    expect(result.overdueRate).toEqual({
      current: 50,
      previous: 0,
      delta: 50,
      deltaPercentage: 0,
    });
    expect(result.backlogChange).toBe(1);
    expect(result.createdVsCompleted).toHaveLength(7);
    expect(result.createdVsCompleted[0]).toEqual({
      period: '2026-08-14',
      created: 0,
      completed: 0,
    });
    expect(result.throughput[1]).toEqual({ period: '2026-08-15', count: 1 });
  });

  it('maps flow metrics in days and keeps percentile samples deterministic', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([summaryRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getCompanyDashboard(db, admin, {}, now);

    expect(result.cycleTime).toEqual({
      unit: 'days',
      median: 2.5,
      p85: 5.25,
      sampleSize: 4,
    });
    expect(result.leadTime).toEqual({ unit: 'days', median: 6.5, sampleSize: 5 });
    expect(result.agingWip).toEqual({
      unit: 'days',
      buckets: { zeroToThree: 1, fourToSeven: 2, eightToFourteen: 3, fifteenToThirty: 4, overThirty: 5 },
      measuredCount: 15,
      unknownCount: 6,
      totalCount: 21,
    });
  });

  it('returns null durations for empty samples and scopes flow SQL to the tenant and team', async () => {
    vi.mocked(db.team.findFirst).mockResolvedValue({ id: TEAM_ID, name: 'Platform' });
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([
        {
          ...summaryRow,
          cycle_time_median: null,
          cycle_time_p85: null,
          cycle_time_sample_count: 0n,
          lead_time_median: null,
          lead_time_sample_count: 0n,
          aging_wip_0_3_count: 0n,
          aging_wip_4_7_count: 0n,
          aging_wip_8_14_count: 0n,
          aging_wip_15_30_count: 0n,
          aging_wip_30_plus_count: 0n,
          aging_wip_unknown_count: 1n,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getCompanyDashboard(db, admin, { teamId: TEAM_ID }, now);
    const summaryQuery = vi.mocked(db.$queryRaw).mock.calls[0]?.[0] as { text: string };

    expect(result.cycleTime).toEqual({ unit: 'days', median: null, p85: null, sampleSize: 0 });
    expect(result.leadTime).toEqual({ unit: 'days', median: null, sampleSize: 0 });
    expect(result.agingWip).toEqual({
      unit: 'days',
      buckets: { zeroToThree: 0, fourToSeven: 0, eightToFourteen: 0, fifteenToThirty: 0, overThirty: 0 },
      measuredCount: 0,
      unknownCount: 1,
      totalCount: 1,
    });
    expect(summaryQuery.text).toMatch(/percentile_cont/i);
    expect(summaryQuery.text).toMatch(/team\.tenant_id = \$\d+::uuid/);
    expect(summaryQuery.text).toMatch(/task\.team_id = \$\d+::uuid/);
    expect(summaryQuery.text).toMatch(/task\.pending_status IS NULL/);
  });

  it('scopes blocked metrics to active tasks and uses an exact UTC three-day cutoff', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([summaryRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getCompanyDashboard(db, admin, {}, now);
    const summaryQuery = vi.mocked(db.$queryRaw).mock.calls[0]?.[0] as {
      text: string;
      values: unknown[];
    };
    const blockedCutoff = summaryQuery.values.find(
      (value) => value instanceof Date && value.toISOString() === '2026-08-17T12:00:00.000Z',
    );

    expect(result.risk.blockedTaskCount).toBe(2);
    expect(result.risk.blockedOverThreeDaysTaskCount).toBe(1);
    expect(result.risk.blockedRate).toBe(25);
    expect(summaryQuery.text).toMatch(
      /WHERE task\.archived_at IS NULL\s+AND task\.is_blocked = true\s+\) AS blocked_task_count/i,
    );
    expect(summaryQuery.text).toMatch(/task\.blocked_since < \$\d+/);
    expect(blockedCutoff).toEqual(new Date('2026-08-17T12:00:00.000Z'));
  });

  it('derives deterministic health at boundaries, with off-track precedence and insufficient data', async () => {
    const load = async (
      overrides: Partial<typeof summaryRow>,
      trends: Array<{
        period: string;
        created_count: Numeric;
        completed_count: Numeric;
      }> = [],
    ) => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([{ ...summaryRow, ...overrides }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(trends)
        .mockResolvedValueOnce([]);
      return getCompanyDashboard(db, admin, { range: '30d' }, now);
    };

    const onTrack = await load({
      current_completed_task_count: 5n,
      current_deadline_completed_task_count: 100n,
      current_on_time_task_count: 81n,
      blocked_task_count: 14n,
      status_total: 100n,
    });
    expect(onTrack.health.status).toBe('ON_TRACK');
    expect(onTrack.health.insights.filter(({ metric }) => metric === 'overdueRate' || metric === 'blockedRate')).toEqual([]);

    vi.mocked(db.$queryRaw).mockReset();
    const atRisk = await load({
      current_completed_task_count: 5n,
      current_deadline_completed_task_count: 100n,
      current_on_time_task_count: 80n,
      blocked_task_count: 15n,
      status_total: 100n,
    });
    expect(atRisk.health.status).toBe('AT_RISK');
    expect(atRisk.health.insights.filter(({ metric }) => metric === 'overdueRate' || metric === 'blockedRate').map(({ metric, observedValue, threshold }) => ({ metric, observedValue, threshold }))).toEqual([
      { metric: 'overdueRate', observedValue: 20, threshold: 20 },
      { metric: 'blockedRate', observedValue: 15, threshold: 15 },
    ]);
    expect(atRisk.health.insights[0]).toMatchObject({
      period: atRisk.period,
      scope: atRisk.scope,
    });

    vi.mocked(db.$queryRaw).mockReset();
    const offTrack = await load({
      current_completed_task_count: 5n,
      current_deadline_completed_task_count: 100n,
      current_on_time_task_count: 65n,
      blocked_task_count: 25n,
      status_total: 100n,
    });
    expect(offTrack.health.status).toBe('OFF_TRACK');
    expect(offTrack.health.insights.filter(({ metric }) => metric === 'overdueRate' || metric === 'blockedRate').map((insight) => insight.threshold)).toEqual([35, 25]);

    vi.mocked(db.$queryRaw).mockReset();
    const insufficient = await load({
      current_completed_task_count: 4n,
      current_deadline_completed_task_count: 100n,
      current_on_time_task_count: 0n,
      blocked_task_count: 100n,
      status_total: 100n,
    });
    expect(insufficient.health.status).toBe('INSUFFICIENT_DATA');
    expect(insufficient.health.insights).toEqual([
      expect.objectContaining({
        metric: 'completedTaskCount',
        observedValue: 4,
        threshold: 5,
        comparison: 'below',
      }),
    ]);

    vi.mocked(db.$queryRaw).mockReset();
    const roundedButBelowOffTrack = await load({
      current_completed_task_count: 5n,
      current_deadline_completed_task_count: 23n,
      current_on_time_task_count: 15n,
      blocked_task_count: 0n,
      status_total: 100n,
    });
    expect(roundedButBelowOffTrack.overdueRate.current).toBe(35);
    expect(roundedButBelowOffTrack.health.status).toBe('AT_RISK');
    expect(roundedButBelowOffTrack.health.insights).toEqual([
      expect.objectContaining({ metric: 'overdueRate', observedValue: 35, threshold: 20 }),
      expect.objectContaining({ metric: 'onTimeDeliveryRate' }),
      expect.objectContaining({ metric: 'agingWipOverThirty' }),
    ]);

    vi.mocked(db.$queryRaw).mockReset();
    const missingOverdueDenominator = await load({
      current_completed_task_count: 5n,
      current_deadline_completed_task_count: 0n,
      current_on_time_task_count: 0n,
      blocked_task_count: 0n,
      status_total: 100n,
    });
    expect(missingOverdueDenominator.health.status).toBe('INSUFFICIENT_DATA');
    expect(missingOverdueDenominator.health.insights).toEqual([
      expect.objectContaining({ metric: 'overdueRate', comparison: 'unavailable' }),
    ]);

    vi.mocked(db.$queryRaw).mockReset();
    const missingBlockedDenominator = await load({
      current_completed_task_count: 5n,
      current_deadline_completed_task_count: 100n,
      current_on_time_task_count: 100n,
      blocked_task_count: 0n,
      status_total: 0n,
    });
    expect(missingBlockedDenominator.health.status).toBe('INSUFFICIENT_DATA');
    expect(missingBlockedDenominator.health.insights).toEqual([
      expect.objectContaining({ metric: 'blockedRate', comparison: 'unavailable' }),
    ]);

    vi.mocked(db.$queryRaw).mockReset();
    const additionalInsights = await load(
      {
        current_completed_task_count: 5n,
        current_created_task_count: 7n,
        current_deadline_completed_task_count: 5n,
        current_on_time_task_count: 5n,
        blocked_task_count: 0n,
        status_total: 100n,
        aging_wip_30_plus_count: 2n,
      },
      [
        { period: '2026-08-01', created_count: 2n, completed_count: 1n },
        { period: '2026-08-02', created_count: 3n, completed_count: 2n },
      ],
    );
    expect(additionalInsights.health.status).toBe('ON_TRACK');
    expect(additionalInsights.health.insights.map(({ metric }) => metric)).toEqual([
      'agingWipOverThirty',
      'throughputBalance',
      'backlogChange',
    ]);
  });
});
