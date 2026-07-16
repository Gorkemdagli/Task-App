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

/**
 * Auth bootstrap wrapper. Runs once on mount to refresh the access token
 * via the httpOnly refresh cookie, then mounts the router.
 *
 * Note: the "AppShell" function name here pre-dates the layout shell under
 * components/layout/AppShell.tsx. They live in different modules so there's
 * no naming collision; this one is intentionally local.
 */
function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          setAccessToken(data.accessToken);
          // Refresh response now includes user (matches login/register shape).
          // Older backends without user field: silently skip → store stays null.
          if (data.user) setUser(data.user);
        }
      } catch {
        // Session yok; user null kalır, login sayfası gösterilir.
      } finally {
        setBootstrapped(true);
      }
    })();
  }, [setAccessToken, setUser]);

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
