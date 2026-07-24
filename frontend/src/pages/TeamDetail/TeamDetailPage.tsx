import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTeam } from '@/hooks/queries/useTeams';
import { useTasks } from '@/hooks/tasks';
import { useAuth } from '@/hooks/useAuth';
import { useTeamStore } from '@/stores/teamStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MemberList } from './MemberList';
import { AddMemberModal } from './AddMemberModal';
import { TaskCardRow } from '@/components/tasks/TaskCardRow';

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: team, isLoading, isError } = useTeam(id);
  const { user, isCompanyAdmin } = useAuth();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const navigate = useNavigate();
  const { data: tasksData, isLoading: tasksLoading } = useTasks(
    id ? { teamId: id, includeArchived: false, limit: 100 } : undefined,
  );
  const tasks = tasksData?.tasks ?? [];

  // Per-team admin: companyAdmin her zaman; aksi halde viewer'ın bu takımdaki
  // TeamMember.role === 'teamAdmin' olmalı (JWT'ye güvenemeyiz — per-team rol
  // DB'de yaşar).
  const viewerMembership = team?.members.find((m) => m.userId === user?.id);
  const isTeamAdminOfThisTeam = viewerMembership?.role === 'teamAdmin';
  const canManage = isCompanyAdmin || isTeamAdminOfThisTeam;

  // URL değişirse activeTeamId'yi senkronize et (sidebar ile).
  useEffect(() => {
    if (id) setActiveTeamId(id);
  }, [id, setActiveTeamId]);

  if (isLoading) {
    return (
      <section className="mx-auto max-w-3xl space-y-6 p-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </section>
    );
  }

  if (isError || !team) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="text-2xl font-bold text-foreground">Takım bulunamadı</h1>
        <p className="text-sm text-secondary-foreground">
          Bu takıma erişim yetkin yok ya da takım mevcut değil.
        </p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
          Takımlara dön
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-8 p-8">
      <Button variant="ghost" size="sm" onClick={() => navigate('/teams')} className="-ml-2">
        <ChevronLeft className="h-4 w-4" />
        Takımlar
      </Button>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">{team.name}</h1>
        {team.description && (
          <p className="text-sm text-secondary-foreground">{team.description}</p>
        )}
      </header>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Üyeler{' '}
            <span className="text-sm text-secondary-foreground">({team.members.length})</span>
          </h2>
          {canManage && <AddMemberModal teamId={team.id} />}
        </div>
        <MemberList members={team.members} teamId={team.id} canManage={canManage} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Görevler{' '}
            <span className="text-sm text-secondary-foreground">({tasks.length})</span>
          </h2>
        </div>
        {tasksLoading ? (
          <Skeleton className="h-16 w-full rounded-md" />
        ) : tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
            Bu takımda görev yok.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-card" data-testid="team-tasks-list">
            {tasks.map((t) => (
              <TaskCardRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
