import { useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCompanyUsers, useUpdateCompanyPermissions } from '@/hooks/queries/useCompanyUsers';
import { useTeams } from '@/hooks/queries/useTeams';
import type { CompanyUser, UpdateCompanyPermissionsInput } from '@/services/companyUsers';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;
const EMPTY_USERS: CompanyUser[] = [];

type DraftPermissions = Pick<UpdateCompanyPermissionsInput, 'role' | 'teamRoles'>;
type RoleFilter = '' | CompanyUser['role'];

const ROLE_LABEL: Record<CompanyUser['role'], string> = {
  member: 'permissions.roles.member',
  companyAdmin: 'permissions.roles.companyAdmin',
};

const TEAM_ROLE_LABEL: Record<'member' | 'teamAdmin', string> = {
  member: 'permissions.roles.member',
  teamAdmin: 'permissions.roles.teamAdmin',
};

function snapshot(user: CompanyUser): DraftPermissions {
  return {
    role: user.role,
    teamRoles: (user.teamRoles ?? []).map(({ teamId, role }) => ({ teamId, role })),
  };
}

function samePermissions(left: DraftPermissions, right: DraftPermissions): boolean {
  if (left.role !== right.role || left.teamRoles.length !== right.teamRoles.length) return false;
  const leftTeams = [...left.teamRoles].sort((a, b) => a.teamId.localeCompare(b.teamId));
  const rightTeams = [...right.teamRoles].sort((a, b) => a.teamId.localeCompare(b.teamId));
  return leftTeams.every(
    (teamRole, index) =>
      teamRole.teamId === rightTeams[index].teamId && teamRole.role === rightTeams[index].role,
  );
}

