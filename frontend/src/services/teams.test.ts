import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { searchTeamMemberCandidates } from './teams';

describe('teams service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('searches team member candidates with a normalized query', async () => {
    const candidates = [
      {
        id: 'user-1',
        displayId: 'B3X9K',
        email: 'selin@example.com',
        fullName: 'Selin Demir',
        avatarUrl: null,
      },
    ];
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: candidates } as never);

    await expect(searchTeamMemberCandidates('team-1', '  Selin Demir  ')).resolves.toEqual(
      candidates,
    );
    expect(get).toHaveBeenCalledWith('/teams/team-1/member-candidates?q=Selin%20Demir');
  });
});
