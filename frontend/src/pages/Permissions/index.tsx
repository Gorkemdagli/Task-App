import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, ChevronDown, X } from 'lucide-react';
import { useCompanyUsers, useUpdateCompanyPermissions } from '@/hooks/queries/useCompanyUsers';
import { useTeams } from '@/hooks/queries/useTeams';
import type { CompanyUser, UpdateCompanyPermissionsInput } from '@/services/companyUsers';
import { getApiErrorMessage } from '@/lib/apiError';
import { MAX_RENDERED_RECORDS, RECORD_CAP_MESSAGE } from '@/lib/listLimits';

type DraftPermissions = Pick<UpdateCompanyPermissionsInput, 'role' | 'teamRoles'>;

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

export function PermissionsPage() {
  const { isCompanyAdmin, user } = useAuth();
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DraftPermissions>>({});
  const [confirming, setConfirming] = useState<CompanyUser | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const usersQuery = useCompanyUsers(isCompanyAdmin);
  const teamsQuery = useTeams();
  const updatePermissions = useUpdateCompanyPermissions();

  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');
  const filteredUsers = useMemo(
    () =>
      (usersQuery.data ?? []).filter((candidate) =>
        [candidate.fullName, candidate.email, candidate.displayId].some((value) =>
          value.toLocaleLowerCase('tr-TR').includes(normalizedSearch),
        ),
      ),
    [normalizedSearch, usersQuery.data],
  );
  const users = filteredUsers.slice(0, MAX_RENDERED_RECORDS);
  const teams = (teamsQuery.data ?? []).slice(0, MAX_RENDERED_RECORDS);

  if (!isCompanyAdmin) return <Navigate to="/dashboard" replace />;

  function getDraft(candidate: CompanyUser): DraftPermissions {
    return drafts[candidate.id] ?? snapshot(candidate);
  }

  function changeDraft(
    candidate: CompanyUser,
    change: (draft: DraftPermissions) => DraftPermissions,
  ) {
    const next = change(getDraft(candidate));
    setDrafts((current) => ({ ...current, [candidate.id]: next }));
    setRowErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[candidate.id];
      return nextErrors;
    });
  }

  function setTeamRole(
    candidate: CompanyUser,
    teamId: string,
    role: 'member' | 'teamAdmin' | null,
  ) {
    changeDraft(candidate, (draft) => ({
      ...draft,
      teamRoles: role
        ? [...draft.teamRoles.filter((teamRole) => teamRole.teamId !== teamId), { teamId, role }]
        : draft.teamRoles.filter((teamRole) => teamRole.teamId !== teamId),
    }));
  }

  function cancelDraft(candidate: CompanyUser) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[candidate.id];
      return next;
    });
    setRowErrors((current) => {
      const next = { ...current };
      delete next[candidate.id];
      return next;
    });
  }

  async function confirmDraft() {
    if (!confirming) return;
    const candidate = confirming;
    const draft = getDraft(candidate);
    try {
      await updatePermissions.mutateAsync({ userId: candidate.id, ...draft });
      cancelDraft(candidate);
      setConfirming(null);
    } catch (error) {
      setRowErrors((current) => ({
        ...current,
        [candidate.id]: getApiErrorMessage(error, 'Yetkiler güncellenemedi.'),
      }));
      setConfirming(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6" data-testid="permissions-page">
      <header>
        <h1 className="text-2xl font-semibold">Yetkiler</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Şirket kullanıcılarının global ve takım rollerini yönet.
        </p>
      </header>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="İsim, e-posta veya kullanıcı ID ara"
        aria-label="Kullanıcı ara"
      />
      {usersQuery.isLoading && <p className="text-sm text-muted-foreground">Yükleniyor…</p>}
      {usersQuery.isError && <p role="alert">Kullanıcılar yüklenemedi.</p>}
      <div className="divide-y divide-border rounded-md border border-border bg-card">
        {users.map((candidate) => {
          const ownRow = candidate.id === user?.id;
          const draft = getDraft(candidate);
          const changed = !samePermissions(draft, snapshot(candidate));
          return (
            <div key={candidate.id} className="space-y-2 p-4" data-testid="permission-row">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={candidate.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback>{candidate.fullName.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{candidate.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {candidate.email} · {candidate.displayId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={ownRow}
                        title={ownRow ? 'Kendi rolünüz değiştirilemez' : undefined}
                        aria-label={`${candidate.fullName} rolü`}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {draft.role === 'companyAdmin' ? 'Şirket Admini' : 'Üye'}
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() =>
                          changeDraft(candidate, (current) => ({ ...current, role: 'member' }))
                        }
                      >
                        Üye
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          changeDraft(candidate, (current) => ({
                            ...current,
                            role: 'companyAdmin',
                          }))
                        }
                      >
                        Şirket Admini
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${candidate.fullName} takım yetkileri`}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm"
                      >
                        Takımlar{draft.teamRoles.length ? ` (${draft.teamRoles.length})` : ''}
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      {teams.map((team) => {
                        const selected = draft.teamRoles.find(
                          (teamRole) => teamRole.teamId === team.id,
                        );
                        return (
                          <div key={team.id}>
                            <DropdownMenuLabel>{team.name}</DropdownMenuLabel>
                            <DropdownMenuItem
                              onSelect={() => setTeamRole(candidate, team.id, 'member')}
                            >
                              {team.name} — Üye{selected?.role === 'member' ? ' ✓' : ''}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setTeamRole(candidate, team.id, 'teamAdmin')}
                            >
                              {team.name} — Takım Admini{selected?.role === 'teamAdmin' ? ' ✓' : ''}
                            </DropdownMenuItem>
                            {selected && (
                              <DropdownMenuItem
                                onSelect={() => setTeamRole(candidate, team.id, null)}
                              >
                                {team.name} — Yetkiyi kaldır
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                          </div>
                        );
                      })}
                      {teams.length === 0 && (
                        <DropdownMenuLabel>Takım bulunamadı</DropdownMenuLabel>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {changed && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${candidate.fullName} değişikliklerini iptal et`}
                        data-testid={`permission-cancel-${candidate.id}`}
                        onClick={() => cancelDraft(candidate)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${candidate.fullName} değişikliklerini onayla`}
                        data-testid={`permission-save-${candidate.id}`}
                        onClick={() => setConfirming(candidate)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {rowErrors[candidate.id] && <p role="alert">{rowErrors[candidate.id]}</p>}
            </div>
          );
        })}
      </div>

      {filteredUsers.length > MAX_RENDERED_RECORDS && (
        <p className="text-xs text-muted-foreground">{RECORD_CAP_MESSAGE}</p>
      )}

      <Dialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emin misiniz?</DialogTitle>
            <DialogDescription>
              {confirming?.fullName} kullanıcısının yetki değişiklikleri uygulanacak.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirming(null)}>
              İptal
            </Button>
            <Button type="button" onClick={confirmDraft} disabled={updatePermissions.isPending}>
              {updatePermissions.isPending ? 'Kaydediliyor…' : 'Onayla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
