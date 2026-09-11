import { api } from '@/lib/api';

export type CountAndPercentage = {
  count: number;
  percentage: number;
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

export async function getCompanyDashboard(teamId?: string): Promise<CompanyDashboard> {
  const response = await api.get<CompanyDashboard>('/company/dashboard', {
    params: teamId ? { teamId } : undefined,
  });
  return response.data;
}
