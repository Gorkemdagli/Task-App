import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/apiError';
import { useAddMember } from '@/hooks/queries/useTeamMutations';
import { useTeamMemberCandidates } from '@/hooks/queries/useTeams';
import type { TeamMemberCandidate } from '@/services/teams';

interface AddMemberModalProps {
  teamId: string;
}

export function AddMemberModal({ teamId }: AddMemberModalProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TeamMemberCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addMember = useAddMember(teamId);
  const candidatesQuery = useTeamMemberCandidates(teamId, search, open);
  const normalizedSearch = search.trim();
  const canSearch = normalizedSearch.length >= 2;
  const showCandidates = open && !selected && canSearch;

  function reset() {
    setSearch('');
    setSelected(null);
    setError(null);
    addMember.reset();
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setSelected(null);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selected) {
      setError('teams.addMember.selectUser');
      return;
    }

    try {
      await addMember.mutateAsync({ displayId: selected.displayId });
      reset();
      setOpen(false);
    } catch (err: unknown) {
      const fallback = t('teams.addMember.error');
      const message = getApiErrorMessage(err, fallback);
      setError(message === fallback ? 'teams.addMember.error' : message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        {t('teams.addMember.button')}
      </Button>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('teams.addMember.title')}</DialogTitle>
            <DialogDescription>
              {t('teams.addMember.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="team-member-search" className="text-sm font-medium text-foreground">
              {t('teams.addMember.companyUser')} <span className="text-secondary-foreground">*</span>
            </label>
            <input
              id="team-member-search"
              type="text"
              role="combobox"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              autoFocus
              autoComplete="off"
              aria-label={t('teams.addMember.searchLabel')}
              aria-controls="team-member-candidates"
              aria-expanded={showCandidates}
              aria-autocomplete="list"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder={t('teams.addMember.searchPlaceholder')}
            />

            {selected && (
              <div className="flex items-center justify-between rounded-md border border-primary/40 bg-secondary px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {selected.fullName}
                  </p>
                  <p className="truncate text-xs text-secondary-foreground">
                    {selected.email} · <span className="font-mono">{selected.displayId}</span>
                  </p>
                </div>
                <button
                  type="button"
                  className="ml-2 rounded-sm p-1 text-secondary-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => {
                    setSelected(null);
                    setSearch('');
                  }}
                  aria-label={t('teams.addMember.removeSelected')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {showCandidates && (
              <div
                id="team-member-candidates"
                role="listbox"
                aria-label={t('teams.addMember.matches')}
                className="max-h-60 overflow-y-auto rounded-md border border-border bg-card p-1"
              >
                {candidatesQuery.isFetching ? (
                  <p className="px-3 py-2 text-sm text-secondary-foreground">
                    {t('teams.addMember.searching')}
                  </p>
                ) : candidatesQuery.isError ? (
                  <p role="alert" className="px-3 py-2 text-sm text-destructive">
                    {t('teams.addMember.searchError')}
                  </p>
                ) : candidatesQuery.data?.length ? (
                  candidatesQuery.data.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="flex w-full items-start rounded-md px-3 py-2 text-left hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                      onClick={() => {
                        setSelected(candidate);
                        setSearch('');
                        setError(null);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {candidate.fullName}
                        </span>
                        <span className="block truncate text-xs text-secondary-foreground">
                          {candidate.email} ·{' '}
                          <span className="font-mono">{candidate.displayId}</span>
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-secondary-foreground">
                    {t('teams.addMember.noMatches')}
                  </p>
                )}
              </div>
            )}

            {!canSearch && !selected && (
              <p className="text-xs text-secondary-foreground">{t('teams.addMember.minSearch')}</p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.startsWith('teams.addMember.') ? t(error) : error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="md">
                {t('teams.addMember.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="md" loading={addMember.isPending}>
              {t('teams.addMember.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
