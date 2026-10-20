import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { CancelledError } from '@tanstack/react-query';
import { queryClient } from './react-query';
import type { CurrentUserProfile } from '../services/profile';
import { useAuthStore } from '../stores/authStore';
import { classifyGlobalError, setGlobalError } from './globalError';

const API_PREFIX = '/api/v1';
const apiOrigin = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
const directApiBaseURL = apiOrigin ? `${apiOrigin}${API_PREFIX}` : API_PREFIX;

export type LoginResponse = {
  user: CurrentUserProfile & { tenantName: string | null };
  accessToken: string;
};

export const authApi: AxiosInstance = axios.create({
  baseURL: `${API_PREFIX}/auth`,
  withCredentials: true,
  timeout: 10_000,
});

type AuthRequestConfig = InternalAxiosRequestConfig & {
  _authSessionGeneration?: number;
  _logoutBearer?: string | null;
};

authApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const request = config as AuthRequestConfig;
  const session = useAuthStore.getState();
  if (
    ['/refresh', '/logout'].includes(config.url ?? '') &&
    request._authSessionGeneration !== undefined &&
    request._authSessionGeneration !== session.sessionGeneration
  ) {
    throw new CancelledError({ silent: true });
  }
  if (config.url === '/logout') {
    if (request._logoutBearer) config.headers.set('Authorization', `Bearer ${request._logoutBearer}`);
    else config.headers.delete('Authorization');
  }
  return config;
});

const authPost = authApi.post.bind(authApi);
const serializedAuthPosts = new Set(['/refresh', '/login', '/register', '/logout']);
let authPostQueue: Promise<void> = Promise.resolve();

authApi.post = ((url, data, config) => {
  if (!serializedAuthPosts.has(url)) return authPost(url, data, config);

  const { accessToken, sessionGeneration } = useAuthStore.getState();
  const request = authPostQueue.then(() => {
    if (
      ['/refresh', '/logout'].includes(url) &&
      useAuthStore.getState().sessionGeneration !== sessionGeneration
    ) {
      throw new CancelledError({ silent: true });
    }
    const requestConfig = {
      ...config,
      _authSessionGeneration: sessionGeneration,
      ...(url === '/logout' ? { _logoutBearer: accessToken } : {}),
    } as Parameters<typeof authPost>[2];
    return authPost(url, data, requestConfig);
  });
  authPostQueue = request.then(() => undefined, () => undefined);
  return request;
}) as AxiosInstance['post'];

export const api: AxiosInstance = axios.create({
  baseURL: directApiBaseURL,
  withCredentials: false,
});

type ApiRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _sessionGeneration?: number;
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const session = useAuthStore.getState();
  const request = config as ApiRequestConfig;
  if (request._sessionGeneration !== undefined && request._sessionGeneration !== session.sessionGeneration) {
    throw new CancelledError({ silent: true });
  }
  request._sessionGeneration ??= session.sessionGeneration;
  const isAuthRequest = config.url?.startsWith('/auth/');
  if (session.accessToken && !isAuthRequest) config.headers.set('Authorization', `Bearer ${session.accessToken}`);
  return config;
});

let refreshInFlight: { generation: number; promise: Promise<string | null> } | null = null;

async function doRefresh(generation: number): Promise<string | null> {
  try {
    const response = await authApi.post('/refresh', null);
    if (useAuthStore.getState().sessionGeneration !== generation) return null;
    const token = response.data?.accessToken as string | undefined;
    if (response.status === 204 || typeof token !== 'string' || !token) {
      queryClient.clear();
      useAuthStore.getState().clearAuth();
      setGlobalError('sign-in-required');
      return null;
    }
    useAuthStore.getState().setAccessToken(token);
    return token;
  } catch (error) {
    if (useAuthStore.getState().sessionGeneration !== generation) return null;
    const kind = classifyGlobalError(error);
    setGlobalError(kind);
    if (kind === 'session-expired') {
      queryClient.clear();
      useAuthStore.getState().clearAuth();
    }
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as ApiRequestConfig | undefined;
    if (!original) return Promise.reject(error);
    const generation = original._sessionGeneration ?? useAuthStore.getState().sessionGeneration;
    if (generation !== useAuthStore.getState().sessionGeneration) {
      return Promise.reject(new CancelledError({ silent: true }));
    }
    const status = error.response?.status;
    const url = original.url ?? '';
    const isAuthRequest = url.startsWith('/auth/');
    if (status !== 401 || original._retry || isAuthRequest) return Promise.reject(error);

    original._retry = true;
    let refresh = refreshInFlight;
    if (!refresh || refresh.generation !== generation) {
      refresh = { generation, promise: doRefresh(generation) };
      refreshInFlight = refresh;
    }
    const token = await refresh.promise;
    if (refreshInFlight === refresh) refreshInFlight = null;
    if (generation !== useAuthStore.getState().sessionGeneration) {
      return Promise.reject(new CancelledError({ silent: true }));
    }
    if (!token) return Promise.reject(error);

    original.headers.set('Authorization', `Bearer ${token}`);
    return api(original);
  },
);

// Auth routes use same-origin authApi. All other API and upload routes use direct Render api.
export async function getMe(): Promise<CurrentUserProfile> {
  const response = await api.get<CurrentUserProfile>('/users/me');
  return response.data;
}
