import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthLayout } from './pages/Auth/AuthLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { RouteFallback } from './components/layout/RouteFallback';
import { useAuthStore } from './stores/authStore';
import { HelloTaskFlow } from './components/HelloTaskFlow';
import { getMe } from './lib/api';
import { queryClient } from './lib/react-query';

const LandingPage = lazy(() =>
  import('./pages/Landing/LandingPage').then((module) => ({ default: module.LandingPage })),
);
const LoginPage = lazy(() =>
  import('./pages/Auth/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('./pages/Auth/RegisterPage').then((module) => ({ default: module.RegisterPage })),
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
const CompanySettingsPage = lazy(() =>
  import('./pages/CompanySettings').then((module) => ({ default: module.CompanySettingsPage })),
);

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (response.status === 204) {
          clearAuth();
          queryClient.clear();
          return;
        }
        if (!response.ok) throw new Error('Auth refresh failed');

        const data = (await response.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        const canonicalUser = await getMe();
        setUser(canonicalUser);
      } catch {
        queryClient.clear();
        clearAuth();
      } finally {
        setBootstrapped(true);
      }
    })();
  }, [clearAuth, setAccessToken, setUser]);

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-secondary-foreground">
        Yükleniyor...
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthBootstrap>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route
              path="/"
              element={
                useAuthStore.getState().accessToken ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <LandingPage />
                )
              }
            />
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
                <Route path="/company/settings" element={<CompanySettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthBootstrap>
  );
}

export { HelloTaskFlow };
