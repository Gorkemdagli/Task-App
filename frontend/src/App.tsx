import { createContext, lazy, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getProtectedRouteSkeletonVariant, RouteFallback } from './components/layout/RouteFallback';
import { LogoutCoordinatorProvider } from './components/auth/LogoutCoordinator';
import { useAuthStore } from './stores/authStore';
import { authApi, getMe, type RefreshResponse } from './lib/api';
import {
  getPreloadedDashboardModules,
  getProtectedRouteChunk,
  loadAppShellModule,
  loadDashboardRouteModule,
  loadProtectedRouteModule,
  preloadProtectedRoute,
} from './lib/preloadDashboardRoute';
import { queryClient } from './lib/react-query';
import { queryKeys } from './lib/queryKeys';
import { teamDetailQueryOptions, teamsQueryOptions } from './hooks/queries/useTeams';
import { MAX_RENDERED_RECORDS } from './lib/listLimits';
import { useTeamStore } from './stores/teamStore';
import type { Team } from './services/teams';
import type { CurrentUserProfile } from './services/profile';
import {
  classifyGlobalError,
  clearGlobalError,
  getGlobalError,
  setGlobalError,
  subscribeGlobalError,
} from './lib/globalError';
import { LandingPage } from './pages/Landing/LandingPage';

