import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import * as teamsService from '@/services/teams';
import { useTeamMemberCandidates } from './useTeams';

vi.mock('@/services/teams', async () => {
  return {
    listTeams: vi.fn(),
    getTeam: vi.fn(),
    searchTeamMemberCandidates: vi.fn(),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useTeamMemberCandidates', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'admin',
        displayId: 'A3X9K',
        email: 'admin@example.com',
        fullName: 'Admin',
        role: 'companyAdmin',
        tenantId: 'tenant-a',
      },
    });
    vi.mocked(teamsService.searchTeamMemberCandidates).mockReset();
  });

  it('loads matches only after minimum search length', async () => {
    vi.mocked(teamsService.searchTeamMemberCandidates).mockResolvedValue([
      {
        id: 'user-1',
        displayId: 'B3X9K',
        email: 'selin@example.com',
        fullName: 'Selin Demir',
        avatarUrl: null,
      },
    ]);

    const shortQuery = renderHook(() => useTeamMemberCandidates('team-1', 's'), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(teamsService.searchTeamMemberCandidates).not.toHaveBeenCalled();
    shortQuery.unmount();

    const result = renderHook(() => useTeamMemberCandidates('team-1', ' selin '), { wrapper });
    await waitFor(() => expect(result.result.current.data).toHaveLength(1));
    expect(teamsService.searchTeamMemberCandidates).toHaveBeenCalledWith('team-1', 'selin');
  });
});