function initials(fullName: string): string {
  return fullName
    .split(' ')
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function teamSummary(
  user: CompanyUser,
  formatSummary: (count: number, adminCount: number) => string,
): string {
  const teamRoles = user.teamRoles ?? [];
  const adminCount = teamRoles.filter((teamRole) => teamRole.role === 'teamAdmin').length;
  return formatSummary(teamRoles.length, adminCount);
}

function roleForTeam(draft: DraftPermissions, teamId: string): 'none' | 'member' | 'teamAdmin' {
  return draft.teamRoles.find((teamRole) => teamRole.teamId === teamId)?.role ?? 'none';
}

function roleLabel(
  role: 'none' | 'member' | 'teamAdmin',
  labels: Record<'none' | 'member' | 'teamAdmin', string>,
): string {
  return labels[role];
}

function filterUsersByCriteria(
  users: CompanyUser[],
  nextSearch: string,
  nextRole: RoleFilter,
  nextTeam: string,
): CompanyUser[] {
  const normalizedSearch = nextSearch.trim().toLocaleLowerCase('tr-TR');
  return users.filter((candidate) => {
    const matchesSearch = [candidate.fullName, candidate.email, candidate.displayId].some(
      (value) => value.toLocaleLowerCase('tr-TR').includes(normalizedSearch),
    );
    const matchesRole = !nextRole || candidate.role === nextRole;
    const matchesTeam =
      !nextTeam || (candidate.teamRoles ?? []).some((teamRole) => teamRole.teamId === nextTeam);
    return matchesSearch && matchesRole && matchesTeam;
  });
}

function getDiffs(
  baseline: DraftPermissions,
  draft: DraftPermissions,
  teams: Array<{ id: string; name: string }>,
  user: CompanyUser,
  roleLabels: Record<CompanyUser['role'], string>,
  teamRoleLabels: Record<'none' | 'member' | 'teamAdmin', string>,
): string[] {
  const diffs: string[] = [];
  if (baseline.role !== draft.role) {
    diffs.push(`${roleLabels[baseline.role]} → ${roleLabels[draft.role]}`);
  }

  const knownTeamNames = new Map(teams.map((team) => [team.id, team.name]));
  (user.teamRoles ?? []).forEach((teamRole) => {
    if (!knownTeamNames.has(teamRole.teamId)) knownTeamNames.set(teamRole.teamId, teamRole.teamName);
  });

  const teamIds = new Set([
    ...baseline.teamRoles.map((teamRole) => teamRole.teamId),
    ...draft.teamRoles.map((teamRole) => teamRole.teamId),
  ]);
  [...teamIds]
    .sort((left, right) => left.localeCompare(right))
    .forEach((teamId) => {
      const oldRole = baseline.teamRoles.find((teamRole) => teamRole.teamId === teamId)?.role;
      const newRole = draft.teamRoles.find((teamRole) => teamRole.teamId === teamId)?.role;
      if (oldRole === newRole) return;
      diffs.push(
        `${knownTeamNames.get(teamId) ?? teamId}: ${roleLabel(oldRole ?? 'none', teamRoleLabels)} → ${roleLabel(newRole ?? 'none', teamRoleLabels)}`,
      );
    });

  return diffs;
}

export function PermissionsPage() {
  const { t } = useTranslation();
  const { isCompanyAdmin, user } = useAuth();
  const usersQuery = useCompanyUsers(isCompanyAdmin);
  const teamsQuery = useTeams();
  const updatePermissions = useUpdateCompanyPermissions();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('');
  const [teamFilter, setTeamFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<DraftPermissions | null>(null);
  const [draft, setDraft] = useState<DraftPermissions | null>(null);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<(() => void) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState<{
    message: string;
    isTranslationKey: boolean;
  } | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const inspectorRef = useRef<HTMLElement>(null);

  const allUsers = usersQuery.data ?? EMPTY_USERS;
  const teams = teamsQuery.data ?? [];
  const translatedRoleLabels = {
    member: t(ROLE_LABEL.member),
    companyAdmin: t(ROLE_LABEL.companyAdmin),
  };
  const translatedTeamRoleLabels = {
    none: t('permissions.roles.none'),
    member: t(TEAM_ROLE_LABEL.member),
    teamAdmin: t(TEAM_ROLE_LABEL.teamAdmin),
  };
  const selectedUser = allUsers.find((candidate) => candidate.id === selectedUserId);
  const selectedDraft = selectedUser ? (draft ?? baseline ?? snapshot(selectedUser)) : null;
  const selectedBaseline = selectedUser ? (baseline ?? snapshot(selectedUser)) : null;
  const knownTeamIds = new Set(teams.map((team) => team.id));
  const selectedTeamsIncomplete =
    (selectedUser?.teamRoles ?? []).some(({ teamId }) => !knownTeamIds.has(teamId)) ||
    (selectedBaseline?.teamRoles ?? []).some(({ teamId }) => !knownTeamIds.has(teamId)) ||
    (selectedDraft?.teamRoles ?? []).some(({ teamId }) => !knownTeamIds.has(teamId));
  const teamsEditingBlocked =
    teamsQuery.isLoading || teamsQuery.isError || !teamsQuery.data || selectedTeamsIncomplete;

  const filteredUsers = useMemo(
    () => filterUsersByCriteria(allUsers, search, roleFilter, teamFilter),
    [allUsers, roleFilter, search, teamFilter],
  );
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const visibleUsers = filteredUsers.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);
  const draftChanged = Boolean(
    selectedDraft && selectedBaseline && !samePermissions(selectedDraft, selectedBaseline),
  );
  const isSaving = updatePermissions.isPending;
  const hasActiveFilters = Boolean(search || roleFilter || teamFilter);
  const usersLoading = usersQuery.isLoading && !usersQuery.data;

  const stats = useMemo(() => {
    const companyAdminCount = allUsers.filter((candidate) => candidate.role === 'companyAdmin').length;
    const teamAdminUserCount = allUsers.filter((candidate) =>
      (candidate.teamRoles ?? []).some((teamRole) => teamRole.role === 'teamAdmin'),
    ).length;
    const teamlessCount = allUsers.filter((candidate) => (candidate.teamRoles ?? []).length === 0).length;
    return { companyAdminCount, teamAdminUserCount, teamlessCount };
  }, [allUsers]);

  if (!isCompanyAdmin) return <Navigate to="/dashboard" replace />;

  function hasUnsavedDraft() {
    return Boolean(draftChanged);
  }

  function discardDraft() {
    setDraft(null);
    setSaveError(null);
    setPendingDiscardAction(null);
  }

  function requestDiscard(action: () => void): boolean {
    if (!hasUnsavedDraft()) return true;
    setPendingDiscardAction(() => action);
    return false;
  }

  function discardAndContinue() {
    const action = pendingDiscardAction;
    discardDraft();
    action?.();
  }

  function clearSelection() {
    setSelectedUserId(null);
    setBaseline(null);
    setDraft(null);
    setSaveError(null);
    setConfirming(false);
    setPendingDiscardAction(null);
  }

  function selectUser(candidate: CompanyUser) {
    if (isSaving || candidate.id === selectedUserId) return;
    const select = () => {
      setSelectedUserId(candidate.id);
      setBaseline(snapshot(candidate));
      setDraft(null);
      setSaveError(null);
      inspectorRef.current?.focus();
    };
    if (!requestDiscard(select)) return;
    select();
  }

  function changeFilters(nextSearch: string, nextRole: RoleFilter, nextTeam: string): boolean {
    const hidesSelection = selectedUser && !filterUsersByCriteria(allUsers, nextSearch, nextRole, nextTeam).some(
      (candidate) => candidate.id === selectedUser.id,
    );
    const applyFilters = () => {
      if (hidesSelection) clearSelection();
      setPendingDiscardAction(null);
      setSearch(nextSearch);
      setRoleFilter(nextRole);
      setTeamFilter(nextTeam);
      setPage(1);
    };
    if (hidesSelection && !requestDiscard(applyFilters)) return false;
    applyFilters();
    return true;
  }

  function changeDraft(change: (current: DraftPermissions) => DraftPermissions) {
    if (!selectedUser || selectedUser.id === user?.id || teamsEditingBlocked || isSaving) return;
    setDraft(change(selectedDraft ?? snapshot(selectedUser)));
    setSaveError(null);
    setPendingDiscardAction(null);
  }

  function setTeamRole(teamId: string, role: 'member' | 'teamAdmin' | null) {
    changeDraft((current) => ({
      ...current,
      teamRoles: role
        ? [...current.teamRoles.filter((teamRole) => teamRole.teamId !== teamId), { teamId, role }]
        : current.teamRoles.filter((teamRole) => teamRole.teamId !== teamId),
    }));
  }

  async function confirmDraft() {
    if (!selectedUser || !selectedDraft || !selectedBaseline || teamsEditingBlocked || isSaving) return;
    try {
      const updatedUser = await updatePermissions.mutateAsync({
        userId: selectedUser.id,
        ...selectedDraft,
      });
      setBaseline(snapshot(updatedUser));
      discardDraft();
      setConfirming(false);
    } catch (error) {
      const fallback = t('permissions.inspector.saveError');
      const message = getApiErrorMessage(error, fallback);
      setSaveError({
        message: message === fallback ? 'permissions.inspector.saveError' : message,
        isTranslationKey: message === fallback,
      });
      setConfirming(false);
    }
  }

  function closeMobileInspector() {
    const close = () => {
      const previousId = selectedUserId;
      clearSelection();
      if (previousId) rowRefs.current[previousId]?.focus();
    };
    if (!requestDiscard(close)) return;
    close();
  }

  function changePage(nextPage: number) {
    const applyPage = () => setPage(nextPage);
    if (requestDiscard(applyPage)) applyPage();
  }

  const retryUsers = () => {
    void usersQuery.refetch?.();
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6" data-testid="permissions-page">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('permissions.page.title')}</h1>
          <p className="mt-1 text-sm text-secondary-foreground">
            {t('permissions.page.subtitle')}
          </p>
        </div>
        <div className="w-full md:max-w-sm">
          <label htmlFor="permissions-search" className="sr-only">
            {t('permissions.page.search')}
          </label>
          <Input
            id="permissions-search"
            value={search}
            onChange={(event) => {
              if (!changeFilters(event.target.value, roleFilter, teamFilter)) {
                event.currentTarget.value = search;
              }
            }}
            placeholder={t('permissions.page.searchPlaceholder')}
            aria-label={t('permissions.page.search')}
          />
        </div>
      </header>

      {usersQuery.isFetching && usersQuery.data && (
        <p role="status" aria-live="polite" className="text-xs text-secondary-foreground">
          {t('permissions.page.updating')}
        </p>
      )}

      {allUsers.length > 0 && !usersLoading && (
        <section aria-label={t('permissions.page.auditSummary')} className="border-y border-border py-4">
          <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
            <div className="border-l-0 px-3 sm:border-l sm:border-border">
              <p className="text-xs text-secondary-foreground">{t('permissions.page.total')}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {t('permissions.page.users', { count: allUsers.length })}
              </p>
            </div>
            <div className="border-l border-border px-3">
              <p className="text-xs text-secondary-foreground">{t(ROLE_LABEL.companyAdmin)}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{stats.companyAdminCount}</p>
            </div>
            <div className="border-l-0 px-3 sm:border-l sm:border-border">
              <p className="text-xs text-secondary-foreground">{t(TEAM_ROLE_LABEL.teamAdmin)}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{stats.teamAdminUserCount}</p>
            </div>
            <div className="border-l border-border px-3">
              <p className="text-xs text-secondary-foreground">{t('permissions.page.teamless')}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{stats.teamlessCount}</p>
            </div>
          </div>
        </section>
      )}

      {allUsers.length > 0 && !usersLoading && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-secondary-foreground">
            {t('permissions.page.roleFilter')}
            <select
              value={roleFilter}
              onChange={(event) => {
                const nextRole = event.target.value as RoleFilter;
                if (!changeFilters(search, nextRole, teamFilter)) event.currentTarget.value = roleFilter;
              }}
              aria-label={t('permissions.page.roleFilterAria')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('permissions.page.allRoles')}</option>
              <option value="member">{t(ROLE_LABEL.member)}</option>
              <option value="companyAdmin">{t(ROLE_LABEL.companyAdmin)}</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-secondary-foreground">
            {t('permissions.page.teamFilter')}
            <select
              value={teamFilter}
              onChange={(event) => {
                const nextTeam = event.target.value;
                if (!changeFilters(search, roleFilter, nextTeam)) event.currentTarget.value = teamFilter;
              }}
              aria-label={t('permissions.page.teamFilterAria')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={teams.length === 0}
            >
              <option value="">{t('permissions.page.allTeams')}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-end sm:mb-0.5"
            onClick={() => changeFilters('', '', '')}
            disabled={!hasActiveFilters}
          >
            Filtreleri temizle
          </Button>
        </div>
      )}

      {usersLoading && (
        <div data-testid="permissions-loading" className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: PAGE_SIZE }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-md" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      )}

      {!usersLoading && usersQuery.isError && allUsers.length === 0 && (
        <div role="alert" className="rounded-lg border border-destructive bg-card p-5">
          <p className="text-sm text-destructive">{t('permissions.users.error')}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={retryUsers}>
            {t('permissions.users.retry')}
          </Button>
        </div>
      )}

      {!usersLoading && !usersQuery.isError && allUsers.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">{t('permissions.users.empty')}</p>
          <p className="mt-1 text-sm text-secondary-foreground">
            {t('permissions.users.emptyDescription')}
          </p>
        </div>
      )}

      {!usersLoading && allUsers.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <section
            aria-labelledby="permissions-ledger-heading"
            className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="border-b border-border px-4 py-4">
              <h2 id="permissions-ledger-heading" className="text-lg font-semibold">
                {t('permissions.users.ledger')}
              </h2>
              <p className="mt-1 text-sm text-secondary-foreground">
                {t('permissions.users.ledgerSummary', {
                  count: filteredUsers.length,
                  pageSize: PAGE_SIZE,
                })}
              </p>
            </div>
            {usersQuery.isError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/50 px-4 py-3 text-sm text-destructive">
                <span>{t('permissions.users.refreshError')}</span>
                <Button type="button" variant="secondary" size="sm" onClick={retryUsers}>
                  {t('permissions.users.retry')}
                </Button>
              </div>
            )}

            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-foreground">{t('permissions.users.noResults')}</p>
                <p className="mt-1 text-sm text-secondary-foreground">
                  {t('permissions.users.noResultsDescription')}
                </p>
                <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => changeFilters('', '', '')}>
                  {t('permissions.users.clearFilters')}
                </Button>
              </div>
            ) : (
              <>
                <div role="listbox" aria-label={t('permissions.users.list')}>
                  {visibleUsers.map((candidate) => {
                    const selected = candidate.id === selectedUserId;
                    const ownRow = candidate.id === user?.id;
                    return (
                      <button
                        key={candidate.id}
                        ref={(element) => {
                          rowRefs.current[candidate.id] = element;
                        }}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-label={t('permissions.users.optionLabel', {
                          name: candidate.fullName,
                          role: translatedRoleLabels[candidate.role],
                          summary: teamSummary(candidate, (count, adminCount) =>
                            t('permissions.users.teamSummary', {
                              count,
                              adminCount: t('permissions.users.adminCount', {
                                count: adminCount,
                              }),
                            }),
                          ),
                        })}
                        onClick={() => selectUser(candidate)}
                        className={cn(
                          'relative grid w-full gap-2 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:grid-cols-[minmax(0,1.2fr)_minmax(7rem,0.7fr)_minmax(8rem,0.8fr)] sm:items-center',
                          selected && 'bg-primary/10 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0">
                            {candidate.avatarUrl && <AvatarImage src={candidate.avatarUrl} alt="" />}
                            <AvatarFallback>{initials(candidate.fullName)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {candidate.fullName}
                            </span>
                            <span className="block truncate text-xs text-secondary-foreground">
                              {candidate.email} · {candidate.displayId}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2 sm:block">
                          <span className="text-xs text-secondary-foreground sm:hidden">
                            {t('permissions.users.role')}
                          </span>
                          <span className="text-sm text-foreground">
                            {translatedRoleLabels[candidate.role]}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2 sm:block">
                          <span className="text-xs text-secondary-foreground sm:hidden">
                            {t('permissions.users.scope')}
                          </span>
                          <span className="text-sm text-secondary-foreground">
                            {teamSummary(candidate, (count, adminCount) =>
                              t('permissions.users.teamSummary', {
                                count,
                                adminCount: t('permissions.users.adminCount', {
                                  count: adminCount,
                                }),
                              }),
                            )}{ownRow ? ` ${t('permissions.users.you')}` : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {filteredUsers.length > PAGE_SIZE && (
                <nav aria-label={t('permissions.users.pagination')} className="flex items-center justify-between border-t border-border px-4 py-2">
                  <span className="text-xs text-secondary-foreground" aria-live="polite">
                    {t('permissions.users.page', { page: visiblePage, total: totalPages })}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                      aria-label={t('permissions.users.previousPage')}
                        onClick={() => changePage(Math.max(1, visiblePage - 1))}
                        disabled={visiblePage === 1 || isSaving}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                      aria-label={t('permissions.users.nextPage')}
                        onClick={() => changePage(Math.min(totalPages, visiblePage + 1))}
                        disabled={visiblePage === totalPages || isSaving}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </nav>
                )}
              </>
            )}
          </section>

          <section
            ref={inspectorRef}
            tabIndex={-1}
            aria-labelledby="permissions-inspector-heading"
            className="order-first min-w-0 rounded-lg border border-border bg-card p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:sticky lg:top-20 lg:order-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 id="permissions-inspector-heading" className="text-lg font-semibold">
                {t('permissions.inspector.title')}
                </h2>
                <p className="mt-1 text-sm text-secondary-foreground">
                {t('permissions.inspector.subtitle')}
                </p>
              </div>
              {selectedUser && (
                <Button type="button" variant="ghost" size="sm" className="md:hidden" onClick={closeMobileInspector}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t('permissions.inspector.back')}
                </Button>
              )}
            </div>

            {pendingDiscardAction && (
              <div role="alert" className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm text-foreground">{t('permissions.inspector.discardWarning')}</p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setPendingDiscardAction(null)}>
                  {t('permissions.inspector.continueEditing')}
                  </Button>
                  <Button type="button" variant="destructive" onClick={discardAndContinue}>
                  {t('permissions.inspector.discardAndContinue')}
                  </Button>
                </div>
              </div>
            )}

            {!selectedUser || !selectedDraft || !selectedBaseline ? (
              <p className="py-10 text-center text-sm text-secondary-foreground">
                {t('permissions.inspector.empty')}
              </p>
            ) : (
              <div className="space-y-5 pt-5">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    {selectedUser.avatarUrl && <AvatarImage src={selectedUser.avatarUrl} alt="" />}
                    <AvatarFallback>{initials(selectedUser.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{selectedUser.fullName}</h3>
                    <p className="truncate text-xs text-secondary-foreground">
                      {selectedUser.email} · {selectedUser.displayId}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="permissions-company-role" className="text-xs font-medium text-secondary-foreground">
                {t('permissions.inspector.companyRole')}
                  </label>
                  <select
                    id="permissions-company-role"
                    value={selectedDraft.role}
                    onChange={(event) =>
                      changeDraft((current) => ({
                        ...current,
                        role: event.target.value as CompanyUser['role'],
                      }))
                    }
                aria-label={t('permissions.inspector.companyRole')}
                    disabled={selectedUser.id === user?.id || teamsEditingBlocked || isSaving}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                <option value="member">{t(ROLE_LABEL.member)}</option>
                <option value="companyAdmin">{t(ROLE_LABEL.companyAdmin)}</option>
                  </select>
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <div>
                    <h3 className="text-sm font-semibold">{t('permissions.inspector.teamRoles')}</h3>
                    <p className="mt-1 text-xs text-secondary-foreground">
                      {t('permissions.inspector.teamScope')}
                    </p>
                  </div>
                  {teams.map((team) => (
                    <label key={team.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-foreground">{team.name}</span>
                      <select
                        value={roleForTeam(selectedDraft, team.id)}
                        onChange={(event) =>
                          setTeamRole(
                            team.id,
                            event.target.value === 'none'
                              ? null
                              : (event.target.value as 'member' | 'teamAdmin'),
                          )
                        }
                        aria-label={`${team.name} ${t('permissions.users.role')}`}
                        disabled={selectedUser.id === user?.id || teamsEditingBlocked || isSaving}
                        className="h-10 min-w-32 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="none">{t('permissions.roles.none')}</option>
                        <option value="member">{t(TEAM_ROLE_LABEL.member)}</option>
                        <option value="teamAdmin">{t(TEAM_ROLE_LABEL.teamAdmin)}</option>
                      </select>
                    </label>
                  ))}
                  {teams.length === 0 && (
                    <p className="text-sm text-secondary-foreground">
                      {t('permissions.inspector.noTeams')}
                    </p>
                  )}
                  {teamsEditingBlocked && (
                    <p className="text-xs text-secondary-foreground">
                      {t('permissions.inspector.teamDataBlocked')}
                    </p>
                  )}
                  {selectedUser.id === user?.id && (
                    <p className="text-xs text-secondary-foreground">
                      {t('permissions.inspector.cannotChangeOwnRole')}
                    </p>
                  )}
                </div>

                {saveError && (
                  <p role="alert" className="text-sm text-destructive">
                    {saveError.isTranslationKey ? t(saveError.message) : saveError.message}
                  </p>
                )}

                {draftChanged && (
                  <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                    <Button type="button" variant="secondary" onClick={discardDraft} disabled={isSaving}>
                      {t('permissions.inspector.cancelChanges')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setConfirming(true)}
                      disabled={teamsEditingBlocked || isSaving}
                    >
                      {t('permissions.inspector.reviewChanges')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(open) => !open && !isSaving && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('permissions.inspector.confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('permissions.inspector.confirmDescription', { name: selectedUser?.fullName })}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 rounded-md border border-border bg-muted p-3 text-sm" aria-label={t('permissions.inspector.changeSummary')}>
            {selectedUser && selectedDraft && selectedBaseline &&
              getDiffs(
                selectedBaseline,
                selectedDraft,
                teams,
                selectedUser,
                translatedRoleLabels,
                translatedTeamRoleLabels,
              ).map((diff) => (
                <li key={diff} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span>{diff}</span>
                </li>
              ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="secondary" autoFocus onClick={() => setConfirming(false)} disabled={isSaving}>
              {t('permissions.inspector.cancel')}
            </Button>
            <Button type="button" onClick={confirmDraft} disabled={teamsEditingBlocked || isSaving}>
              {isSaving ? t('permissions.inspector.saving') : t('permissions.inspector.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
