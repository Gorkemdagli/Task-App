import { useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTasks } from '@/hooks/tasks';
import { useCompanyInvitations } from '@/hooks/queries/useCompanyInvitations';
import * as teamsService from '@/services/teams';
import * as invitationsService from '@/services/companyInvitations';
import { api } from '@/lib/api';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { RouteDataReadinessProvider, useRouteDataReadiness } from './RouteDataReadiness';
import { useTeam, useTeams } from '@/hooks/queries/useTeams';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const member: AuthUser = {
  id: 'member-1',
  displayId: 'MEMBER1',
  email: 'member@example.com',
  fullName: 'Member',
  role: 'member',
  tenantId: 'tenant-a',
};

function ScheduledQueries() {
  const readiness = useRouteDataReadiness();
  const user = useAuthStore((state) => state.user);
  const { data: teams } = useTeams();
  useTeams(); // Sidebar and MobileSidebar share this gated query.
  useTeams(); // Dashboard observes the same query.
  const teamId = teams?.[0]?.id;
  const isCompanyAdmin = user?.role === 'companyAdmin';
  const teamDetail = useTeam(isCompanyAdmin ? undefined : teamId);
  useEffect(() => {
    if (readiness.phase === 'team-detail' && (!teamId || teamDetail.data !== undefined)) {
      const memberKnown = teamDetail.data?.members.some((member) => member.userId === user?.id);
      readiness.completePhase('team-detail', !memberKnown);
    }
  }, [readiness, teamDetail.data, teamId, user?.id]);
  useTasks(isCompanyAdmin ? undefined : teamId ? { teamId } : undefined, {
    enabled: readiness.tasksEnabled && (isCompanyAdmin || Boolean(teamId)),
  });
  useNotifications();
  useCompanyInvitations();
  return <output data-testid="phase">{readiness.phase}</output>;
}

function CompanyQueries({ summary }: { summary: Promise<{ ready: true }> }) {
  const readiness = useRouteDataReadiness();
  const primary = useQuery({ queryKey: ['company-summary-test'], queryFn: () => summary });
  useEffect(() => {
    if (readiness.phase === 'summary' && (primary.data !== undefined || primary.isError)) {
      readiness.completePhase('summary');
    }
  }, [primary.data, primary.isError, readiness]);
  useTeams();
  useNotifications();
  useCompanyInvitations();
  return <output data-testid="phase">{readiness.phase}</output>;
}

