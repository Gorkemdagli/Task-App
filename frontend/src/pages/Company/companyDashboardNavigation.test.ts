import { describe, expect, it } from 'vitest';
import {
  buildMemberTasksUrl,
  buildPriorityTasksUrl,
  buildStatusTasksUrl,
  buildTeamTasksUrl,
} from './companyDashboardNavigation';

describe('company dashboard task navigation', () => {
  it('builds status drill-down with team scope', () => {
    expect(buildStatusTasksUrl('in_progress', 'team-a')).toBe(
      '/tasks?status=in_progress&teamId=team-a',
    );
  });

  it('builds open priority drill-down without team scope', () => {
    expect(buildPriorityTasksUrl('high', null)).toBe(
      '/tasks?status=todo%2Cin_progress&priority=high',
    );
  });

  it('builds member drill-down with team scope', () => {
    expect(buildMemberTasksUrl('user-a', 'team-a')).toBe('/tasks?teamId=team-a&assigneeIds=user-a');
  });

  it('builds team drill-down', () => {
    expect(buildTeamTasksUrl('team-a')).toBe('/tasks?teamId=team-a');
  });
});
