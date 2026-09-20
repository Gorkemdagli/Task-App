import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';

describe('queryKeys', () => {
  it('identifies tenantless-safe profile cache by user ID', () => {
    expect(queryKeys.profile('user-1')).toEqual(['profile', 'user-1']);
  });

  it('scopes team and task keys by tenant and team', () => {
    expect(queryKeys.teams.list('tenant-a')).toEqual(['tenant', 'tenant-a', 'teams']);
    expect(queryKeys.team.detail('tenant-a', 'team-1')).toEqual([
      'tenant',
      'tenant-a',
      'team-scope',
      'team-1',
      'detail',
    ]);
    expect(queryKeys.team.memberCandidates('tenant-a', 'team-1', 'selin')).toEqual([
      'tenant',
      'tenant-a',
      'team-scope',
      'team-1',
      'member-candidates',
      'selin',
    ]);
    expect(queryKeys.tasks.list('tenant-a', { teamId: 'team-1', limit: 100 })).toEqual([
      'tenant',
      'tenant-a',
      'team-scope',
      'team-1',
      'tasks',
      { teamId: 'team-1', limit: 100 },
    ]);
    expect(queryKeys.tasks.list('tenant-a', { limit: 20 })).toEqual([
      'tenant',
      'tenant-a',
      'tasks',
      { limit: 20 },
    ]);
  });

  it('scopes company settings by tenant', () => {
    expect(queryKeys.companySettings('tenant-a')).toEqual([
      'tenant',
      'tenant-a',
      'company-settings',
    ]);
  });

  it('scopes task files and history by tenant and task', () => {
    expect(queryKeys.task.files('tenant-a', 'task-1')).toEqual([
      'tenant',
      'tenant-a',
      'task',
      'task-1',
      'files',
    ]);
    expect(queryKeys.task.history('tenant-a', 'task-1')).toEqual([
      'tenant',
      'tenant-a',
      'task',
      'task-1',
      'history',
    ]);
    expect(queryKeys.task.files('tenant-a', 'task-1')).not.toEqual(
      queryKeys.task.files('tenant-b', 'task-1'),
    );
    expect(queryKeys.task.history('tenant-a', 'task-1')).not.toEqual(
      queryKeys.task.history('tenant-a', 'task-2'),
    );
  });

  it('scopes company dashboard by tenant, team, and range', () => {
    expect(queryKeys.companyDashboard('tenant-a', null)).toEqual([
      'tenant',
      'tenant-a',
      'company-dashboard',
      'all',
      '30d',
    ]);
    expect(queryKeys.companyDashboard('tenant-a', 'team-a', '7d')).toEqual([
      'tenant',
      'tenant-a',
      'company-dashboard',
      'team-a',
      '7d',
    ]);
  });

  it('keeps incoming invitations identity-scoped and admin invitations tenant-scoped', () => {
    expect(queryKeys.companyInvitations.incoming()).toEqual(['company-invitations', 'incoming']);
    expect(queryKeys.companyInvitations.admin('tenant-a')).toEqual([
      'tenant',
      'tenant-a',
      'company-invitations',
    ]);
  });
});
