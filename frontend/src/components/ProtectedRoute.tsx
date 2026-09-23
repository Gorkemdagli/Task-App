import { Outlet } from 'react-router-dom';
import { GlobalErrorPage } from './layout/GlobalErrorPage';
import { useAuthStore } from '../stores/authStore';

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <GlobalErrorPage kind="sign-in-required" />;
  return <Outlet />;
}
