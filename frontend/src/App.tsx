import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthLayout } from './pages/Auth/AuthLayout';
import { LoginPage } from './pages/Auth/LoginPage';
import { RegisterPage } from './pages/Auth/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { api } from './lib/api';
import { useAuthStore } from './stores/authStore';
import { HelloTaskFlow } from './components/HelloTaskFlow';

function DashboardPlaceholder() {
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-2xl font-bold">Dashboard Placeholder</h1>
      <p className="mt-2 text-secondary-foreground">Faz 3 layout burada olacak.</p>
    </div>
  );
}

function AppShell() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const token = useAuthStore((s) => s.accessToken);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.post('/auth/refresh');
        setAccessToken(r.data.accessToken);
      } catch {
        setAccessToken(null);
        setUser(null);
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

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route
            path="/login"
            element={token ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          />
          <Route
            path="/register"
            element={token ? <Navigate to="/dashboard" replace /> : <RegisterPage />}
          />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPlaceholder />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return <AppShell />;
}
export { HelloTaskFlow };