const AuthLayout = lazy(() =>
  import('./pages/Auth/AuthLayout').then((module) => ({ default: module.AuthLayout })),
);
const ProtectedRoute = lazy(() =>
  loadProtectedRouteModule().then((module) => ({ default: module.ProtectedRoute })),
);
const GlobalErrorPage = lazy(() =>
  import('./components/layout/GlobalErrorPage').then((module) => ({ default: module.GlobalErrorPage })),
);
const LoginPage = lazy(() =>
  import('./pages/Auth/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('./pages/Auth/RegisterPage').then((module) => ({ default: module.RegisterPage })),
);
const AppShell = lazy(() =>
  loadAppShellModule().then((module) => ({ default: module.AppShell })),
);
const DashboardPage = lazy(() =>
  loadDashboardRouteModule().then((module) => ({ default: module.DashboardPage })),
);
const TeamsPage = lazy(() =>
  import('./pages/Teams').then((module) => ({ default: module.TeamsPage })),
);
const TeamDetailPage = lazy(() =>
  import('./pages/TeamDetail').then((module) => ({ default: module.TeamDetailPage })),
);
const TasksPage = lazy(() =>
  import('./pages/Tasks').then((module) => ({ default: module.TasksPage })),
);
const TaskDetailPage = lazy(() =>
  import('./pages/TaskDetail').then((module) => ({ default: module.TaskDetailPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/Notifications').then((module) => ({ default: module.NotificationsPage })),
);
const ChatPage = lazy(() =>
  import('./pages/Chat').then((module) => ({ default: module.ChatPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/Profile').then((module) => ({ default: module.ProfilePage })),
);
const PermissionsPage = lazy(() =>
  import('./pages/Permissions').then((module) => ({ default: module.PermissionsPage })),
);
const CompanyManagementPage = lazy(() =>
  import('./pages/Company').then((module) => ({ default: module.CompanyManagementPage })),
);

type PreloadedDashboardModules = NonNullable<ReturnType<typeof getPreloadedDashboardModules>>;
const DashboardModulesContext = createContext<PreloadedDashboardModules | undefined>(undefined);

function ProtectedRouteSlot() {
  const { pathname } = useLocation();
  const [modules] = useState(() =>
    getProtectedRouteChunk(pathname)?.[1] === 'dashboard' ? getPreloadedDashboardModules() : undefined,
  );
  const [Component] = useState(() => modules?.ProtectedRoute ?? ProtectedRoute);

  return (
    <DashboardModulesContext.Provider value={modules}>
      <Component />
    </DashboardModulesContext.Provider>
  );
}

function AppShellSlot() {
  const modules = useContext(DashboardModulesContext);
  const [Component] = useState(() => modules?.AppShell ?? AppShell);
  return <Component />;
}

function DashboardPageSlot() {
  const modules = useContext(DashboardModulesContext);
  const [Component] = useState(() => modules?.DashboardPage ?? DashboardPage);
  return <Component />;
}

const AuthBootstrapContext = createContext(false);

function isCurrentUserProfile(value: unknown): value is CurrentUserProfile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.id === 'string' &&
    typeof profile.displayId === 'string' &&
    typeof profile.email === 'string' &&
    typeof profile.fullName === 'string' &&
    (profile.role === 'companyAdmin' || profile.role === 'member') &&
    (profile.tenantId === null || typeof profile.tenantId === 'string') &&
    (profile.tenantName === null || typeof profile.tenantName === 'string') &&
    (profile.avatarUrl === null || typeof profile.avatarUrl === 'string') &&
    (profile.tenantLogoUrl === null || typeof profile.tenantLogoUrl === 'string') &&
    typeof profile.notifyTaskAssigned === 'boolean' &&
    typeof profile.notifyTaskCommented === 'boolean' &&
    typeof profile.notifyMessageReceived === 'boolean'
  );
}

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionGeneration = useAuthStore((s) => s.sessionGeneration);
  const [initialSessionGeneration] = useState(() => useAuthStore.getState().sessionGeneration);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const generation = useAuthStore.getState().sessionGeneration;
    const isCurrent = () =>
      active && useAuthStore.getState().sessionGeneration === generation;

    if (getProtectedRouteSkeletonVariant(window.location.pathname)) {
      void preloadProtectedRoute(window.location.pathname);
    }

    (async () => {
      try {
        const response = await authApi.post<RefreshResponse>('/refresh', null);
        if (!isCurrent()) return;

        if (response.status === 204) {
          clearAuth();
          queryClient.clear();
          return;
        }
        const data = response.data;
        setAccessToken(data.accessToken);
        const canonicalUser = isCurrentUserProfile(data.user) ? data.user : await getMe();
        if (!isCurrent()) return;
        queryClient.setQueryData(queryKeys.profile(canonicalUser.id), canonicalUser);
        setUser(canonicalUser);
        const authenticatedGeneration = useAuthStore.getState().sessionGeneration;
        if (canonicalUser.tenantId && window.location.pathname === '/dashboard') {
          const tenantId = canonicalUser.tenantId;
          const selectedTeamId =
            canonicalUser.role === 'member' ? useTeamStore.getState().activeTeamId : null;
          const teamsQueryKey = queryKeys.teams.list(tenantId);
          const teamsPrefetch = queryClient.prefetchQuery(teamsQueryOptions(tenantId));
          if (selectedTeamId) {
            void teamsPrefetch.then(() => {
              const currentUser = useAuthStore.getState().user;
              const currentGeneration = useAuthStore.getState().sessionGeneration;
              const teams = queryClient.getQueryData<Team[]>(teamsQueryKey);
              const visibleTeams = Array.isArray(teams)
                ? [...teams]
                    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
                    .slice(0, MAX_RENDERED_RECORDS)
                : [];
              if (
                !active ||
                currentGeneration !== authenticatedGeneration ||
                window.location.pathname !== '/dashboard' ||
                currentUser?.id !== canonicalUser.id ||
                currentUser.tenantId !== tenantId ||
                currentUser.role !== 'member' ||
                useTeamStore.getState().activeTeamId !== selectedTeamId ||
                queryClient.getQueryState(teamsQueryKey)?.status !== 'success'
              ) return;
              const selectedTeam = visibleTeams.find(
                (team) => team.id === selectedTeamId && team.tenantId === tenantId,
              );
              if (selectedTeam) {
                void queryClient.prefetchQuery(teamDetailQueryOptions(tenantId, selectedTeam.id));
              }
            }).catch(() => undefined);
          }
        }
        if (['/login', '/register'].includes(window.location.pathname)) {
          navigateRef.current('/dashboard', { replace: true });
        }
      } catch (error) {
        if (!isCurrent()) return;
        const kind = classifyGlobalError(error);
        if (kind === 'session-expired') {
          if (useAuthStore.getState().accessToken) setGlobalError(kind);
          queryClient.clear();
          clearAuth();
        } else if (
          useAuthStore.getState().accessToken ||
          !['/', '/login', '/register'].includes(window.location.pathname)
        ) {
          setGlobalError(kind, () => {
            clearGlobalError();
            setBootstrapped(false);
            setBootstrapAttempt((attempt) => attempt + 1);
          });
        }
      } finally {
        if (active) setBootstrapped(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [bootstrapAttempt, clearAuth, setAccessToken, setUser]);

  const loginEstablishedDuringBootstrap =
    Boolean(accessToken) && sessionGeneration !== initialSessionGeneration;
  if (
    !bootstrapped &&
    pathname !== '/' &&
    pathname !== '/login' &&
    !loginEstablishedDuringBootstrap
  ) return <RouteFallback variant={getProtectedRouteSkeletonVariant(pathname)} />;
  return <AuthBootstrapContext.Provider value={bootstrapped}>{children}</AuthBootstrapContext.Provider>;
}

function RootRoute({ hasGlobalError }: { hasGlobalError: boolean }) {
  const bootstrapComplete = useContext(AuthBootstrapContext);
  const user = useAuthStore((s) => s.user);

  return <LandingPage hasConfirmedSession={bootstrapComplete && !hasGlobalError && Boolean(user)} />;
}

function AppRoutes() {
  const globalError = useSyncExternalStore(subscribeGlobalError, getGlobalError);
  const { pathname } = useLocation();
  const routeSkeletonVariant = getProtectedRouteSkeletonVariant(pathname);

  if (globalError && pathname !== '/') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <GlobalErrorPage kind={globalError} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteFallback variant={routeSkeletonVariant} />}>
      <Routes>
        <Route path="/" element={<RootRoute hasGlobalError={Boolean(globalError)} />} />
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedRouteSlot />}>
          <Route element={<AppShellSlot />}>
            <Route path="/dashboard" element={<DashboardPageSlot />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/teams/:id" element={<TeamDetailPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/chat/:id" element={<ChatPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/permissions" element={<PermissionsPage />} />
            <Route path="/company" element={<CompanyManagementPage />} />
            <Route path="/company/settings" element={<Navigate to="/company" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<GlobalErrorPage kind="not-found" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap>
        <LogoutCoordinatorProvider>
          <AppRoutes />
        </LogoutCoordinatorProvider>
      </AuthBootstrap>
    </BrowserRouter>
  );
}
