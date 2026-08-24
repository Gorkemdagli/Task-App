import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../env';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_IDLE_TTL_SECONDS = 3 * 24 * 60 * 60;
export const AUTH_SESSION_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface TokenPayload {
  sub: string;
  // tenantId NULL olabilir (tenantless user); token'da bu şekilde taşınır.
  tenantId: string | null;
  type: 'access' | 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

function verify(token: string, secret: string): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload;
}

export function signAccessToken(userId: string, tenantId: string | null): string {
  return jwt.sign({ sub: userId, tenantId, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    jwtid: randomUUID(),
  });
}
export function signRefreshToken(
  userId: string,
  tenantId: string | null,
  expiresInSeconds: number = REFRESH_TOKEN_IDLE_TTL_SECONDS,
): string {
  return jwt.sign({ sub: userId, tenantId, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: expiresInSeconds,
    jwtid: randomUUID(),
  });
}
export function verifyAccessToken(token: string): TokenPayload {
  const p = verify(token, env.JWT_ACCESS_SECRET);
  if (p.type !== 'access') throw new Error('Invalid token type: expected access');
  return p;
}
export function verifyRefreshToken(token: string): TokenPayload {
  const p = verify(token, env.JWT_REFRESH_SECRET);
  if (p.type !== 'refresh') throw new Error('Invalid token type: expected refresh');
  return p;
}
