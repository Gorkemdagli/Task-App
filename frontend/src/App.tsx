import { createContext, lazy, Suspense, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { RouteFallback } from './components/layout/RouteFallback';
import { LogoutCoordinatorProvider } from './components/auth/LogoutCoordinator';
import { useAuthStore } from './stores/authStore';
import { authApi, getMe } from './lib/api';
import { queryClient } from './lib/react-query';
import { queryKeys } from './lib/queryKeys';
import { useTranslation } from './i18n';
import {
  classifyGlobalError,
  clearGlobalError,
  getGlobalError,
  setGlobalError,
  subscribeGlobalError,
} from './lib/globalError';

const AuthLayout = lazy(() =>
  import('./pages/Auth/AuthLayout').then((module) => ({ default: module.AuthLayout })),
);
const ProtectedRoute = lazy(() =>
  import('./components/ProtectedRoute').then((module) => ({ default: module.ProtectedRoute })),
);
const GlobalErrorPage = lazy(() =>
  import('./components/layout/GlobalErrorPage').then((module) => ({ default: module.GlobalErrorPage })),
);
const LandingPage = lazy(() =>
  import('./pages/Landing/LandingPage').then((module) => ({ default: module.LandingPage })),
);
const LoginPage = lazy(() =>
  import('./pages/Auth/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('./pages/Auth/RegisterPage').then((module) => ({ default: module.RegisterPage })),
);
const AppShell = lazy(() =>
  import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })),
);
const DashboardPage = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.DashboardPage })),
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

const AuthBootstrapContext = createContext(false);

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const response = await authApi.post('/refresh', null);

        if (response.status === 204) {
          clearAuth();
          queryClient.clear();
          return;
        }
        const data = response.data as { accessToken: string };
        setAccessToken(data.accessToken);
        const canonicalUser = await getMe();
        queryClient.setQueryData(queryKeys.profile(canonicalUser.id), canonicalUser);
        setUser(canonicalUser);
      } catch (error) {
        const kind = classifyGlobalError(error);
        if (kind === 'session-expired') {
          if (useAuthStore.getState().accessToken) setGlobalError(kind);
          queryClient.clear();
          clearAuth();
        } else {
          setGlobalError(kind, () => {
            clearGlobalError();
            setBootstrapped(false);
            setBootstrapAttempt((attempt) => attempt + 1);
          });
        }
      } finally {
        setBootstrapped(true);
      }
    })();
  }, [bootstrapAttempt, clearAuth, setAccessToken, setUser]);

  if (!bootstrapped && pathname !== '/') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-secondary-foreground">
      {t('Yükleniyor...')}
      </div>
    );
  }

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

  if (globalError && pathname !== '/') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <GlobalErrorPage kind={globalError} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<RootRoute hasGlobalError={Boolean(globalError)} />} />
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
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
