import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../env';

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

// TTL'ler literal olarak inline: @types/jsonwebtoken v9 `expiresIn`'i
// `StringValue | number` olarak istiyor. `string` parametre kabul eden bir
// helper yazmak cast gerektirir — 2 call site için over-engineering. Her sign
// doğrudan `jwt.sign`'i çağırır.
export function signAccessToken(userId: string, tenantId: string | null): string {
  return jwt.sign({ sub: userId, tenantId, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
    jwtid: randomUUID(),
  });
}
export function signRefreshToken(userId: string, tenantId: string | null): string {
  return jwt.sign({ sub: userId, tenantId, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
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
