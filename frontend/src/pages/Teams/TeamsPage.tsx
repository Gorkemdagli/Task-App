import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronRight, ExternalLink, MoreHorizontal } from 'lucide-react';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { MAX_RENDERED_RECORDS, RECORD_CAP_MESSAGE } from '@/lib/listLimits';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CreateTeamModal } from './CreateTeamModal';
import type { TeamDetail, TeamMember } from '@/services/teams';
import { cn } from '@/lib/utils';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
}

function MemberAvatar({ member, className }: { member: TeamMember; className?: string }) {
  return (
    <Avatar className={cn('h-9 w-9 border-2 border-card bg-secondary', className)}>
      {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.fullName} />}
      <AvatarFallback className="bg-secondary text-xs font-semibold text-foreground">
        {initials(member.fullName)}
      </AvatarFallback>
    </Avatar>
  );
}

function TeamPreview({
  team,
  isLoading,
  isError,
  onViewDetails,
  className,
}: {
  team: TeamDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  onViewDetails: () => void;
  className?: string;
}) {
  if (isLoading) {
    return (
      <div
        data-testid="team-preview-loading"
        className={cn('rounded-lg border border-border bg-card p-6', className)}
      >
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="mt-5 h-7 w-2/5" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
      </div>
    );
  }

  if (isError || !team) {
    return (
      <div
        className={cn(
          'rounded-lg border border-destructive bg-card p-6 text-sm text-destructive',
          className,
        )}
      >
        Takım detayları yüklenirken bir hata oluştu.
      </div>
    );
  }

  const manager = team.members.find((member) => member.role === 'teamAdmin');
  const visibleMembers = team.members.slice(0, 8);
  const overflow = team.members.length - visibleMembers.length;

  return (
    <article
      data-testid={`team-preview-${team.id}`}
      className={cn('rounded-lg border border-border bg-card p-5 shadow-card md:p-6', className)}
    >
      <div className="flex items-start justify-between gap-4">
        <Avatar className="h-16 w-16 border border-border bg-secondary">
          <AvatarFallback className="bg-secondary text-xl text-foreground">
            {initials(team.name)}
          </AvatarFallback>
        </Avatar>
        <MoreHorizontal className="h-5 w-5 text-secondary-foreground" aria-hidden />
      </div>

      <h2 className="mt-5 text-xl font-semibold text-foreground">{team.name}</h2>
      <p className="mt-1 text-sm text-secondary-foreground">
        {team.memberCount} {team.memberCount === 1 ? 'üye' : 'üye'}
      </p>

      {team.description && (
        <p className="mt-6 max-w-prose text-sm leading-6 text-secondary-foreground">
          {team.description}
        </p>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Üyeler</h3>
        <div className="mt-3 flex items-center">
          {visibleMembers.map((member) => (
            <MemberAvatar key={member.userId} member={member} className="-ml-2 first:ml-0" />
          ))}
          {overflow > 0 && (
            <span className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-secondary text-xs font-semibold text-foreground">
              +{overflow}
            </span>
          )}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-secondary-foreground">Takım Yöneticisi</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{manager?.fullName ?? '—'}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-secondary-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Oluşturulma Tarihi
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {formatCreatedAt(team.createdAt)}
          </dd>
        </div>
      </dl>

      <Button type="button" className="mt-6 w-full justify-between" onClick={onViewDetails}>
        <span className="inline-flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Takım detaylarını görüntüle
        </span>
        <ArrowRight className="h-4 w-4" />
      </Button>
    </article>
  );
}

export function TeamsPage() {
  const { data, isLoading, isError } = useTeams();
  const { isCompanyAdmin } = useAuth();
  const navigate = useNavigate();
  const allTeams = data ?? [];
  const teams = allTeams.slice(0, MAX_RENDERED_RECORDS);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [mobileExpandedTeamId, setMobileExpandedTeamId] = useState<string | null>(null);
  const selectedId = teams.some((team) => team.id === selectedTeamId)
    ? selectedTeamId
    : teams[0]?.id;
  const {
    data: selectedTeam,
    isLoading: selectedTeamLoading,
    isError: selectedTeamError,
  } = useTeam(selectedId ?? undefined);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Takımlar</h1>
          <p className="mt-1 text-sm text-secondary-foreground">
            Üyesi olduğun veya yönettiğin takımlar.
          </p>
        </div>
        {isCompanyAdmin && <CreateTeamModal />}
      </header>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <Skeleton className="h-96 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive bg-card p-6 text-sm text-destructive">
          Takımlar yüklenirken bir hata oluştu.
        </div>
      )}

      {!isLoading && !isError && teams.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm text-secondary-foreground">
            {isCompanyAdmin
              ? 'Henüz bir takım yok. Yukarıdan yeni bir takım oluşturabilirsin.'
              : 'Henüz hiçbir takımın yok. Şirket yöneticisi seni eklediğinde burada görünecek.'}
          </p>
        </div>
      )}

      {!isLoading && !isError && teams.length > 0 && (
        <div className="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:gap-6">
          <div
            className="overflow-hidden rounded-lg border border-border bg-card"
            data-testid="team-directory"
          >
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Takımlarım</h2>
            </div>
            <div role="listbox" aria-label="Takım dizini">
              {teams.map((team) => {
                const selected = team.id === selectedId;
                const mobileExpanded = team.id === mobileExpandedTeamId;
                return (
                  <div key={team.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-expanded={mobileExpanded}
                      aria-controls={`team-mobile-preview-${team.id}`}
                      data-testid={`team-directory-item-${team.id}`}
                      onClick={() => {
                        setSelectedTeamId(team.id);
                        setMobileExpandedTeamId((current) =>
                          current === team.id ? null : team.id,
                        );
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                        selected
                          ? 'relative bg-primary/10 text-foreground before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-r-full before:bg-primary before:content-[""]'
                          : 'hover:bg-secondary',
                      )}
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-foreground">
                        {initials(team.name).slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{team.name}</span>
                        <span className="mt-0.5 block text-xs text-secondary-foreground">
                          {team.memberCount} {team.memberCount === 1 ? 'üye' : 'üye'}
                        </span>
                      </span>
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 shrink-0 text-secondary-foreground transition-transform',
                          mobileExpanded && 'rotate-90',
                        )}
                      />
                    </button>
                    {mobileExpanded && (
                      <div
                        id={`team-mobile-preview-${team.id}`}
                        data-testid={`team-mobile-preview-${team.id}`}
                        className="border-b border-border bg-muted/30 px-4 py-4 md:hidden"
                      >
                        <TeamPreview
                          team={selectedTeam}
                          isLoading={selectedTeamLoading}
                          isError={selectedTeamError}
                          className="rounded-none border-0 bg-transparent p-0 shadow-none"
                          onViewDetails={() => {
                            if (selectedId) navigate(`/teams/${selectedId}`);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hidden min-w-0 md:block">
            <TeamPreview
              team={selectedTeam}
              isLoading={selectedTeamLoading}
              isError={selectedTeamError}
              onViewDetails={() => selectedId && navigate(`/teams/${selectedId}`)}
            />
          </div>
        </div>
      )}

      {allTeams.length > MAX_RENDERED_RECORDS && (
        <p className="text-xs text-muted-foreground">{RECORD_CAP_MESSAGE}</p>
      )}

      <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
        Panele dön
      </Button>
    </section>
  );
}
