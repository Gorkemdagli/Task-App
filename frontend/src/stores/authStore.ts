import { create } from 'zustand';

export interface AuthUser {
  id: string;
  displayId: string;
  email: string;
  fullName: string;
  role: 'companyAdmin' | 'teamAdmin' | 'member';
  // NULL = tenantless user (register'da companyName vermedi, henüz bir
  // şirkete dahil değil). Admin bu user'ı takıma eklediğinde tenantId set olur.
  tenantId: string | null;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setAccessToken: (token: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAccessToken: (token) => set({ accessToken: token }),
  setUser: (user) => set({ user }),
  clearAuth: () => set({ accessToken: null, user: null }),
}));
