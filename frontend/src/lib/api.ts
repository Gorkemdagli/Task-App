import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore, type AuthUser } from '../stores/authStore';

export function createApi(opts: { baseURL: string }): AxiosInstance {
  const api = axios.create({ baseURL: opts.baseURL, withCredentials: true });

  api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const t = useAuthStore.getState().accessToken;
    if (t) config.headers.set('Authorization', `Bearer ${t}`);
    return config;
  });

  let refreshInFlight: Promise<string | null> | null = null;
  async function doRefresh(): Promise<string | null> {
    try {
      const r = await axios.post('/api/v1/auth/refresh', null, { withCredentials: true });
      const tok = r.data.accessToken as string;
      useAuthStore.getState().setAccessToken(tok);
      return tok;
    } catch {
      useAuthStore.getState().clearAuth();
      return null;
    }
  }

  api.interceptors.response.use(
    (r) => r,
    async (error) => {
      const orig = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
      const status = error.response?.status;
      const url = orig?.url ?? '';
      const isAuth =
        url.includes('/auth/login') ||
        url.includes('/auth/refresh') ||
        url.includes('/auth/register');
      if (status !== 401 || orig._retry || isAuth) return Promise.reject(error);
      orig._retry = true;
      refreshInFlight ??= doRefresh();
      const tok = await refreshInFlight;
      refreshInFlight = null;
      if (!tok) {
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(error);
      }
      orig.headers.set('Authorization', `Bearer ${tok}`);
      return api(orig);
    },
  );

  return api;
}

export const api = createApi({ baseURL: '/api/v1' });

// TODO(Faz 4-Backend): Replace with GET /api/v1/users/me when backend ships.
// For now this returns the user already loaded by /auth/login. No network call.
export async function getMe(): Promise<AuthUser | null> {
  return useAuthStore.getState().user;
}
