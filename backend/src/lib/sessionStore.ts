import { randomUUID } from 'crypto';
import { redis } from './redis';
import { verifyAccessToken, verifyRefreshToken } from './jwt';

const USER_SESSION_INDEX = (userId: string) => `user-sessions:${userId}`;
const ACCESS_SESSION_KEY = (jti: string) => `access-session:${jti}`;
const REFRESH_SESSION_KEY = (jti: string) => `session:${jti}`;

export type SessionRecord = { userId: string; familyId: string };

function remainingTtl(exp: number): number {
  return Math.max(1, exp - Math.floor(Date.now() / 1000));
}

export function accessSessionKey(jti: string): string {
  return ACCESS_SESSION_KEY(jti);
}

export function refreshSessionKey(jti: string): string {
  return REFRESH_SESSION_KEY(jti);
}

export async function registerIssuedTokens(
  accessToken: string,
  refreshToken: string,
  userId: string,
  familyId: string = randomUUID(),
): Promise<void> {
  const access = verifyAccessToken(accessToken);
  const refresh = verifyRefreshToken(refreshToken);
  const accessKey = ACCESS_SESSION_KEY(access.jti);
  const refreshKey = REFRESH_SESSION_KEY(refresh.jti);
  const indexKey = USER_SESSION_INDEX(userId);
  const value = JSON.stringify({ userId, familyId });
  const transaction = redis.multi();

  transaction.set(accessKey, value, 'EX', remainingTtl(access.exp));
  transaction.set(refreshKey, value, 'EX', remainingTtl(refresh.exp));
  transaction.sadd(indexKey, accessKey, refreshKey);
  transaction.expire(indexKey, remainingTtl(refresh.exp));
  await transaction.exec();
}

export async function getRefreshSession(jti: string): Promise<SessionRecord | null> {
  const value = await redis.get(REFRESH_SESSION_KEY(jti));
  if (!value) return null;
  try {
    return JSON.parse(value) as SessionRecord;
  } catch {
    return null;
  }
}

export async function hasAccessSession(jti: string): Promise<boolean> {
  return (await redis.exists(ACCESS_SESSION_KEY(jti))) === 1;
}

export async function removeSessionKeys(userId: string, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const transaction = redis.multi();
  transaction.del(...keys);
  transaction.srem(USER_SESSION_INDEX(userId), ...keys);
  await transaction.exec();
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const indexKey = USER_SESSION_INDEX(userId);
  const keys = await redis.smembers(indexKey);
  const transaction = redis.multi();
  if (keys.length) transaction.del(...keys);
  transaction.del(indexKey);
  await transaction.exec();
}
