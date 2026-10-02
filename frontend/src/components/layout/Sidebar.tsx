import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, UsersRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/queries/useProfile';
import { useUiStore } from '@/stores/uiStore';
import { useTeamStore } from '@/stores/teamStore';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { TeamSidebarSection } from './TeamSidebarSection';
import { useTranslation } from '@/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MAX_RENDERED_RECORDS } from '@/lib/listLimits';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Sidebar (PROJECT.md §5.1, FRONTEND.md §2, §6):
 * - Tight density: 260px wide, compact list rows (36-40px)
 * - Hidden <768px; on mobile the MobileSidebar sheet replicates this content
 * - Collapse to 64px (icon-only) via the footer button
 * - Signature: 3-4px amber left border on active team row
 */
export function Sidebar() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const navigate = useNavigate();

  const { data: teams, isLoading: teamsLoading } = useTeams();
  const sortedTeams = useMemo(
    () => [...(teams ?? [])].sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [i18n.language, teams],
  );
  const { data: activeTeam } = useTeam(activeTeamId ?? undefined);

  // Eksik veya stale seçimde alfabetik ilk takımı varsayılan yap.
  useEffect(() => {
    if (sortedTeams.length > 0 && !sortedTeams.some((team) => team.id === activeTeamId)) {
      setActiveTeamId(sortedTeams[0].id);
    }
  }, [activeTeamId, setActiveTeamId, sortedTeams]);

  // Stale activeTeamId (eski kullanıcı/logout sonrası) → listede yoksa temizle.
  // Yoksa 403'le patlar, Sidebar her sayfada render olduğu için /dashboard da etkilenir.
  useEffect(() => {
    if (activeTeamId && teams && teams.length === 0) {
      setActiveTeamId(null);
    }
  }, [activeTeamId, teams, setActiveTeamId]);

  const activeTeamName =
    activeTeam?.name ?? sortedTeams.find((t) => t.id === activeTeamId)?.name ?? t('Takım seç');
  const tenantName = profile?.tenantName?.trim() || user?.tenantName?.trim();
  const tenantLogoUrl = profile ? profile.tenantLogoUrl : (user?.tenantLogoUrl ?? null);

  function handleSelectTeam(teamId: string) {
    setActiveTeamId(teamId);
    navigate(`/teams/${teamId}`);
  }

  if (collapsed) {
    return (
      <aside
        className="hidden h-full w-16 shrink-0 flex-col border-r border-border bg-card md:flex"
          aria-label={t('Yan menü (daraltılmış)')}
      >
        <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-2 py-4">
          <Avatar
            role="img"
            aria-label={tenantName || 'TaskFlow'}
            title={tenantName || 'TaskFlow'}
            className="h-9 w-9 shrink-0 rounded-md border border-border"
          >
            {tenantLogoUrl && (
              <AvatarImage src={tenantLogoUrl} alt={tenantName || 'TaskFlow'} />
            )}
            <AvatarFallback className="rounded-md bg-secondary text-[10px] font-semibold text-primary">
              {tenantName ? initials(tenantName) : 'TF'}
            </AvatarFallback>
          </Avatar>
          <Avatar
            role="img"
            aria-label={`${activeTeamName} profil fotoğrafı`}
            title={activeTeamName}
            className="h-9 w-9 shrink-0 border border-border"
          >
            {activeTeam?.photoUrl && (
              <AvatarImage src={activeTeam.photoUrl} alt={activeTeamName} />
            )}
            <AvatarFallback className="bg-secondary text-[10px] font-semibold text-foreground">
              {initials(activeTeamName)}
            </AvatarFallback>
          </Avatar>

          <div
            role="img"
            aria-label={activeTeamName}
            title={activeTeamName}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-secondary-foreground"
          >
            <UsersRound aria-hidden="true" className="h-5 w-5" />
          </div>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          {activeTeam?.members.length ? (
            <ul className="flex flex-col items-center gap-2" role="list">
              {activeTeam.members.slice(0, MAX_RENDERED_RECORDS).map((member) => (
                <li key={member.userId} title={member.fullName}>
                  <Avatar className="h-8 w-8">
                    {member.avatarUrl && (
                      <AvatarImage src={member.avatarUrl} alt={member.fullName} />
                    )}
                    <AvatarFallback className="bg-secondary text-[10px] font-semibold text-foreground">
                      {initials(member.fullName)}
                    </AvatarFallback>
                  </Avatar>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="shrink-0 p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary"
            aria-label={t('Kenar çubuğunu genişlet')}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="hidden h-full w-[260px] shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out md:flex"
      aria-label={t('Yan menü')}
    >
      <TeamSidebarSection
        user={user}
        teams={sortedTeams}
        teamsLoading={teamsLoading}
        activeTeam={activeTeam}
        activeTeamId={activeTeamId}
        activeTeamName={activeTeamName}
        onSelectTeam={handleSelectTeam}
        mobile={false}
        teamSectionClassName="border-b border-border p-3"
        membersSectionClassName="p-3"
      />

      {/* Footer: collapse */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-secondary-foreground hover:bg-secondary"
          aria-label={t('Kenar çubuğunu daralt')}
        >
          <PanelLeftClose className="h-4 w-4" />
          {t('Kenar çubuğunu daralt')}
        </button>
      </div>
    </aside>
  );
}
