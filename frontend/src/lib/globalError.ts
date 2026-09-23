export type GlobalErrorKind =
  | 'network'
  | 'session-expired'
  | 'sign-in-required'
  | 'access-denied'
  | 'not-found'
  | 'generic';

type ErrorResponse = { response?: { status?: unknown }; isAxiosError?: unknown };

let currentError: GlobalErrorKind | null = null;
let retryAction: (() => void) | null = null;
const listeners = new Set<() => void>();

export function classifyGlobalError(error: unknown): GlobalErrorKind {
  const candidate = error as ErrorResponse | null;
  const status = candidate?.response?.status;
  if (status === 401) return 'session-expired';
  if (status === 403) return 'access-denied';
  if (status === 404) return 'not-found';
  if (candidate?.isAxiosError === true && !candidate.response) return 'network';
  return 'generic';
}

export function reportGlobalError(error: unknown) {
  setGlobalError(classifyGlobalError(error));
}

export function setGlobalError(kind: GlobalErrorKind, retry?: () => void) {
  if (currentError) return;
  currentError = kind;
  retryAction = retry ?? null;
  listeners.forEach((listener) => listener());
}

export function clearGlobalError() {
  if (!currentError) return;
  currentError = null;
  retryAction = null;
  listeners.forEach((listener) => listener());
}

export function hasGlobalErrorRetry() {
  return retryAction !== null;
}

export function retryGlobalError() {
  retryAction?.();
}

export function getGlobalError() {
  return currentError;
}

export function subscribeGlobalError(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
