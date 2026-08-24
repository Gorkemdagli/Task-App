import type { Response } from 'express';
import { env } from '../env';
import { REFRESH_TOKEN_IDLE_TTL_SECONDS } from './jwt';

export const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_MAX_AGE_MS = REFRESH_TOKEN_IDLE_TTL_SECONDS * 1000;

const baseOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};

const clearCookieOptions = {
  httpOnly: baseOptions.httpOnly,
  secure: baseOptions.secure,
  sameSite: baseOptions.sameSite,
  path: baseOptions.path,
};

export function setRefreshCookie(
  res: Response,
  token: string,
  maxAgeMs: number = REFRESH_MAX_AGE_MS,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions,
    maxAge: Math.max(0, Math.floor(maxAgeMs)),
  });
}
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions);
}
