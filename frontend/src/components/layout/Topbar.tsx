import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import {
  Bell,
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useUiStore } from '@/stores/uiStore';
import { useLogout } from '@/components/auth/LogoutCoordinator';
import { useCreateCompany } from '@/hooks/queries/useProfile';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
  queueAutomaticNotificationRead,
} from '@/hooks/useNotifications';
import {
  useAcceptCompanyInvitation,
  useCompanyInvitations,
  useRejectCompanyInvitation,
} from '@/hooks/queries/useCompanyInvitations';
import type { NotificationItem } from '@/hooks/useNotifications';
import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { PRIMARY_NAV, canSeeNavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n';
import usFlag from '@/assets/flags/us.png';
import trFlag from '@/assets/flags/tr.png';

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
  const { t, i18n } = useTranslation();
  const { mode, toggleMode } = useTheme();
  const { user, isCompanyAdmin } = useAuth();
  const logout = useLogout();
  const openMobileSheet = useUiStore((s) => s.openMobileSheet);
  const navigate = useNavigate();
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const notifications = useNotifications();
  const items = notifications.data?.pages[0]?.items ?? [];
  const unreadCount = notifications.data?.pages[0]?.unreadCount ?? 0;
  const companyInvitations = useCompanyInvitations();
  const invitations = companyInvitations.data ?? [];
  const acceptInvitation = useAcceptCompanyInvitation();
  const rejectInvitation = useRejectCompanyInvitation();
  const notificationsKnown = notifications.data !== undefined || !user?.tenantId;
  const notificationCount = notificationsKnown && companyInvitations.data
    ? unreadCount + invitations.length
    : undefined;
  const { mutate: markRead, mutateAsync: markReadAsync } = useMarkNotificationRead();
  const autoRead = useCallback(
    (id: string) => queueAutomaticNotificationRead(id, () => markReadAsync(id)),
    [markReadAsync],
  );
  const markAllRead = useMarkAllRead();
  const [bellOpen, setBellOpen] = useState(false);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyCreationError, setCompanyCreationError] = useState<string | null>(null);
  const createCompany = useCreateCompany();

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCompanyCreationError(null);
    try {
      await createCompany.mutateAsync({ companyName });
    } catch (error) {
      const data = (error as { response?: { data?: { error?: string; code?: string } } }).response
        ?.data;
      const code = data?.error ?? data?.code;
      setCompanyCreationError(
        code === 'CONFLICT_SLUG'
          ? 'companyCreation.nameTaken'
          : code === 'COMPANY_ALREADY_ASSIGNED'
            ? 'companyCreation.alreadyAssigned'
            : 'companyCreation.error',
      );
    }
  }

  function handleNotificationSelect(item: NotificationItem) {
    if (
      item.type === 'message_received' ||
      item.type === 'company_invite_accepted' ||
      item.type === 'company_invite_rejected'
    ) return;
    if (item.readAt === null) markRead(item.id);
    if (!('taskId' in item.payload)) return;
    setBellOpen(false);
    navigate(`/tasks/${item.payload.taskId}`);
  }

  function handleLogout() {
    void logout();
  }

  function handleAcceptInvitation(id: string) {
    acceptInvitation.mutate(id, { onSuccess: () => navigate('/dashboard') });
  }

  function handleRejectInvitation(id: string) {
    rejectInvitation.mutate(id);
  }

  const initials = (user?.fullName ?? '?')
    .split(' ')
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const visibleNav = PRIMARY_NAV.filter(
    (item) => item.path !== '/profile' && canSeeNavItem(item, user?.role),
  );
  const topbarNav = visibleNav.flatMap((item) =>
    item.path === '/dashboard' && isCompanyAdmin
      ? [item, { ...item, path: '/company', label: 'Şirket' }]
      : [item],
  );

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-card px-4 md:px-6">
      {/* Left cluster */}
      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={openMobileSheet}
          className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary md:hidden"
          aria-label={t('Menüyü aç')}
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link
          to="/dashboard"
          className="text-xl font-bold tracking-tight text-primary hover:opacity-90"
        >
          <span className="text-foreground">Task</span><span className="text-primary">Flow</span>
        </Link>

        <nav className="hidden items-center md:flex" aria-label={t('Birincil gezinme')}>
          {topbarNav.map((item) => (
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
              {t(item.label)}
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
              aria-label={t(
                notificationCount !== undefined && notificationCount > 0
                  ? 'Bildirimler ({{count}} okunmamış)'
                  : 'Bildirimler',
                { count: notificationCount },
              )}
              data-testid="notification-bell"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary"
            >
              <Bell className="h-5 w-5" />
              {notificationCount !== undefined && <NotificationBadge count={notificationCount} />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="bg-card p-0 text-foreground">
            <NotificationPanel
              items={items}
              unreadCount={unreadCount}
              onSelect={handleNotificationSelect}
              onAutoRead={autoRead}
              onMarkAllRead={() => markAllRead.mutate()}
              onViewAll={() => {
                setBellOpen(false);
              }}
              invitations={invitations}
              notificationDataKnown={notificationsKnown}
              invitationDataKnown={companyInvitations.data !== undefined}
              notificationsLoading={notifications.isPending}
              invitationsLoading={companyInvitations.isPending}
              notificationsError={
                notifications.isError ? t('Bildirimler yüklenemedi.') : undefined
              }
              invitationListError={
                companyInvitations.isError ? t('Davetler yüklenemedi.') : undefined
              }
              onRetryNotifications={() => void notifications.refetch()}
              onRetryInvitations={() => void companyInvitations.refetch()}
              onAcceptInvitation={handleAcceptInvitation}
              onRejectInvitation={handleRejectInvitation}
              isAcceptingInvitation={acceptInvitation.isPending}
              isRejectingInvitation={rejectInvitation.isPending}
              invitationError={
                acceptInvitation.isError || rejectInvitation.isError
                  ? t('Davet işlemi başarısız oldu.')
                  : undefined
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void i18n.changeLanguage(i18n.language === 'tr' ? 'en' : 'tr')}
          aria-label={t(i18n.language === 'tr' ? 'Dili İngilizce yap' : 'Switch language to Turkish')}
          className="h-10 w-10 p-0"
        >
          <img
            src={i18n.language === 'tr' ? trFlag : usFlag}
            alt=""
            aria-hidden="true"
            className="h-6 w-6"
          />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMode}
          aria-label={t(mode === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç')}
          className="h-10 w-10 p-0"
        >
          {mode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              ref={userMenuTriggerRef}
              type="button"
              className="ml-1 inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-secondary"
              aria-label={t('Kullanıcı menüsünü aç')}
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-secondary text-xs font-semibold text-foreground">
                  {initials || '??'}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium text-foreground md:inline">
                {user?.fullName ?? t('Kullanıcı')}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-secondary-foreground md:inline" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="w-[220px] rounded-xl border-border bg-popover p-2 text-popover-foreground shadow-xl"
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-3 px-2 py-2">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                    {initials || '??'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.fullName ?? t('Kullanıcı')}
                  </p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email ?? '—'}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1 bg-border" />
            <DropdownMenuItem
              onSelect={() => null /* Navigation handled by Link below */}
              className="rounded-lg focus:bg-secondary"
              asChild
            >
              <Link to="/profile" className="flex w-full items-center gap-2 py-1">
                <User className="h-4 w-4" />
                {t('Profil')}
              </Link>
            </DropdownMenuItem>
            {user?.tenantId === null && (
              <DropdownMenuItem
                onSelect={() => {
                  setCompanyName('');
                  setCompanyCreationError(null);
                  setCompanyDialogOpen(true);
                }}
                className="rounded-lg focus:bg-secondary"
              >
                <Building2 className="h-4 w-4" />
                {t('companyCreation.open')}
              </DropdownMenuItem>
            )}
            {isCompanyAdmin && (
              <DropdownMenuItem asChild className="rounded-lg focus:bg-secondary">
                <Link to="/company" className="flex w-full items-center gap-2 py-1">
                  <Settings className="h-4 w-4" />
                  {t('Şirket Yönetimi')}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-1 bg-border" />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="rounded-lg text-priority-high focus:bg-secondary focus:text-priority-high"
            >
              <LogOut className="h-4 w-4" />
              {t('Oturumu Kapat')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog
          open={companyDialogOpen}
          onOpenChange={(open) => {
            if (createCompany.isPending) return;
            setCompanyDialogOpen(open);
            if (!open) {
              setCompanyName('');
              setCompanyCreationError(null);
            }
          }}
        >
          <DialogContent
            className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border-border bg-card p-5 sm:p-6"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              userMenuTriggerRef.current?.focus();
            }}
          >
            <form className="space-y-6" onSubmit={handleCreateCompany}>
              <DialogHeader>
                <DialogTitle>{t('companyCreation.title')}</DialogTitle>
                <DialogDescription>{t('companyCreation.description')}</DialogDescription>
              </DialogHeader>
              <label htmlFor="new-company-name" className="block space-y-2 text-sm font-medium">
                <span>{t('companyCreation.name')}</span>
                <Input
                  id="new-company-name"
                  type="text"
                  autoComplete="organization"
                  maxLength={100}
                  value={companyName}
                  disabled={createCompany.isPending}
                  aria-invalid={Boolean(companyCreationError)}
                  aria-describedby={companyCreationError ? 'company-creation-error' : undefined}
                  onChange={(event) => {
                    setCompanyName(event.target.value);
                    setCompanyCreationError(null);
                  }}
                />
              </label>
              {companyCreationError && (
                <p id="company-creation-error" role="alert" className="text-sm text-destructive">
                  {t(companyCreationError)}
                </p>
              )}
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={createCompany.isPending}
                  onClick={() => setCompanyDialogOpen(false)}
                >
                  {t('companyCreation.cancel')}
                </Button>
                <Button
                  type="submit"
                  loading={createCompany.isPending}
                  disabled={!companyName.trim() || createCompany.isPending}
                >
                  {t('companyCreation.submit')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
