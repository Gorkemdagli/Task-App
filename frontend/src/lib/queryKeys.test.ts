import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';

describe('queryKeys', () => {
  it('scopes team and task keys by tenant and team', () => {
    expect(queryKeys.teams.list('tenant-a')).toEqual(['tenant', 'tenant-a', 'teams']);
    expect(queryKeys.team.detail('tenant-a', 'team-1')).toEqual([
      'tenant',
      'tenant-a',
      'team-scope',
      'team-1',
      'detail',
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
});
