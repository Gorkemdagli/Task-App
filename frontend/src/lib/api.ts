import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { queryClient } from './react-query';
import { useAuthStore, type AuthUser } from '../stores/authStore';

const API_PREFIX = '/api/v1';
const apiOrigin = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
const directApiBaseURL = apiOrigin ? `${apiOrigin}${API_PREFIX}` : API_PREFIX;

export const authApi: AxiosInstance = axios.create({
  baseURL: `${API_PREFIX}/auth`,
  withCredentials: true,
});

authApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token && config.url === '/logout') config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

export const api: AxiosInstance = axios.create({
  baseURL: directApiBaseURL,
  withCredentials: false,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  const isAuthRequest = config.url?.startsWith('/auth/');
  if (token && !isAuthRequest) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  try {
    const response = await authApi.post('/refresh', null);
    const token = response.data.accessToken as string;
    useAuthStore.getState().setAccessToken(token);
    return token;
  } catch {
    queryClient.clear();
    useAuthStore.getState().clearAuth();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthRequest = url.startsWith('/auth/');
    if (status !== 401 || original._retry || isAuthRequest) return Promise.reject(error);

    original._retry = true;
    refreshInFlight ??= doRefresh();
    const token = await refreshInFlight;
    refreshInFlight = null;
    if (!token) {
      if (typeof window !== 'undefined') window.location.href = '/login';
      return Promise.reject(error);
    }

    original.headers.set('Authorization', `Bearer ${token}`);
    return api(original);
  },
);

// Auth routes use same-origin authApi. All other API and upload routes use direct Render api.
export async function getMe(): Promise<AuthUser> {
  const response = await api.get<AuthUser>('/users/me');
  return response.data;
}
