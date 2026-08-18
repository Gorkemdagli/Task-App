import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, Moon, Settings, Sun, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { useUiStore } from '@/stores/uiStore';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
} from '@/hooks/useNotifications';
import type { NotificationItem } from '@/hooks/useNotifications';
import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { PRIMARY_NAV, canSeeNavItem } from '@/lib/navigation';
import { queryClient } from '@/lib/react-query';
import { cn } from '@/lib/utils';

/**
 * Topbar (FRONTEND.md §5.2):
 * - h-14, sticky top-0, bg-card, border-b
 * - Left: logo + (md+) primary nav with signature 3-4px amber active stripe
 * - Right: bell (notifications dropdown with badge + panel) + theme toggle + avatar dropdown (profile, settings*, logout)
 * - Mobile (<768px): hamburger replaces nav; nav lives inside MobileSidebar (Sheet)
 */
export function Topbar() {
  const identity = useAuthStore((s) => `${s.user?.tenantId ?? 'none'}:${s.user?.id ?? 'none'}`);

  return <TopbarContent key={identity} />;
}

function TopbarContent() {
  const { mode, toggleMode } = useTheme();
  const { user, isCompanyAdmin } = useAuth();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearActiveTeam = useTeamStore((s) => s.clearActiveTeam);
  const openMobileSheet = useUiStore((s) => s.openMobileSheet);
  const navigate = useNavigate();

  const notifications = useNotifications();
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = notifications.data?.pages[0]?.unreadCount ?? 0;
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();
  const [bellOpen, setBellOpen] = useState(false);

  function handleNotificationSelect(item: NotificationItem) {
    if (item.type === 'message_received') return;
    if (item.readAt === null) markRead.mutate(item.id);
    setBellOpen(false);
    navigate(`/tasks/${item.payload.taskId}`);
  }

  function handleLogout() {
    queryClient.clear();
    clearAuth();
    clearActiveTeam();
    navigate('/login', { replace: true });
  }

  const initials = (user?.fullName ?? '?')
    .split(' ')
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const visibleNav = PRIMARY_NAV.filter((item) => canSeeNavItem(item, user?.role));

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-card px-4 md:px-6">
      {/* Left cluster */}
      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={openMobileSheet}
          className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary md:hidden"
          aria-label="Menüyü aç"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link
          to="/dashboard"
          className="text-xl font-bold tracking-tight text-primary hover:opacity-90"
        >
          TaskFlow
        </Link>

        <nav className="hidden items-center md:flex" aria-label="Birincil gezinme">
          {visibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'relative inline-flex h-14 items-center px-3 text-sm transition-colors',
                  isActive
                    ? 'font-semibold text-primary'
                    : 'text-secondary-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1">
        <DropdownMenu open={bellOpen} onOpenChange={setBellOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={
                unreadCount > 0 ? `Bildirimler (${unreadCount} okunmamış)` : 'Bildirimler'
              }
              data-testid="notification-bell"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary"
            >
              <Bell className="h-5 w-5" />
              <NotificationBadge count={unreadCount} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="bg-card p-0 text-foreground">
            <NotificationPanel
              items={items}
              unreadCount={unreadCount}
              hasNextPage={Boolean(notifications.hasNextPage)}
              isFetchingNextPage={notifications.isFetchingNextPage}
              onLoadMore={() => notifications.fetchNextPage()}
              onSelect={handleNotificationSelect}
              onMarkAllRead={() => markAllRead.mutate()}
              onViewAll={() => {
                setBellOpen(false);
                navigate('/notifications');
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMode}
          aria-label={mode === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
          className="h-10 w-10 p-0"
        >
          {mode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-secondary"
              aria-label="Kullanıcı menüsünü aç"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-secondary text-xs font-semibold text-foreground">
                  {initials || '??'}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium text-foreground md:inline">
                {user?.fullName ?? 'Kullanıcı'}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-secondary-foreground md:inline" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="bg-card text-foreground">
            <DropdownMenuLabel className="text-secondary-foreground">
              {user?.email ?? '—'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onSelect={() => null /* Navigation handled by Link below */}
              className="focus:bg-secondary"
              asChild
            >
              <Link to="/profile" className="flex w-full items-center gap-2">
                <User className="h-4 w-4" />
                Profil
              </Link>
            </DropdownMenuItem>
            {isCompanyAdmin && (
              <DropdownMenuItem asChild className="focus:bg-secondary">
                <Link to="/company/settings" className="flex w-full items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Şirket Ayarları
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="text-priority-high focus:bg-secondary focus:text-priority-high"
            >
              <LogOut className="h-4 w-4" />
              Oturumu Kapat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
