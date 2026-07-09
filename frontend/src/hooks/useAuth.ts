import { useAuthStore, type AuthUser } from '../stores/authStore';

export function useAuth() {
  return { user: useAuthStore((s) => s.user), setUser: useAuthStore((s) => s.setUser) };
}
export type { AuthUser };
