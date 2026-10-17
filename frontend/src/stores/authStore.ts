import { create } from 'zustand';

export interface AuthUser {
  id: string;
  displayId: string;
  email: string;
  fullName: string;
  role: 'companyAdmin' | 'member';
  // NULL = tenantless user (register'da companyName vermedi, henüz bir
  // şirkete dahil değil). Admin bu user'ı takıma eklediğinde tenantId set olur.
  tenantId: string | null;
  avatarUrl?: string | null;
  // Display name of the tenant (e.g. "Acme A.Ş."). Optional — populated
  // by login/me flows when backend returns it; null until then.
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  sessionGeneration: number;
  establishSession: (accessToken: string, user: AuthUser) => void;
  setAccessToken: (token: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  sessionGeneration: 0,
  establishSession: (accessToken, user) =>
    set((state) => ({
      accessToken,
      user,
      sessionGeneration: state.sessionGeneration + 1,
    })),
  setAccessToken: (token) => set({ accessToken: token }),
  setUser: (user) =>
    set((state) => ({
      user,
      sessionGeneration:
        state.user?.id !== user?.id || state.user?.tenantId !== user?.tenantId
          ? state.sessionGeneration + 1
          : state.sessionGeneration,
    })),
  clearAuth: () =>
    set((state) => ({
      accessToken: null,
      user: null,
      sessionGeneration: state.sessionGeneration + 1,
    })),
}));
