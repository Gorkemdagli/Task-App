import AxiosMockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { getCompanyDashboard, getTeamDashboard, type CompanyDashboard } from './companyDashboard';

const dashboard: CompanyDashboard = {
  period: { range: '30d', start: '2026-07-22', end: '2026-08-21' },
  createdInPeriod: { current: 2, previous: 1, delta: 1, deltaPercentage: 100 },
  completedInPeriod: { current: 1, previous: 1, delta: 0, deltaPercentage: 0 },
  cycleTime: { unit: 'days', median: 1, p85: 2, sampleSize: 1 },
  leadTime: { unit: 'days', median: 3, sampleSize: 1 },
  agingWip: {
    unit: 'days',
    buckets: { zeroToThree: 0, fourToSeven: 0, eightToFourteen: 0, fifteenToThirty: 0, overThirty: 0 },
    measuredCount: 0,
    unknownCount: 0,
    totalCount: 0,
  },
  overdueRate: { current: 0, previous: 0, delta: 0, deltaPercentage: 0 },
  onTimeDeliveryRate: { current: 100, previous: 100, delta: 0, deltaPercentage: 0 },
  backlogChange: 1,
  throughput: [{ period: '2026-08-20', count: 1 }],
  createdVsCompleted: [{ period: '2026-08-20', created: 2, completed: 1 }],
  scope: { teamId: null, teamName: null },
  health: {
    period: { range: '30d', start: '2026-07-22', end: '2026-08-21' },
    scope: { teamId: null, teamName: null },
    status: 'INSUFFICIENT_DATA',
    sampleSize: 1,
    minimumSampleSize: 5,
    explanation: 'Sağlık durumu için en az 5 tamamlanan görev gerekir; bu dönemde 1 görev tamamlandı.',
    insights: [],
  },
  summary: {
    totalUserCount: 1,
    totalTaskCount: 2,
    openTaskCount: 1,
    completedTaskCount: 1,
    expiredTaskCount: 0,
    completionRate: 50,
  },
  risk: {
    overdueTaskCount: 0,
    dueNextSevenDaysTaskCount: 1,
    pendingApprovalTaskCount: 0,
    expiredTaskCount: 0,
  },
  riskTasks: {
    overdue: [],
    dueNextSevenDays: [],
    pendingApproval: [],
    expired: [],
  },
  statusBreakdown: {
    total: 2,
    todo: { count: 1, percentage: 50 },
    inProgress: { count: 0, percentage: 0 },
    done: { count: 1, percentage: 50 },
  },
  priorityBreakdown: {
    total: 1,
    low: { count: 1, percentage: 100 },
    medium: { count: 0, percentage: 0 },
    high: { count: 0, percentage: 0 },
  },
  members: { items: [], totalCount: 1, returnedCount: 0, capped: false },
  teams: [],
};

describe('company dashboard service', () => {
  let mock: AxiosMockAdapter;

  beforeEach(() => {
    mock = new AxiosMockAdapter(api);
  });

  afterEach(() => {
    mock.restore();
  });

  it('gets all-scope dashboard with the selected range', async () => {
    mock.onGet('/company/dashboard', { params: { range: '30d' } }).reply(200, dashboard);

    await expect(getCompanyDashboard()).resolves.toEqual(dashboard);

    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.get[0].url).toBe('/company/dashboard');
    expect(mock.history.get[0].params).toEqual({ range: '30d' });
  });

  it('sends team scope through Axios params', async () => {
    mock.onGet('/company/dashboard', { params: { teamId: 'team-a', range: '7d' } }).reply(200, {
      ...dashboard,
      scope: { teamId: 'team-a', teamName: 'Alpha' },
    });

    await expect(getCompanyDashboard('team-a', '7d')).resolves.toMatchObject({
      scope: { teamId: 'team-a', teamName: 'Alpha' },
    });
    expect(mock.history.get[0].params).toEqual({ teamId: 'team-a', range: '7d' });
  });

  it('gets a dedicated team dashboard endpoint', async () => {
    mock.onGet('/teams/team-a/dashboard', { params: { range: '90d' } }).reply(200, dashboard);

    await expect(getTeamDashboard('team-a', '90d')).resolves.toEqual(dashboard);

    expect(mock.history.get[0].url).toBe('/teams/team-a/dashboard');
    expect(mock.history.get[0].params).toEqual({ range: '90d' });
  });
});