function renderWithReadiness(path: string, user: AuthUser, children = <ScheduledQueries />) {
  useAuthStore.setState({ accessToken: 'token', user });
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={<RouteDataReadinessProvider>{children}</RouteDataReadinessProvider>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('route data readiness', () => {
  afterEach(() => vi.restoreAllMocks());

  it('waits for a Member team before issuing one correctly scoped task request and then starts both badges', async () => {
    const teams = deferred<teamsService.Team[]>();
    const teamDetail = deferred<teamsService.TeamDetail>();
    const tasks = deferred<{ data: { tasks: []; total: number } }>();
    const teamList = vi.spyOn(teamsService, 'listTeams').mockReturnValue(teams.promise);
    const teamById = vi.spyOn(teamsService, 'getTeam').mockReturnValue(teamDetail.promise);
    const incoming = vi.spyOn(invitationsService, 'listMyCompanyInvitations').mockResolvedValue([]);
    const taskUrls: string[] = [];
    const notificationUrls: string[] = [];
    const get = vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url.startsWith('/tasks')) {
        taskUrls.push(url);
        return tasks.promise as never;
      }
      notificationUrls.push(url);
      return Promise.resolve({ data: { items: [], unreadCount: 0, nextCursor: null } }) as never;
    });
    renderWithReadiness('/dashboard', member);

    await waitFor(() => expect(teamList).toHaveBeenCalledTimes(1));
    expect(taskUrls).toEqual([]);
    expect(notificationUrls).toEqual([]);
    expect(incoming).not.toHaveBeenCalled();

    await act(async () => {
      teams.resolve([{ id: 'team-a', name: 'Alpha' }] as teamsService.Team[]);
    });
    await waitFor(() => expect(teamById).toHaveBeenCalledWith('team-a'));
    expect(taskUrls).toEqual([]);
    expect(notificationUrls).toEqual([]);

    await act(async () => {
      teamDetail.resolve({
        id: 'team-a',
        name: 'Alpha',
        members: [{ userId: 'member-1', role: 'member' }],
      } as teamsService.TeamDetail);
    });
    await waitFor(() => expect(taskUrls).toHaveLength(1));
    expect(taskUrls[0]).toContain('teamId=team-a');
    expect(taskUrls[0]).not.toBe('/tasks');
    expect(notificationUrls).toEqual([]);

    await act(async () => {
      tasks.resolve({ data: { tasks: [], total: 0 } });
    });
    await waitFor(() => expect(notificationUrls).toEqual(['/notifications?limit=10']));
    await waitFor(() => expect(incoming).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not broaden task scope when a Member has no teams and releases the badge phase', async () => {
    const teamList = vi.spyOn(teamsService, 'listTeams').mockResolvedValue([]);
    const incoming = vi.spyOn(invitationsService, 'listMyCompanyInvitations').mockResolvedValue([]);
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);
    renderWithReadiness('/dashboard', member);

    await waitFor(() => expect(teamList).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('badges'));
    await waitFor(() => expect(incoming).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith('/notifications?limit=10');
    expect(get).not.toHaveBeenCalledWith('/tasks');
  });

  it('starts CompanyAdmin all-team tasks and teams together, then waits for both before badges', async () => {
    const teams = deferred<teamsService.Team[]>();
    const tasks = deferred<{ data: { tasks: []; total: number } }>();
    const teamList = vi.spyOn(teamsService, 'listTeams').mockReturnValue(teams.promise);
    const incoming = vi.spyOn(invitationsService, 'listMyCompanyInvitations').mockResolvedValue([]);
    const urls: string[] = [];
    vi.spyOn(api, 'get').mockImplementation((url) => {
      urls.push(url);
      return url.startsWith('/tasks')
        ? tasks.promise as never
        : Promise.resolve({ data: { items: [], unreadCount: 0, nextCursor: null } }) as never;
    });
    renderWithReadiness('/dashboard', { ...member, role: 'companyAdmin' });

    await waitFor(() => expect(urls).toEqual(['/tasks']));
    await waitFor(() => expect(teamList).toHaveBeenCalledTimes(1));
    expect(incoming).not.toHaveBeenCalled();

    await act(async () => tasks.resolve({ data: { tasks: [], total: 0 } }));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('teams'));
    expect(incoming).not.toHaveBeenCalled();

    await act(async () => teams.resolve([{ id: 'team-a', name: 'Alpha' }] as teamsService.Team[]));
    await waitFor(() => expect(incoming).toHaveBeenCalledTimes(1));
    expect(urls).toEqual(['/tasks', '/notifications?limit=10']);
  });

  it('starts company teams with the summary and waits for both before badges', async () => {
    const summary = deferred<{ ready: true }>();
    const teams = deferred<teamsService.Team[]>();
    const teamList = vi.spyOn(teamsService, 'listTeams').mockReturnValue(teams.promise);
    vi.spyOn(invitationsService, 'listMyCompanyInvitations').mockResolvedValue([]);
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);
    renderWithReadiness('/company', { ...member, role: 'companyAdmin' }, <CompanyQueries summary={summary.promise} />);

    await waitFor(() => expect(teamList).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('phase')).toHaveTextContent('summary');
    await act(async () => summary.resolve({ ready: true }));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('teams'));
    await act(async () => teams.resolve([{ id: 'team-a', name: 'Alpha' }] as teamsService.Team[]));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('badges'));
  });

  it('ignores an old phase callback after the tenant changes', async () => {
    const teams = deferred<teamsService.Team[]>();
    vi.spyOn(teamsService, 'listTeams').mockReturnValue(teams.promise);
    let staleComplete: ((phase: 'teams') => void) | undefined;
    function StaleCallbackProbe() {
      const readiness = useRouteDataReadiness();
      useEffect(() => {
        if (staleComplete === undefined) staleComplete = readiness.completePhase;
      }, [readiness.completePhase]);
      useTeams();
      return (
        <>
          <output data-testid="phase">{readiness.phase}</output>
          <button type="button" onClick={() => staleComplete?.('teams')}>Stale completion</button>
        </>
      );
    }
    renderWithReadiness('/dashboard', member, <StaleCallbackProbe />);

    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('teams'));
    act(() => useAuthStore.setState({ user: { ...member, tenantId: 'tenant-b' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Stale completion' }));
    expect(screen.getByTestId('phase')).toHaveTextContent('teams');
  });
});
