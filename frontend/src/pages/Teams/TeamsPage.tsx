import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useTeams } from '@/hooks/queries/useTeams';
import { MAX_RENDERED_RECORDS, RECORD_CAP_MESSAGE } from '@/lib/listLimits';
import { useAuth } from '@/hooks/useAuth';
import { useTeamStore } from '@/stores/teamStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateTeamModal } from './CreateTeamModal';

export function TeamsPage() {
  const { data, isLoading, isError } = useTeams();
  const { isCompanyAdmin } = useAuth();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const navigate = useNavigate();
  const allTeams = data ?? [];
  const teams = allTeams.slice(0, MAX_RENDERED_RECORDS);

  function handleOpen(teamId: string) {
    setActiveTeamId(teamId);
    navigate(`/teams/${teamId}`);
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Takımlar</h1>
          <p className="mt-1 text-sm text-secondary-foreground">
            Üyesi olduğun veya yönettiğin takımlar.
          </p>
        </div>
        {isCompanyAdmin && <CreateTeamModal />}
      </header>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
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

      {!isLoading && teams.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleOpen(t.id)}
              className="group rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <h2 className="text-lg font-semibold text-foreground group-hover:text-primary">
                {t.name}
              </h2>
              {t.description && (
                <p className="mt-2 line-clamp-2 text-sm text-secondary-foreground">
                  {t.description}
                </p>
              )}
              <div className="mt-4 flex items-center gap-1.5 text-xs text-secondary-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>
                  {t.memberCount} {t.memberCount === 1 ? 'üye' : 'üye'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {allTeams.length > MAX_RENDERED_RECORDS && (
        <p className="text-xs text-muted-foreground">{RECORD_CAP_MESSAGE}</p>
      )}

      <div className="pt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          Panele dön
        </Button>
      </div>
    </section>
  );
}
