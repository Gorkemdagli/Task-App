import { useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { MOCK_TEAMS, MOCK_DEFAULT_TEAM_ID } from '@/lib/mock/teams';
import { MOCK_MEMBERS } from '@/lib/mock/members';
import { cn } from '@/lib/utils';

const roleLabel: Record<'companyAdmin' | 'teamAdmin' | 'member', string> = {
  companyAdmin: 'Şirket Admini',
  teamAdmin: 'Takım Admini',
  member: 'Üye',
};

/**
 * Sidebar (PROJECT.md §5.1, FRONTEND.md §2, §6):
 * - Tight density: 260px wide, compact list rows (36-40px)
 * - Hidden <768px; on mobile the MobileSidebar sheet replicates this content
 * - Collapse to 64px (icon-only) via the footer button
 * - Signature: 3-4px amber left border on selected team + active nav
 *   (nav lives in Topbar; here we use the stripe on the active team row)
 */
export function Sidebar() {
  const { user } = useAuth();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const [activeTeamId, setActiveTeamId] = useState(MOCK_DEFAULT_TEAM_ID);

  const activeTeam = MOCK_TEAMS.find((t) => t.id === activeTeamId) ?? MOCK_TEAMS[0];

  if (collapsed) {
    return (
      <aside
        className="hidden w-16 shrink-0 flex-col border-r border-border bg-card md:flex"
        aria-label="Yan menü (daraltılmış)"
      >
        <div className="flex flex-1 flex-col items-center justify-between py-4">
          <div className="text-xs font-semibold text-primary">TF</div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary"
            aria-label="Kenar çubuğunu genişlet"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out md:flex"
      aria-label="Yan menü"
    >
      {/* Tenant header */}
      <div className="border-b border-border p-4">
        <p className="text-xs uppercase tracking-wide text-secondary-foreground">Şirket</p>
        <p className="truncate text-sm font-semibold text-foreground">TaskFlow Şirketim</p>
        <p className="mt-1 text-xs text-secondary-foreground">
          {user ? roleLabel[user.role] : '—'}
        </p>
      </div>

      {/* Team selector */}
      <div className="border-b border-border p-3">
        <p className="mb-1 px-1 text-xs uppercase tracking-wide text-secondary-foreground">Takım</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              aria-label="Aktif takımı değiştir"
            >
              <span className="truncate">{activeTeam.name}</span>
              <ChevronDown className="h-4 w-4 text-secondary-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-card text-foreground" sideOffset={4}>
            {MOCK_TEAMS.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={() => setActiveTeamId(t.id)}
                className={cn('focus:bg-secondary', t.id === activeTeamId && 'bg-secondary')}
              >
                {t.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 px-1 text-xs uppercase tracking-wide text-secondary-foreground">
          Takım Üyeleri ({MOCK_MEMBERS.length})
        </p>
        <ul className="space-y-1" role="list">
          {MOCK_MEMBERS.map((m) => (
            <li
              key={m.id}
              className="relative flex items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-secondary text-[11px] font-semibold text-foreground">
                  {m.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{m.fullName}</p>
                <p className="truncate text-xs text-secondary-foreground">{roleLabel[m.role]}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer: collapse */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-secondary-foreground hover:bg-secondary"
          aria-label="Kenar çubuğunu daralt"
        >
          <PanelLeftClose className="h-4 w-4" />
          Kenar çubuğunu daralt
        </button>
      </div>
    </aside>
  );
}
