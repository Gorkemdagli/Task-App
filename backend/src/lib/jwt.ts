import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../env';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

export interface TokenPayload {
  sub: string;
  // tenantId NULL olabilir (tenantless user); token'da bu şekilde taşınır.
  tenantId: string | null;
  type: 'access' | 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

function sign(
  payload: Omit<TokenPayload, 'iat' | 'exp' | 'jti'>,
  secret: string,
  expiresIn: string,
): string {
  // jsonwebtoken v9 types: `expiresIn` is `StringValue | number`.
  // We accept loose `string` at the call site to avoid coupling call sites to the
  // template-literal `StringValue` type from the `ms` package.
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    jwtid: randomUUID(),
  });
}
function verify(token: string, secret: string): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload;
}

export function signAccessToken(userId: string, tenantId: string | null): string {
  return sign({ sub: userId, tenantId, type: 'access' }, env.JWT_ACCESS_SECRET, ACCESS_TTL);
}
export function signRefreshToken(userId: string, tenantId: string | null): string {
  return sign({ sub: userId, tenantId, type: 'refresh' }, env.JWT_REFRESH_SECRET, REFRESH_TTL);
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
