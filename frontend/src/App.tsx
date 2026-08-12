import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthLayout } from './pages/Auth/AuthLayout';
import { LoginPage } from './pages/Auth/LoginPage';
import { RegisterPage } from './pages/Auth/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/Dashboard';
import { TeamsPage } from './pages/Teams';
import { TeamDetailPage } from './pages/TeamDetail';
import { TasksPage } from './pages/Tasks';
import { TaskDetailPage } from './pages/TaskDetail';
import { ChatPage } from './pages/Chat';
import { ProfilePage } from './pages/Profile';
import { PermissionsPage } from './pages/Permissions';
import { CompanySettingsPage } from './pages/CompanySettings';
import { NotificationsPage } from './pages/Notifications';
import { LandingPage } from './pages/Landing/LandingPage';
import { useAuthStore } from './stores/authStore';
import { HelloTaskFlow } from './components/HelloTaskFlow';
import { getMe } from './lib/api';
import { queryClient } from './lib/react-query';

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
      </BrowserRouter>
    </AuthBootstrap>
  );
}

export { HelloTaskFlow };
