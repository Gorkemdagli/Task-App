import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { redis } from './redis';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt';
import {
  hasAccessSession,
  registerIssuedTokens,
  removeSessionKeys,
  revokeAllUserSessions,
} from './sessionStore';

async function cleanRedis() {
  const keys = await redis.keys('access-session:*');
  keys.push(...(await redis.keys('session:*')));
  keys.push(...(await redis.keys('user-sessions:*')));
  if (keys.length) await redis.del(...keys);
}

describe('sessionStore', () => {
  beforeEach(cleanRedis);

  it('indexes access and refresh sessions under user ID', async () => {
    const userId = randomUUID();
    const accessToken = signAccessToken(userId, null);
    const refreshToken = signRefreshToken(userId, null);
    const familyId = randomUUID();
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    await registerIssuedTokens(accessToken, refreshToken, userId, familyId, sessionExpiresAt);

    const accessJti = verifyAccessToken(accessToken).jti;
    const refreshJti = verifyRefreshToken(refreshToken).jti;
    expect(await hasAccessSession(accessJti)).toBe(true);
    expect(await redis.sismember(`user-sessions:${userId}`, `access-session:${accessJti}`)).toBe(1);
    expect(await redis.sismember(`user-sessions:${userId}`, `session:${refreshJti}`)).toBe(1);
    expect(JSON.parse((await redis.get(`session:${refreshJti}`))!)).toEqual({
      userId,
      familyId,
      sessionExpiresAt,
    });

    await removeSessionKeys(userId, [`session:${refreshJti}`]);
    expect(await redis.sismember(`user-sessions:${userId}`, `session:${refreshJti}`)).toBe(0);
  });

  it('revokes every indexed session for a user', async () => {
    const userId = randomUUID();
    const firstAccess = signAccessToken(userId, null);
    const firstRefresh = signRefreshToken(userId, null);
    const secondAccess = signAccessToken(userId, null);
    const secondRefresh = signRefreshToken(userId, null);
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    await registerIssuedTokens(firstAccess, firstRefresh, userId, randomUUID(), sessionExpiresAt);
    await registerIssuedTokens(secondAccess, secondRefresh, userId, randomUUID(), sessionExpiresAt);
    await revokeAllUserSessions(userId);

    expect(await hasAccessSession(verifyAccessToken(firstAccess).jti)).toBe(false);
    expect(await hasAccessSession(verifyAccessToken(secondAccess).jti)).toBe(false);
    expect(await redis.exists(`user-sessions:${userId}`)).toBe(0);
    expect(await redis.exists(`session:${verifyRefreshToken(firstRefresh).jti}`)).toBe(0);
    expect(await redis.exists(`session:${verifyRefreshToken(secondRefresh).jti}`)).toBe(0);
  });

  it('caps Redis session TTL at the earlier refresh expiry or absolute deadline', async () => {
    const refreshShortUser = randomUUID();
    const refreshShortAccess = signAccessToken(refreshShortUser, null);
    const refreshShortToken = signRefreshToken(refreshShortUser, null, 60);
    const refreshShortDeadline = Math.floor(Date.now() / 1000) + 60 * 60;

    await registerIssuedTokens(
      refreshShortAccess,
      refreshShortToken,
      refreshShortUser,
      randomUUID(),
      refreshShortDeadline,
    );

    const refreshShortJti = verifyRefreshToken(refreshShortToken).jti;
    expect(await redis.ttl(`session:${refreshShortJti}`)).toBeLessThanOrEqual(60);
    expect(await redis.ttl(`user-sessions:${refreshShortUser}`)).toBeLessThanOrEqual(60);

    const deadlineShortUser = randomUUID();
    const deadlineShortAccess = signAccessToken(deadlineShortUser, null);
    const deadlineShortToken = signRefreshToken(deadlineShortUser, null, 60 * 60);
    const deadlineShortDeadline = Math.floor(Date.now() / 1000) + 60;

    await registerIssuedTokens(
      deadlineShortAccess,
      deadlineShortToken,
      deadlineShortUser,
      randomUUID(),
      deadlineShortDeadline,
    );

    const deadlineShortJti = verifyRefreshToken(deadlineShortToken).jti;
    expect(await redis.ttl(`session:${deadlineShortJti}`)).toBeLessThanOrEqual(60);
    expect(await redis.ttl(`user-sessions:${deadlineShortUser}`)).toBeLessThanOrEqual(60);
  });
});
