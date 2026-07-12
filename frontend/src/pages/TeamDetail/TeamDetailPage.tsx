import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTeam } from '@/hooks/queries/useTeams';
import { useAuth } from '@/hooks/useAuth';
import { useTeamStore } from '@/stores/teamStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MemberList } from './MemberList';
import { AddMemberModal } from './AddMemberModal';

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: team, isLoading, isError } = useTeam(id);
  const { isCompanyAdmin } = useAuth();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const navigate = useNavigate();

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
          {isCompanyAdmin && <AddMemberModal teamId={team.id} />}
        </div>
        <MemberList members={team.members} teamId={team.id} canManage={isCompanyAdmin} />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Görevler</h2>
        <p className="text-sm text-secondary-foreground">
          Bu takımda şu an <span className="font-medium text-foreground">{team.taskCount}</span>{' '}
          görev var. Görev yönetimi FAZ-5'te açılacak.
        </p>
      </div>
    </section>
  );
}
