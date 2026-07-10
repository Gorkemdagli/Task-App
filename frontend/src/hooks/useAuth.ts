import { useAuthStore, type AuthUser } from '../stores/authStore';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const isAuthenticated = !!token;
  const isCompanyAdmin = user?.role === 'companyAdmin';
  const isTeamAdmin = user?.role === 'teamAdmin' || user?.role === 'companyAdmin';

  return {
    user,
    token,
    isAuthenticated,
    isCompanyAdmin,
    isTeamAdmin,
    setUser,
    clearAuth,
  } as {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    isCompanyAdmin: boolean;
    isTeamAdmin: boolean;
    setUser: (u: AuthUser | null) => void;
    clearAuth: () => void;
  };
}
export type { AuthUser };
