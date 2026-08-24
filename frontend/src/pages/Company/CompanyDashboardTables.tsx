import { Link } from 'react-router-dom';
import { RECORD_CAP_MESSAGE } from '@/lib/listLimits';
import type { CompanyDashboard } from '@/services/companyDashboard';
import { buildMemberTasksUrl, buildTeamTasksUrl } from './companyDashboardNavigation';

type Members = CompanyDashboard['members'];
type Teams = CompanyDashboard['teams'];

export function MemberWorkloadTable({
  members,
  teamId,
}: {
  members: Members;
  teamId: string | null;
}) {
  const maxOpenTaskCount = Math.max(0, ...members.items.map((member) => member.openTaskCount));

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Üye görev yükü</h2>
        <p className="text-sm text-secondary-foreground">Mevcut atamalara göre görev dağılımı</p>
      </div>
      <div className="overflow-x-auto">
        <table aria-label="Üye görev yükü" className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-xs text-secondary-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Üye</th>
              <th className="px-3 py-2 font-medium">Atanan</th>
              <th className="px-3 py-2 font-medium">Açık</th>
              <th className="px-3 py-2 font-medium">Tamamlanan</th>
              <th className="px-3 py-2 font-medium">Süresi dolan</th>
              <th className="px-3 py-2 font-medium">Tamamlanma</th>
            </tr>
          </thead>
          <tbody>
            {members.items.map((member) => {
              const width =
                maxOpenTaskCount === 0
                  ? 0
                  : Math.round((member.openTaskCount / maxOpenTaskCount) * 100);
              return (
                <tr key={member.userId} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-3 font-medium">
                    <Link
                      to={buildMemberTasksUrl(member.userId, teamId)}
                      className="rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`${member.fullName} görevlerini aç`}
                    >
                      {member.fullName}
                    </Link>
                  </td>
                  <td className="px-3 py-3">{member.assignedTaskCount}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        to={buildMemberTasksUrl(member.userId, teamId)}
                        className="rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`${member.fullName}: ${member.openTaskCount} açık görev`}
                      >
                        {member.openTaskCount}
                      </Link>
                      <span
                        className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">{member.completedTaskCount}</td>
                  <td className="px-3 py-3">{member.expiredTaskCount}</td>
                  <td className="px-3 py-3">%{member.completionRate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {members.capped && (
        <p className="mt-3 text-xs text-secondary-foreground">{RECORD_CAP_MESSAGE}</p>
      )}
    </section>
  );
}

export function TeamComparisonTable({ teams }: { teams: Teams }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Takım karşılaştırması</h2>
        <p className="text-sm text-secondary-foreground">Şirket kapsamındaki görev sonuçları</p>
      </div>
      <div className="overflow-x-auto">
        <table
          aria-label="Takım karşılaştırması"
          className="w-full min-w-[560px] text-left text-sm"
        >
          <thead className="border-b border-border text-xs text-secondary-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Takım</th>
              <th className="px-3 py-2 font-medium">Açık</th>
              <th className="px-3 py-2 font-medium">Tamamlanan</th>
              <th className="px-3 py-2 font-medium">Süresi dolan</th>
              <th className="px-3 py-2 font-medium">Tamamlanma</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.teamId} className="border-b border-border last:border-b-0">
                <td className="px-3 py-3 font-medium">
                  <Link
                    to={buildTeamTasksUrl(team.teamId)}
                    className="rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`${team.teamName} takım görevlerini aç`}
                  >
                    {team.teamName}
                  </Link>
                </td>
                <td className="px-3 py-3">{team.openTaskCount}</td>
                <td className="px-3 py-3">{team.completedTaskCount}</td>
                <td className="px-3 py-3">{team.expiredTaskCount}</td>
                <td className="px-3 py-3">%{team.completionRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
