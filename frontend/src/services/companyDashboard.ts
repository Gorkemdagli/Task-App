import { api } from '@/lib/api';

export type CountAndPercentage = {
  count: number;
  percentage: number;
};

export type CompanyDashboardRange = '7d' | '30d' | '90d';

export type DashboardComparison = {
  current: number;
  previous: number;
  delta: number;
  deltaPercentage: number;
};

export type DurationMetric = {
  unit: 'days';
  median: number | null;
  sampleSize: number;
};

export type CycleTimeMetric = DurationMetric & {
  p85: number | null;
};

export type AgingWipMetric = {
  unit: 'days';
  buckets: {
    zeroToThree: number;
    fourToSeven: number;
    eightToFourteen: number;
    fifteenToThirty: number;
    overThirty: number;
  };
  measuredCount: number;
  unknownCount: number;
  totalCount: number;
};

export type CompanyDashboardTrendPoint = {
  period: string;
  created: number;
  completed: number;
};

export type CompanyRiskTask = {
  id: string;
  title: string;
  team: { id: string; name: string };
  assignee: { id: string; fullName: string } | null;
  deadline: string | null;
  status: 'todo' | 'in_progress' | 'done';
};

export type CompanyDashboard = {
  period: {
    range: CompanyDashboardRange;
    start: string;
    end: string;
  };
  createdInPeriod: DashboardComparison;
  completedInPeriod: DashboardComparison;
  cycleTime: CycleTimeMetric;
  leadTime: DurationMetric;
  agingWip: AgingWipMetric;
  overdueRate: DashboardComparison;
  onTimeDeliveryRate: DashboardComparison;
  backlogChange: number;
  throughput: Array<{ period: string; count: number }>;
  createdVsCompleted: CompanyDashboardTrendPoint[];
  scope: { teamId: string | null; teamName: string | null };
  summary: {
    totalUserCount: number;
    totalTaskCount: number;
    openTaskCount: number;
    completedTaskCount: number;
    expiredTaskCount: number;
    completionRate: number;
  };
  risk: {
    overdueTaskCount: number;
    dueNextSevenDaysTaskCount: number;
    pendingApprovalTaskCount: number;
    expiredTaskCount: number;
    blockedTaskCount?: number;
    blockedOverThreeDaysTaskCount?: number;
    blockedRate?: number;
  };
  riskTasks: {
    overdue: CompanyRiskTask[];
    dueNextSevenDays: CompanyRiskTask[];
    pendingApproval: CompanyRiskTask[];
    expired: CompanyRiskTask[];
  };
  statusBreakdown: {
    total: number;
    todo: CountAndPercentage;
    inProgress: CountAndPercentage;
    done: CountAndPercentage;
  };
  priorityBreakdown: {
    total: number;
    low: CountAndPercentage;
    medium: CountAndPercentage;
    high: CountAndPercentage;
  };
  members: {
    items: Array<{
      userId: string;
      fullName: string;
      assignedTaskCount: number;
      openTaskCount: number;
      completedTaskCount: number;
      expiredTaskCount: number;
      completionRate: number;
    }>;
    totalCount: number;
    returnedCount: number;
    capped: boolean;
  };
  teams: Array<{
    teamId: string;
    teamName: string;
    totalTaskCount: number;
    openTaskCount: number;
    completedTaskCount: number;
    expiredTaskCount: number;
    completionRate: number;
  }>;
};

export type TeamDashboard = CompanyDashboard;

export async function getCompanyDashboard(
  teamId?: string,
  range: CompanyDashboardRange = '30d',
): Promise<CompanyDashboard> {
  const response = await api.get<CompanyDashboard>('/company/dashboard', {
    params: { ...(teamId ? { teamId } : {}), range },
  });
  return response.data;
}

export async function getTeamDashboard(
  teamId: string,
  range: CompanyDashboardRange = '30d',
): Promise<TeamDashboard> {
  const response = await api.get<TeamDashboard>(`/teams/${teamId}/dashboard`, {
    params: { range },
  });
  return response.data;
}
