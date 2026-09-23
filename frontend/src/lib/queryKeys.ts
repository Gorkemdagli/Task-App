import type { ListTasksFilters } from '@/hooks/tasks';
import type { CompanyDashboardRange } from '@/services/companyDashboard';

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  tenant: (tenantId: string) => ['tenant', tenantId] as const,
  teams: {
    list: (tenantId: string) => ['tenant', tenantId, 'teams'] as const,
  },
  teamScope: (tenantId: string, teamId: string) =>
    ['tenant', tenantId, 'team-scope', teamId] as const,
  team: {
    detail: (tenantId: string, teamId: string) =>
      ['tenant', tenantId, 'team-scope', teamId, 'detail'] as const,
    memberCandidates: (tenantId: string, teamId: string, query: string) =>
      ['tenant', tenantId, 'team-scope', teamId, 'member-candidates', query] as const,
    dashboard: (tenantId: string, teamId: string, range: CompanyDashboardRange = '30d') =>
      ['tenant', tenantId, 'team-scope', teamId, 'dashboard', range] as const,
  },
  tasks: {
    list: (tenantId: string, filters: ListTasksFilters = {}) =>
      filters.teamId
        ? ['tenant', tenantId, 'team-scope', filters.teamId, 'tasks', filters]
        : ['tenant', tenantId, 'tasks', filters],
  },
  task: {
    detail: (tenantId: string, taskId: string) => ['tenant', tenantId, 'task', taskId] as const,
    comments: (tenantId: string, taskId: string) =>
      ['tenant', tenantId, 'task', taskId, 'comments'] as const,
    files: (tenantId: string, taskId: string) =>
      ['tenant', tenantId, 'task', taskId, 'files'] as const,
    history: (tenantId: string, taskId: string) =>
      ['tenant', tenantId, 'task', taskId, 'history'] as const,
  },
  notifications: (tenantId: string, userId?: string) =>
    userId === undefined
      ? (['tenant', tenantId, 'notifications'] as const)
      : (['tenant', tenantId, 'notifications', userId] as const),
  companyInvitations: {
    incoming: (userId: string) => ['company-invitations', 'incoming', userId] as const,
    admin: (tenantId: string) => ['tenant', tenantId, 'company-invitations'] as const,
  },
  companyUsers: (tenantId: string) => ['tenant', tenantId, 'company-users'] as const,
  companySettings: (tenantId: string) => ['tenant', tenantId, 'company-settings'] as const,
  companyDashboard: (
    tenantId: string,
    teamId: string | null,
    range: CompanyDashboardRange = '30d',
  ) => ['tenant', tenantId, 'company-dashboard', teamId ?? 'all', range] as const,
};
