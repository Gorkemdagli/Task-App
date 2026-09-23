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

export type DashboardPeriod = {
  range: CompanyDashboardRange;
  start: string;
  end: string;
};

export type DashboardScope = { teamId: string | null; teamName: string | null };

export type DashboardHealthStatus =
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'OFF_TRACK'
  | 'INSUFFICIENT_DATA';

export type DashboardHealthMetric =
  | 'completedTaskCount'
  | 'overdueRate'
  | 'blockedRate'
  | 'onTimeDeliveryRate'
  | 'agingWipOverThirty'
  | 'throughputBalance'
  | 'backlogChange';

export type DashboardHealthInsight = {
  metric: DashboardHealthMetric;
  observedValue: number | null;
  threshold: number;
  comparison: 'below' | 'at_or_above' | 'unavailable' | 'below_previous' | 'above_zero';
  message: string;
  period: DashboardPeriod;
  scope: DashboardScope;
};

export type DashboardHealth = {
  period: DashboardPeriod;
  scope: DashboardScope;
  status: DashboardHealthStatus;
  sampleSize: number;
  minimumSampleSize: number;
  explanation: string;
  insights: DashboardHealthInsight[];
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

export type CumulativeFlowSample = {
  date: string;
  todo: number;
  inProgress: number;
  done: number;
};

export type CumulativeFlow = {
  samples: CumulativeFlowSample[];
  bottleneck: {
    inProgressDelta: number;
    inProgressGrowthPct: number | null;
    agingInProgressCount: number;
    unknownStartedAtCount: number;
    blockedRate: number | null;
    cycleDegradationPct: number | null;
  };
  statusDurations: {
    todo: DurationMetric;
    inProgress: DurationMetric;
    timeBeforeCompletion: DurationMetric;
  };
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
  period: DashboardPeriod;
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
  cumulativeFlow?: CumulativeFlow;
  scope: DashboardScope;
  health: DashboardHealth;
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
