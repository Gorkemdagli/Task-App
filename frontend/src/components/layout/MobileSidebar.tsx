import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, X } from 'lucide-react';
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
 * Mobile sidebar — Sheet drawer for <768px viewports. Mirrors the desktop
 * sidebar's content (tenant header + team selector + member list).
 *
 * Implementation note: shadcn's Sheet primitive references tokens
 * (bg-muted, bg-accent, bg-popover) that aren't defined in TaskFlow's locked
 * token system (FRONTEND.md §6). This wrapper uses Radix Dialog directly with
 * our token classes so styles match the rest of the app without expanding the
 * design system. shadcn's Sheet stays installed for future use by other
 * teams.
 */
export function MobileSidebar() {
  const open = useUiStore((s) => s.mobileSheetOpen);
  const setOpen = useUiStore((s) => s.setMobileSheetOpen);
  const { user } = useAuth();
  const [activeTeamId, setActiveTeamId] = React.useState(MOCK_DEFAULT_TEAM_ID);
  const activeTeam = MOCK_TEAMS.find((t) => t.id === activeTeamId) ?? MOCK_TEAMS[0];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/60',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 left-0 z-50 h-full w-3/4 max-w-sm border-r border-border bg-card text-foreground shadow-modal',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
            'duration-200 ease-out',
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-lg font-bold text-primary">TaskFlow</span>
              <DialogPrimitive.Close
                aria-label="Menüyü kapat"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>

            <div className="border-b border-border p-4">
              <p className="text-xs uppercase tracking-wide text-secondary-foreground">Şirket</p>
              <p className="truncate text-sm font-semibold text-foreground">TaskFlow Şirketim</p>
              <p className="mt-1 text-xs text-secondary-foreground">
                {user ? roleLabel[user.role] : '—'}
              </p>
            </div>

            <div className="border-b border-border p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-secondary-foreground">
                Takım
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    <span className="truncate">{activeTeam.name}</span>
                    <ChevronDown className="h-4 w-4 text-secondary-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={4}
                  className="bg-card text-foreground"
                >
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

            <div className="flex-1 overflow-y-auto p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-secondary-foreground">
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
                      <p className="truncate text-xs text-secondary-foreground">
                        {roleLabel[m.role]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
