import AxiosMockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { getCompanyDashboard, type CompanyDashboard } from './companyDashboard';

const dashboard: CompanyDashboard = {
  scope: { teamId: null, teamName: null },
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

  it('gets all-scope dashboard without query params', async () => {
    mock.onGet('/company/dashboard').reply(200, dashboard);

    await expect(getCompanyDashboard()).resolves.toEqual(dashboard);

    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.get[0].url).toBe('/company/dashboard');
    expect(mock.history.get[0].params).toBeUndefined();
  });

  it('sends team scope through Axios params', async () => {
    mock.onGet('/company/dashboard', { params: { teamId: 'team-a' } }).reply(200, {
      ...dashboard,
      scope: { teamId: 'team-a', teamName: 'Alpha' },
    });

    await expect(getCompanyDashboard('team-a')).resolves.toMatchObject({
      scope: { teamId: 'team-a', teamName: 'Alpha' },
    });
    expect(mock.history.get[0].params).toEqual({ teamId: 'team-a' });
  });
});
