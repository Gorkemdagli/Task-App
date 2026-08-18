import type { ListTasksFilters } from '@/hooks/tasks';

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
  },
  notifications: (tenantId: string) => ['tenant', tenantId, 'notifications'] as const,
  companyUsers: (tenantId: string) => ['tenant', tenantId, 'company-users'] as const,
};
